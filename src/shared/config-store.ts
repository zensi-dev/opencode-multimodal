import fsSync from "node:fs"
import path from "node:path"
import { pluginConfigPath } from "./paths.js"
import { DEFAULT_PROMPTS } from "./prompts.js"
import {
  HANDLED_MODALITIES,
  isModality,
  type Modality,
  type ModalityConfig,
  type PluginConfig,
} from "./types.js"
import { isNonEmpty } from "./util.js"

export const CONFIG_VERSION = 1

export function defaultConfig(): PluginConfig {
  const modalities = {
    image: emptyModality(),
    pdf: emptyModality(),
    audio: emptyModality(),
    video: emptyModality(false),
  } as Record<Modality, ModalityConfig>
  return {
    version: CONFIG_VERSION,
    enabled: true,
    modalities,
    settings: {
      cache_ttl_ms: 30 * 60 * 1000,
      concurrency: 3,
      per_call_timeout_ms: 30_000,
      toast_on_missing_fallback: true,
    },
  }
}

function emptyModality(enabled = true): ModalityConfig {
  return { enabled, chain: [], prompt: null }
}

function isValidEntry(value: unknown): value is { providerID: string; modelID: string } {
  if (!value || typeof value !== "object") return false
  const entry = value as Record<string, unknown>
  return typeof entry.providerID === "string" && typeof entry.modelID === "string"
}

export function normalizeConfig(input: unknown): PluginConfig {
  const out = defaultConfig()
  if (!input || typeof input !== "object") return out
  const config = input as Partial<PluginConfig>
  if (config.enabled === false) out.enabled = false
  if (config.settings && typeof config.settings === "object") {
    const settings = config.settings as Record<string, unknown>
    out.settings.concurrency = intSetting(settings.concurrency, out.settings.concurrency, 1, 16)
    out.settings.per_call_timeout_ms = intSetting(
      settings.per_call_timeout_ms,
      out.settings.per_call_timeout_ms,
      1000,
      300000,
    )
    out.settings.cache_ttl_ms = intSetting(settings.cache_ttl_ms, out.settings.cache_ttl_ms, 0, 86400000)
    if (typeof settings.toast_on_missing_fallback === "boolean") {
      out.settings.toast_on_missing_fallback = settings.toast_on_missing_fallback
    }
  }
  if (config.modalities && typeof config.modalities === "object") {
    for (const key of Object.keys(config.modalities)) {
      if (!isModality(key)) continue
      const incoming = (config.modalities as Record<string, unknown>)[key]
      if (!incoming || typeof incoming !== "object") continue
      const modality = incoming as Record<string, unknown>
      const normalized: ModalityConfig = {
        enabled: modality.enabled !== false,
        chain: Array.isArray(modality.chain) ? modality.chain.filter(isValidEntry) : [],
        prompt: typeof modality.prompt === "string" ? modality.prompt : null,
      }
      out.modalities[key] = normalized
    }
  }
  return out
}

function intSetting(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

export function readConfig(filePath: string = pluginConfigPath()): PluginConfig {
  try {
    const raw = fsSync.readFileSync(filePath, "utf8")
    return normalizeConfig(JSON.parse(raw))
  } catch {
    return defaultConfig()
  }
}

export function writeConfig(config: PluginConfig, filePath: string = pluginConfigPath()): void {
  const dir = path.dirname(filePath)
  try {
    fsSync.mkdirSync(dir, { recursive: true })
  } catch {
    // directory may already exist
  }
  const tmp = `${filePath}.tmp`
  fsSync.writeFileSync(tmp, JSON.stringify(config, null, 2))
  fsSync.renameSync(tmp, filePath)
}

export function promptFor(config: PluginConfig, modality: Modality): string {
  const custom = config.modalities[modality]?.prompt
  return isNonEmpty(custom) ? custom : DEFAULT_PROMPTS[modality]
}

export function modalityChain(config: PluginConfig, modality: Modality) {
  return config.modalities[modality]?.chain ?? []
}

export function isModalityActive(config: PluginConfig, modality: Modality): boolean {
  return Boolean(
    config.enabled && config.modalities[modality]?.enabled && modalityChain(config, modality).length > 0,
  )
}

export function activeModalities(config: PluginConfig): Modality[] {
  return HANDLED_MODALITIES.filter((modality) => isModalityActive(config, modality))
}
