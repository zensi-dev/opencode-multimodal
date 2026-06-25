import type { ModelEntry, ModelsData, ProviderConfig, ProviderConfigMap } from "./types.js"
import { isNonEmpty } from "./util.js"

export const DEFAULT_CUSTOM_PROVIDER_NPM = "@ai-sdk/openai-compatible"

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && isNonEmpty(value) ? value : undefined
}

function parseModels(value: unknown): Record<string, ModelEntry> | undefined {
  const models = asRecord(value)
  if (!models) return undefined

  const out: Record<string, ModelEntry> = {}
  for (const [id, rawModel] of Object.entries(models)) {
    if (!isNonEmpty(id)) continue
    const model = asRecord(rawModel)
    if (!model) continue

    const modelID = nonEmptyString(model.id) ?? id
    out[id] = { ...(model as unknown as ModelEntry), id: modelID }
  }

  return Object.keys(out).length > 0 ? out : undefined
}

function hasProviderConfigValue(config: ProviderConfig): boolean {
  return Boolean(config.apiKey || config.baseURL || config.npm || config.name || config.models)
}

export function providerConfigFromOpencodeConfig(config: unknown): ProviderConfigMap {
  const root = asRecord(config)
  const provider = asRecord(root?.provider)
  if (!provider) return {}

  const out: ProviderConfigMap = {}
  for (const [id, rawProvider] of Object.entries(provider)) {
    if (!isNonEmpty(id)) continue
    const entry = asRecord(rawProvider)
    if (!entry) continue

    const options = asRecord(entry.options)
    const providerConfig: ProviderConfig = {
      apiKey: nonEmptyString(options?.apiKey),
      baseURL: nonEmptyString(options?.baseURL),
      npm: nonEmptyString(entry.npm),
      name: nonEmptyString(entry.name),
      models: parseModels(entry.models),
    }

    if (hasProviderConfigValue(providerConfig)) out[id] = providerConfig
  }

  return out
}

export function mergeProviderConfigModels(data: ModelsData, providerConfig: ProviderConfigMap): ModelsData {
  const merged: ModelsData = { ...data }

  for (const [providerID, config] of Object.entries(providerConfig)) {
    const existing = merged[providerID]
    if (!existing && !config.models) continue

    merged[providerID] = {
      ...(existing ?? { id: providerID, env: [] }),
      id: existing?.id ?? providerID,
      env: existing?.env ?? [],
      npm: config.npm ?? existing?.npm ?? DEFAULT_CUSTOM_PROVIDER_NPM,
      name: config.name ?? existing?.name,
      models: config.models ? { ...(existing?.models ?? {}), ...config.models } : existing?.models,
    }
  }

  return merged
}
