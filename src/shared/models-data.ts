import fsSync from "node:fs"
import { modelsJsonPath } from "./paths.js"
import { isModality, type ModelEntry, type ModelsData, type Modality, type ProviderEntry } from "./types.js"

const MODELS_SOURCE = process.env.OPENCODE_MODELS_URL ?? "https://models.dev"
const FETCH_TIMEOUT_MS = 10_000

export function parseModelsData(json: string): ModelsData {
  const data = JSON.parse(json)
  if (!data || typeof data !== "object") throw new Error("models.json is not a JSON object")
  return data as ModelsData
}

export function loadModelsData(path: string = modelsJsonPath()): ModelsData | null {
  try {
    return parseModelsData(fsSync.readFileSync(path, "utf8"))
  } catch {
    return null
  }
}

function modelsApiUrl(source: string = MODELS_SOURCE): string {
  return source.endsWith("/api.json") ? source : `${source}/api.json`
}

export async function fetchModelsData(
  url: string = modelsApiUrl(),
  init: RequestInit = {},
): Promise<ModelsData | null> {
  try {
    const response = await fetch(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) return null
    return parseModelsData(await response.text())
  } catch {
    return null
  }
}

export async function resolveModelsData(
  path: string = modelsJsonPath(),
  url: string = modelsApiUrl(),
): Promise<ModelsData | null> {
  return loadModelsData(path) ?? (await fetchModelsData(url))
}

export function getProvider(data: ModelsData, providerID: string): ProviderEntry | undefined {
  return data[providerID]
}

export function getModel(data: ModelsData, providerID: string, modelID: string): ModelEntry | undefined {
  return data[providerID]?.models?.[modelID]
}

export function modelSupportsModality(model: ModelEntry | undefined, modality: Modality): boolean {
  if (!model) return false
  const input = model.modalities?.input
  if (Array.isArray(input)) return input.includes(modality)
  if (model.attachment) return modality === "image" || modality === "pdf"
  return false
}

export function supportedInputModalities(
  data: ModelsData,
  providerID: string,
  modelID: string,
): Set<Modality> {
  const out = new Set<Modality>()
  const model = getModel(data, providerID, modelID)
  if (!model) return out
  const input = model.modalities?.input
  if (Array.isArray(input)) {
    for (const value of input) {
      if (value !== "text" && isModality(value)) out.add(value)
    }
  } else if (model.attachment) {
    out.add("image")
    out.add("pdf")
  }
  return out
}

export function supports(data: ModelsData, providerID: string, modelID: string, modality: Modality): boolean {
  return supportedInputModalities(data, providerID, modelID).has(modality)
}

export function listProviderModels(data: ModelsData, providerID: string): ModelEntry[] {
  const provider = data[providerID]
  if (!provider?.models) return []
  return Object.values(provider.models)
}

export function listProviders(data: ModelsData): ProviderEntry[] {
  return Object.values(data)
}

export function providerNpm(data: ModelsData, providerID: string): string | undefined {
  return data[providerID]?.npm
}

export function providerEnv(data: ModelsData, providerID: string): string[] {
  return data[providerID]?.env ?? []
}

export function modelDisplayName(model: ModelEntry): string {
  return model.name || model.id
}

export function providerDisplayName(provider: ProviderEntry): string {
  return provider.name || provider.id
}
