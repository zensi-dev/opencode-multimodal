export type Modality = "image" | "pdf" | "audio" | "video"

export const HANDLED_MODALITIES: readonly Modality[] = ["image", "pdf", "audio"]
export const ALL_MODALITIES: readonly Modality[] = ["image", "pdf", "audio", "video"]

export function isModality(value: unknown): value is Modality {
  return value === "image" || value === "pdf" || value === "audio" || value === "video"
}

export type FallbackEntry = { providerID: string; modelID: string }

export type ModalityConfig = {
  enabled: boolean
  chain: FallbackEntry[]
  prompt: string | null
}

export type PluginSettings = {
  cache_ttl_ms: number
  concurrency: number
  per_call_timeout_ms: number
  toast_on_missing_fallback: boolean
}

export type PluginConfig = {
  version: 1
  enabled: boolean
  modalities: Record<Modality, ModalityConfig>
  settings: PluginSettings
}

export type SelectedFallback = {
  providerID: string
  modelID: string
  npm: string
  env: string[]
}

export type ResolvedKey = { key: string; baseURL?: string }

export type ModelEntry = {
  id: string
  name?: string
  attachment?: boolean
  modalities?: { input?: string[]; output?: string[] }
  limit?: { context?: number; output?: number }
  cost?: { input?: number; output?: number; cache_read?: number }
}

export type ProviderEntry = {
  id: string
  env?: string[]
  npm?: string
  name?: string
  doc?: string
  models?: Record<string, ModelEntry>
}

export type ModelsData = Record<string, ProviderEntry>

export type ProviderConfigMap = Record<string, { apiKey?: string; baseURL?: string }>
