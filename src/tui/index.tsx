/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"

import { listCredentialedProviders } from "../shared/auth"
import { defaultConfig, normalizeConfig, readConfig, writeConfig } from "../shared/config-store"
import { DEFAULT_PROMPTS } from "../shared/prompts"
import { resolvePluginConfigPathOption } from "../shared/paths"
import {
  getModel,
  listProviderModels,
  listProviders,
  modelDisplayName,
  modelSupportsModality,
  providerDisplayName,
  resolveModelsData,
} from "../shared/models-data"
import {
  HANDLED_MODALITIES,
  type FallbackEntry,
  type Modality,
  type ModelEntry,
  type ModelsData,
  type PluginConfig,
  type ProviderConfigMap,
  type ProviderEntry,
} from "../shared/types"
import { clamp, isNonEmpty } from "../shared/util"
import { isSupportedProviderPackage } from "../shared/provider-packages"

type Ctx = {
  api: TuiPluginApi
  config: PluginConfig
  configPath?: string
  data: ModelsData
  credentialed: Set<string>
}

type TuiOptions = {
  enabled?: boolean
  config_path?: string
}

type SelectOption = {
  title: string
  value: string
  description?: string
  category?: string
  disabled?: boolean
}

function loadCtx(api: TuiPluginApi, data: ModelsData, configPath?: string): Ctx {
  const providerConfig = providerConfigFromApi(api)
  return {
    api,
    config: readConfig(configPath),
    configPath,
    data,
    credentialed: listCredentialedProviders(data, { providerConfig }),
  }
}

function providerConfigFromApi(api: TuiPluginApi): ProviderConfigMap {
  const out: ProviderConfigMap = {}
  const provider = (api.state.config as { provider?: Record<string, unknown> } | undefined)?.provider
  if (!provider || typeof provider !== "object") return out
  for (const [id, value] of Object.entries(provider)) {
    const options = (value as { options?: Record<string, unknown> } | undefined)?.options
    if (!options || typeof options !== "object") continue
    out[id] = {
      apiKey: typeof options.apiKey === "string" ? options.apiKey : undefined,
      baseURL: typeof options.baseURL === "string" ? options.baseURL : undefined,
    }
  }
  return out
}

function persist(ctx: Ctx): void {
  writeConfig(ctx.config, ctx.configPath)
}

function toast(ctx: Ctx, message: string, variant: "info" | "success" | "warning" | "error" = "info"): void {
  try {
    ctx.api.ui.toast({ title: "opencode-multimodal", message, variant })
  } catch {
    // best-effort
  }
}

function describeEntry(ctx: Ctx, entry: FallbackEntry, modality: Modality): string {
  const model = getModel(ctx.data, entry.providerID, entry.modelID)
  const cred = ctx.credentialed.has(entry.providerID) ? "credentialed" : "no key found"
  const supports = modelSupportsModality(model, modality)
    ? `supports ${modality}`
    : "may not support this modality"
  return `${cred} · ${supports}`
}

function entryLabel(entry: FallbackEntry): string {
  return `${entry.providerID}/${entry.modelID}`
}

function entryDisplayName(ctx: Ctx, entry: FallbackEntry): string {
  const model = getModel(ctx.data, entry.providerID, entry.modelID)
  const provider = ctx.data[entry.providerID]
  const m = model ? modelDisplayName(model) : entry.modelID
  const p = provider ? providerDisplayName(provider) : entry.providerID
  return `${p} / ${m}`
}

function chainPreview(ctx: Ctx, chain: FallbackEntry[]): string {
  if (chain.length === 0) return "No models configured"
  const first = entryDisplayName(ctx, chain[0]!)
  if (chain.length === 1) return first
  if (chain.length === 2) return `${first} → ${entryDisplayName(ctx, chain[1]!)}`
  return `${first} +${chain.length - 1} more`
}

// ---- Overview -------------------------------------------------------------

function openMain(ctx: Ctx): void {
  const api = ctx.api
  const DialogSelect = api.ui.DialogSelect
  const config = ctx.config
  const options: SelectOption[] = []

  options.push({
    title: `Plugin enabled: ${config.enabled ? "on" : "off"}`,
    value: "__master",
    description: "Master switch — attachments routed to fallback when on",
    category: "General",
  })

  for (const modality of HANDLED_MODALITIES) {
    const entry = config.modalities[modality]
    const state = !entry.enabled ? "off" : entry.chain.length === 0 ? "no models" : "on"
    options.push({
      title: `${modality.toUpperCase().padEnd(5)}  [${state}]  ${entry.chain.length} model${entry.chain.length === 1 ? "" : "s"}`,
      value: `modality:${modality}`,
      description: chainPreview(ctx, entry.chain),
      category: "Modalities",
    })
  }

  options.push({
    title: "Auto-suggest chains",
    value: "__suggest",
    description: "Fill empty chains with cheapest credentialed model",
    category: "General",
  })
  options.push({
    title: "Settings…",
    value: "__settings",
    description: "Concurrency, timeout, cache TTL, toast",
    category: "General",
  })
  options.push({ title: "Done", value: "__done", description: "Save and close" })

  api.ui.dialog.setSize("large")
  api.ui.dialog.replace(() => (
    <DialogSelect
      title="Multimodal — Configure settings"
      options={options}
      placeholder="Nothing ships by default. Pick a modality to add fallback models."
      onSelect={(option) => {
        const value = (option as SelectOption).value
        if (value === "__master") {
          config.enabled = !config.enabled
          persist(ctx)
          openMain(ctx)
        } else if (value === "__suggest") {
          autoSuggest(ctx)
          openMain(ctx)
        } else if (value === "__settings") {
          openSettings(ctx)
        } else if (value === "__done") {
          persist(ctx)
          api.ui.dialog.clear()
          toast(ctx, "Configuration saved", "success")
        } else if (value.startsWith("modality:")) {
          openModality(ctx, value.slice("modality:".length) as Modality)
        }
      }}
    />
  ))
}

// ---- Per-modality chain editor -------------------------------------------

function openModality(ctx: Ctx, modality: Modality): void {
  const api = ctx.api
  const DialogSelect = api.ui.DialogSelect
  const entry = ctx.config.modalities[modality]
  const options: SelectOption[] = []

  options.push({
    title: `Modality enabled: ${entry.enabled ? "on" : "off"}`,
    value: "__toggle",
    description: "When off, this modality is ignored",
  })
  options.push({
    title: "Add model…",
    value: "__add",
    description: "Pick a provider, then a model",
  })
  options.push({
    title: "Edit analysis prompt…",
    value: "__prompt",
    description: entry.prompt ? `Custom: ${entry.prompt.slice(0, 60)}…` : "Using the built-in default prompt",
  })

  entry.chain.forEach((model, index) => {
    options.push({
      title: `${index + 1}. ${entryDisplayName(ctx, model)}`,
      value: `entry:${index}`,
      description: describeEntry(ctx, model, modality),
      category: index === 0 ? "Primary (used first)" : "Fallback order",
    })
  })

  options.push({ title: "← Back to overview", value: "__back" })

  api.ui.dialog.setSize("large")
  api.ui.dialog.replace(() => (
    <DialogSelect
      title={`${modality.toUpperCase()} fallback hierarchy`}
      options={options}
      onSelect={(option) => {
        const value = (option as SelectOption).value
        if (value === "__toggle") {
          entry.enabled = !entry.enabled
          persist(ctx)
          openModality(ctx, modality)
        } else if (value === "__add") {
          openAddProvider(ctx, modality)
        } else if (value === "__prompt") {
          openEditPrompt(ctx, modality)
        } else if (value === "__back") {
          openMain(ctx)
        } else if (value.startsWith("entry:")) {
          openEntry(ctx, modality, Number(value.slice("entry:".length)))
        }
      }}
    />
  ))
}

function openEntry(ctx: Ctx, modality: Modality, index: number): void {
  const api = ctx.api
  const DialogSelect = api.ui.DialogSelect
  const chain = ctx.config.modalities[modality].chain
  const target = chain[index]

  if (!target) {
    openModality(ctx, modality)
    return
  }

  const options: SelectOption[] = [
    { title: "Move up", value: "up", description: "Use this model earlier", disabled: index === 0 },
    {
      title: "Move down",
      value: "down",
      description: "Use this model later",
      disabled: index === chain.length - 1,
    },
    { title: "Remove from chain", value: "remove", description: `Remove ${entryDisplayName(ctx, target)}.` },
    { title: "← Back", value: "back" },
  ]

  api.ui.dialog.setSize("medium")
  api.ui.dialog.replace(() => (
    <DialogSelect
      title={entryDisplayName(ctx, target)}
      options={options}
      onSelect={(option) => {
        const value = (option as SelectOption).value
        if (value === "up" && index > 0) {
          const above = chain[index - 1]
          if (above) {
            chain[index - 1] = target
            chain[index] = above
          }
        } else if (value === "down" && index < chain.length - 1) {
          const below = chain[index + 1]
          if (below) {
            chain[index + 1] = target
            chain[index] = below
          }
        } else if (value === "remove") {
          chain.splice(index, 1)
        }
        if (value !== "back") persist(ctx)
        openModality(ctx, modality)
      }}
    />
  ))
}

// ---- Add flow -------------------------------------------------------------

function openAddProvider(ctx: Ctx, modality: Modality): void {
  const api = ctx.api
  const DialogSelect = api.ui.DialogSelect

  const providers = listProviders(ctx.data)
    .filter(
      (provider) =>
        provider.id &&
        provider.models &&
        isSupportedProviderPackage(provider.npm) &&
        hasModelForModality(provider, modality),
    )
    .sort((a, b) => {
      const ac = ctx.credentialed.has(a.id) ? 0 : 1
      const bc = ctx.credentialed.has(b.id) ? 0 : 1
      if (ac !== bc) return ac - bc
      return providerDisplayName(a).localeCompare(providerDisplayName(b))
    })

  const options: SelectOption[] = providers.map((provider) => ({
    title: providerDisplayName(provider),
    value: provider.id,
    description: `${ctx.credentialed.has(provider.id) ? "✓ credentialed" : "⚠ no key"} · ${provider.npm ?? "no npm package"}`,
    category: ctx.credentialed.has(provider.id) ? "Credentialed" : "No key set",
  }))

  options.push({ title: "← Back", value: "__back" })

  api.ui.dialog.setSize("large")
  api.ui.dialog.replace(() => (
    <DialogSelect
      title={`Pick a provider for ${modality.toUpperCase()}`}
      options={options}
      placeholder="Credentialed providers are listed first."
      onSelect={(option) => {
        const value = (option as SelectOption).value
        if (value === "__back") openModality(ctx, modality)
        else openAddModel(ctx, modality, value)
      }}
    />
  ))
}

function openAddModel(ctx: Ctx, modality: Modality, providerID: string): void {
  const api = ctx.api
  const DialogSelect = api.ui.DialogSelect

  const models = listProviderModels(ctx.data, providerID)
    .filter((model) => modelSupportsModality(model, modality))
    .sort((a, b) => costOf(a) - costOf(b) || ctxSize(b) - ctxSize(a))

  const options: SelectOption[] = models.map((model) => ({
    title: modelDisplayName(model),
    value: model.id,
    description: `${costDescription(model)} · ${ctxDescription(model)}`,
  }))

  options.push({ title: "← Back", value: "__back" })

  api.ui.dialog.setSize("large")
  api.ui.dialog.replace(() => (
    <DialogSelect
      title={`Pick a model — ${providerDisplayName(ctx.data[providerID]!)} / ${modality.toUpperCase()}`}
      options={options}
      placeholder="Sorted by cheapest input cost."
      onSelect={(option) => {
        const value = (option as SelectOption).value
        if (value === "__back") {
          openAddProvider(ctx, modality)
          return
        }
        ctx.config.modalities[modality].chain.push({ providerID, modelID: value })
        persist(ctx)
        const addedModel = getModel(ctx.data, providerID, value)
        const addedName = addedModel ? modelDisplayName(addedModel) : value
        toast(ctx, `Added ${providerDisplayName(ctx.data[providerID]!)} / ${addedName}`, "success")
        openModality(ctx, modality)
      }}
    />
  ))
}

function openEditPrompt(ctx: Ctx, modality: Modality): void {
  const api = ctx.api
  const DialogPrompt = api.ui.DialogPrompt
  const entry = ctx.config.modalities[modality]
  const current = isNonEmpty(entry.prompt) ? entry.prompt : DEFAULT_PROMPTS[modality]

  api.ui.dialog.setSize("large")
  api.ui.dialog.replace(() => (
    <DialogPrompt
      title={`Analysis prompt — ${modality.toUpperCase()}`}
      value={current}
      onConfirm={(value) => {
        const trimmed = value.trim()
        entry.prompt = trimmed && trimmed !== DEFAULT_PROMPTS[modality] ? trimmed : null
        persist(ctx)
        openModality(ctx, modality)
      }}
      onCancel={() => openModality(ctx, modality)}
    />
  ))
}

// ---- Settings -------------------------------------------------------------

function openSettings(ctx: Ctx): void {
  const api = ctx.api
  const DialogSelect = api.ui.DialogSelect
  const settings = ctx.config.settings

  const options: SelectOption[] = [
    {
      title: `Concurrency: ${settings.concurrency}`,
      value: "concurrency",
      description: "Max parallel fallback calls per turn",
    },
    {
      title: `Per-call timeout: ${settings.per_call_timeout_ms} ms`,
      value: "per_call_timeout_ms",
      description: "Abort a single fallback call after this many ms",
    },
    {
      title: `Cache TTL: ${Math.round(settings.cache_ttl_ms / 60000)} min`,
      value: "cache_ttl_ms",
      description: "How long analysed attachments are reused",
    },
    {
      title: `Toast on missing fallback: ${settings.toast_on_missing_fallback ? "on" : "off"}`,
      value: "toast",
      description: "Warn when no credentialed fallback resolves",
    },
    { title: "← Back to overview", value: "back" },
  ]

  api.ui.dialog.setSize("medium")
  api.ui.dialog.replace(() => (
    <DialogSelect
      title="Multimodal settings"
      options={options}
      onSelect={(option) => {
        const value = (option as SelectOption).value
        if (value === "back") {
          openMain(ctx)
        } else if (value === "toast") {
          settings.toast_on_missing_fallback = !settings.toast_on_missing_fallback
          persist(ctx)
          openSettings(ctx)
        } else {
          editNumber(
            ctx,
            value as keyof Pick<typeof settings, "concurrency" | "per_call_timeout_ms" | "cache_ttl_ms">,
          )
        }
      }}
    />
  ))
}

function editNumber(ctx: Ctx, field: "concurrency" | "per_call_timeout_ms" | "cache_ttl_ms"): void {
  const api = ctx.api
  const DialogPrompt = api.ui.DialogPrompt
  const settings = ctx.config.settings
  const bounds = {
    concurrency: { min: 1, max: 16, label: "Concurrency (1-16)" },
    per_call_timeout_ms: { min: 1000, max: 300000, label: "Per-call timeout in ms (1000-300000)" },
    cache_ttl_ms: { min: 0, max: 86400000, label: "Cache TTL in ms (0 to disable)" },
  }[field]
  const current = String(settings[field])

  api.ui.dialog.setSize("medium")
  api.ui.dialog.replace(() => (
    <DialogPrompt
      title={bounds.label}
      value={current}
      onConfirm={(value) => {
        const parsed = Number(value.trim())
        if (!Number.isFinite(parsed)) {
          toast(ctx, "Not a number", "error")
          openSettings(ctx)
          return
        }
        settings[field] = clamp(Math.round(parsed), bounds.min, bounds.max)
        persist(ctx)
        openSettings(ctx)
      }}
      onCancel={() => openSettings(ctx)}
    />
  ))
}

// ---- Auto-suggest ---------------------------------------------------------

function autoSuggest(ctx: Ctx): void {
  let added = 0
  for (const modality of HANDLED_MODALITIES) {
    const entry = ctx.config.modalities[modality]
    if (entry.chain.length > 0) continue
    const pick = cheapestCredentialed(ctx, modality)
    if (pick) {
      entry.chain.push(pick)
      added++
    }
  }
  if (added > 0) {
    persist(ctx)
    toast(ctx, `Suggested ${added} model(s)`, "success")
  } else {
    toast(ctx, "No credentialed multimodal models found to suggest", "warning")
  }
}

function cheapestCredentialed(ctx: Ctx, modality: Modality): FallbackEntry | null {
  let best: { entry: FallbackEntry; cost: number; context: number } | null = null
  for (const provider of listProviders(ctx.data)) {
    if (!ctx.credentialed.has(provider.id)) continue
    if (!isSupportedProviderPackage(provider.npm)) continue
    for (const model of listProviderModels(ctx.data, provider.id)) {
      if (!modelSupportsModality(model, modality)) continue
      const cost = costOf(model)
      const context = ctxSize(model)
      if (!best || cost < best.cost || (cost === best.cost && context > best.context)) {
        best = { entry: { providerID: provider.id, modelID: model.id }, cost, context }
      }
    }
  }
  return best?.entry ?? null
}

// ---- helpers --------------------------------------------------------------

function hasModelForModality(provider: ProviderEntry, modality: Modality): boolean {
  return Object.values(provider.models ?? {}).some((model) => modelSupportsModality(model, modality))
}

function costOf(model: ModelEntry): number {
  const value = model.cost?.input
  return typeof value === "number" && Number.isFinite(value) ? value : Number.POSITIVE_INFINITY
}

function ctxSize(model: ModelEntry): number {
  const value = model.limit?.context
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function costDescription(model: ModelEntry): string {
  const value = model.cost?.input
  if (typeof value !== "number" || !Number.isFinite(value)) return "cost unknown"
  if (value === 0) return "free input"
  return `$${value}/M in`
}

function ctxDescription(model: ModelEntry): string {
  const value = model.limit?.context
  if (typeof value !== "number" || !Number.isFinite(value)) return "context unknown"
  return `${Math.round(value / 1000)}k ctx`
}

// ---- Plugin entry ---------------------------------------------------------

const MULTIMODAL_COMMAND = "opencode-multimodal:open"

async function openConfig(api: TuiPluginApi, configPath?: string): Promise<void> {
  const data = await resolveModelsData()
  if (!data) {
    api.ui.dialog.setSize("medium")
    api.ui.dialog.replace(() => (
      <api.ui.DialogAlert
        title="Multimodal unavailable"
        message="Could not load opencode's models.json cache. Start opencode once to populate it, then reopen /multimodal."
        onConfirm={() => api.ui.dialog.clear()}
      />
    ))
    return
  }
  const ctx = loadCtx(api, data, configPath)
  if (Object.keys(ctx.config.modalities).length === 0) {
    ctx.config = normalizeConfig(defaultConfig())
  }
  openMain(ctx)
}

// Registers the `/multimodal` slash command via the modern keymap API. In
// opencode 1.17 the legacy `api.command` bridge is no longer wired at runtime
// (its type is optional), so this must go through `api.keymap.registerLayer`.
const tui: TuiPlugin = async (api, rawOptions) => {
  const options = (rawOptions ?? {}) as TuiOptions
  if (options?.enabled === false) return

  const configPath = resolvePluginConfigPathOption(options.config_path)

  api.keymap.registerLayer({
    commands: [
      {
        name: MULTIMODAL_COMMAND,
        title: "Multimodal: Configure settings",
        description: "Configure multimodal image / pdf / audio settings",
        category: "Multimodal",
        namespace: "palette",
        slashName: "multimodal",
        run: () => openConfig(api, configPath),
      },
    ],
  })
}

const plugin: TuiPluginModule = {
  id: "opencode-multimodal",
  tui,
}

export default plugin
export { tui }
