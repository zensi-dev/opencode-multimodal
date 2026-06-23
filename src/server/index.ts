import type { Hooks, Plugin, PluginInput, PluginOptions } from "@opencode-ai/plugin"

import { listCredentialedProviders, resolveKey } from "../shared/auth"
import { isModalityActive, readConfig } from "../shared/config-store"
import { resolveModelsData, supportedInputModalities } from "../shared/models-data"
import { DEFAULT_PROMPTS } from "../shared/prompts"
import { pluginConfigPath, resolvePluginConfigPathOption } from "../shared/paths"
import {
  HANDLED_MODALITIES,
  type Modality,
  type ModelsData,
  type ProviderConfigMap,
  type SelectedFallback,
} from "../shared/types"
import { errorMessage, hashPart } from "../shared/util"
import { DescriptionCache } from "./cache"
import { describe, DescribeError } from "./describe"
import { selectFallback } from "./fallback"
import {
  distinctModalities,
  findUnsupportedAttachments,
  replaceWithText,
  type MessageContainer,
  type UnsupportedHit,
} from "./parts"

type ServerOptions = {
  log_level?: "debug" | "info" | "warn" | "error"
  config_path?: string
}

type ActiveModel = { providerID: string; modelID: string; resolvedAt: number }

type LogLevel = "debug" | "info" | "warn" | "error"

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

function createLimiter(max: number) {
  if (max < 1) max = 1
  let active = 0
  const queue: Array<() => void> = []
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const exec = async () => {
        active++
        try {
          resolve(await fn())
        } catch (error) {
          reject(error)
        } finally {
          active--
          drain()
        }
      }
      const drain = () => {
        while (active < max && queue.length > 0) queue.shift()?.()
      }
      if (active < max) exec()
      else queue.push(exec)
    })
}

const server: Plugin = async (input: PluginInput, rawOptions?: PluginOptions) => {
  const client = input.client
  const options = (rawOptions ?? {}) as ServerOptions
  const minLevel = LEVELS[options.log_level ?? "info"] ?? LEVELS.info
  const configPath = resolvePluginConfigPathOption(options.config_path)

  let data: ModelsData | null = null
  let providerConfig: ProviderConfigMap = {}
  const activeModels = new Map<string, ActiveModel>()
  const caches = new Map<string, DescriptionCache>()
  const toastShown = new Set<string>()

  const log = (level: LogLevel, message: string, extra?: Record<string, unknown>) => {
    if (LEVELS[level] < minLevel) return
    try {
      const result = client.app.log({
        body: { service: "opencode-multimodal", level, message, extra },
      }) as unknown
      Promise.resolve(result).catch(() => {})
    } catch {
      // logging is best-effort
    }
  }

  const toast = (message: string, variant: "info" | "warning" | "error" = "info") => {
    try {
      const result = client.tui.showToast({
        body: { title: "opencode-multimodal", message, variant },
      }) as unknown
      Promise.resolve(result).catch(() => {})
    } catch {
      // toast is best-effort
    }
  }

  const getData = async (): Promise<ModelsData | null> => {
    if (data !== null) return data
    data = await resolveModelsData()
    if (!data) log("warn", "models data unavailable; capability detection disabled")
    return data
  }

  const cacheFor = (sessionID: string, ttlMs: number): DescriptionCache => {
    let cache = caches.get(sessionID)
    if (!cache || cache.size === 0) {
      cache = new DescriptionCache(ttlMs)
      caches.set(sessionID, cache)
    }
    return cache
  }

  const runTransform = async (messages: MessageContainer[]) => {
    const config = readConfig(configPath ?? pluginConfigPath())
    if (!config.enabled) return

    const sessionID = messages[0]?.info?.sessionID
    if (!sessionID) return

    const active = activeModels.get(sessionID)
    if (!active) {
      // No model stashed yet for this session — safe no-op.
      return
    }

    const modelsData = await getData()
    if (!modelsData) return

    const supported = supportedInputModalities(modelsData, active.providerID, active.modelID)

    // Modalities the user has configured a chain for, minus the ones the active model already handles.
    const missing = new Set<Modality>()
    for (const modality of HANDLED_MODALITIES) {
      if (!isModalityActive(config, modality)) continue
      if (supported.has(modality)) continue
      missing.add(modality)
    }
    if (missing.size === 0) return

    const hits = findUnsupportedAttachments(messages, missing)
    if (hits.length === 0) return

    const credentialed = listCredentialedProviders(modelsData, { providerConfig })

    // Resolve one fallback per modality that needs one.
    const plan = new Map<Modality, SelectedFallback>()
    const unresolvedModalities = new Set<Modality>()
    for (const modality of distinctModalities(hits)) {
      const fallback = selectFallback(modelsData, config, credentialed, modality, providerConfig)
      if (fallback) plan.set(modality, fallback)
      else unresolvedModalities.add(modality)
    }

    if (unresolvedModalities.size > 0) {
      const list = [...unresolvedModalities].join(", ")
      log("warn", `no credentialed fallback for modalities: ${list}`)
      if (config.settings.toast_on_missing_fallback) {
        const key = `${sessionID}:${list}`
        if (!toastShown.has(key)) {
          toastShown.add(key)
          toast(`No credentialed fallback model for ${list}. Configure with /multimodal.`, "warning")
        }
      }
    }

    if (plan.size === 0) return // nothing to do; opencode's default error text applies

    const cache = cacheFor(sessionID, config.settings.cache_ttl_ms)
    const descriptions = new Map<string, string>()
    const tasks: Array<Promise<void>> = []
    const limit = createLimiter(Math.max(1, config.settings.concurrency))

    for (const hit of hits) {
      const fallback = plan.get(hit.modality)
      if (!fallback) continue
      const key = hashPart(hit.part.mime, hit.part.url)
      if (cache.get(key)) {
        descriptions.set(key, cache.get(key)!)
        continue
      }
      const resolvedKey = resolveKey(modelsData, fallback.providerID, { providerConfig })
      if (!resolvedKey) continue
      const prompt = config.modalities[hit.modality]?.prompt || DEFAULT_PROMPTS[hit.modality]
      tasks.push(
        limit(async () => {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), config.settings.per_call_timeout_ms)
          try {
            const text = await describe({
              fallback,
              modality: hit.modality,
              mime: hit.part.mime,
              url: hit.part.url,
              prompt,
              key: resolvedKey,
              signal: controller.signal,
            })
            cache.set(key, text)
            descriptions.set(key, text)
            log("debug", `${hit.modality} analysed`, {
              provider: fallback.providerID,
              model: fallback.modelID,
              source: hit.part.filename || "inline",
            })
          } catch (error) {
            if (error instanceof DescribeError) {
              log("warn", error.message)
            } else {
              log("warn", `${hit.modality} describe failed: ${errorMessage(error)}`)
            }
            // leave this part untouched; opencode's default error substitution handles it
          } finally {
            clearTimeout(timer)
          }
        }),
      )
    }

    if (tasks.length > 0) await Promise.all(tasks)

    cache.cleanup()

    replaceWithText(
      messages,
      hits,
      (hit: UnsupportedHit) => descriptions.get(hashPart(hit.part.mime, hit.part.url)),
      (modality: Modality) => plan.get(modality),
    )
  }

  const hooks: Hooks = {
    config: (cfg) => {
      providerConfig = {}
      const provider = (cfg as { provider?: Record<string, unknown> }).provider
      if (provider && typeof provider === "object") {
        for (const [id, value] of Object.entries(provider)) {
          const v = value as { npm?: string; options?: Record<string, unknown> }
          const optionsValue = v?.options
          providerConfig[id] = {
            apiKey: typeof optionsValue?.apiKey === "string" ? optionsValue.apiKey : undefined,
            baseURL: typeof optionsValue?.baseURL === "string" ? optionsValue.baseURL : undefined,
            npm: typeof v.npm === "string" ? v.npm : undefined,
          }
        }
      }
      log("debug", "config loaded", { providers: Object.keys(providerConfig).length })
      return Promise.resolve()
    },

    "chat.message": (input) => {
      const model = input.model
      if (model?.providerID && model?.modelID) {
        activeModels.set(input.sessionID, {
          providerID: model.providerID,
          modelID: model.modelID,
          resolvedAt: Date.now(),
        })
      }
      return Promise.resolve()
    },

    "chat.params": (input) => {
      const model = input.model
      if (model?.id) {
        const [providerID, modelID] = String(model.id).split("/")
        if (providerID && modelID) {
          activeModels.set(input.sessionID, {
            providerID,
            modelID,
            resolvedAt: Date.now(),
          })
        }
      }
      return Promise.resolve()
    },

    "experimental.chat.messages.transform": (_input, output) => {
      return runTransform(output.messages as unknown as MessageContainer[])
    },

    event: (input) => {
      const event = input.event as { type?: string; properties?: { id?: string } }
      if (event.type === "session.deleted") {
        const id = event.properties?.id
        if (id) {
          activeModels.delete(id)
          caches.delete(id)
          for (const key of [...toastShown]) {
            if (key.startsWith(`${id}:`)) toastShown.delete(key)
          }
        }
      }
      return Promise.resolve()
    },
  }

  log("info", "plugin loaded (server-side); configure fallbacks with /multimodal")
  return hooks
}

const plugin = {
  id: "opencode-multimodal",
  server,
}

export default plugin
export { server }
