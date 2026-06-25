import fsSync from "node:fs"
import { authJsonPath } from "./paths.js"
import { isAllowedProviderEnv } from "./provider-packages.js"
import type { ModelsData, ProviderConfigMap, ProviderEntry, ResolvedKey } from "./types.js"
import { isNonEmpty } from "./util.js"

type AuthJsonEntry = {
  key?: string
  apikey?: string
  apiKey?: string
  baseURL?: string
  [extra: string]: unknown
}

function readAuthJson(path: string): Record<string, AuthJsonEntry> {
  try {
    const raw = fsSync.readFileSync(path, "utf8")
    const data = JSON.parse(raw)
    if (data && typeof data === "object") return data as Record<string, AuthJsonEntry>
  } catch {
    // missing/unreadable auth.json is normal
  }
  return {}
}

export type ResolveKeyOptions = {
  providerConfig?: ProviderConfigMap
  authPath?: string
}

export function resolveKey(
  data: ModelsData,
  providerID: string,
  opts: ResolveKeyOptions = {},
): ResolvedKey | null {
  const provider: ProviderEntry | undefined = data[providerID]
  const cfgBaseURL = opts.providerConfig?.[providerID]?.baseURL

  // 1. opencode auth.json (field is `key`; tolerate `apikey`/`apiKey`)
  const auth = readAuthJson(opts.authPath ?? authJsonPath())
  const entry = auth[providerID]
  if (entry && typeof entry === "object") {
    const key = entry.key ?? entry.apikey ?? entry.apiKey
    if (isNonEmpty(key)) {
      const baseURL = entry.baseURL ?? cfgBaseURL
      return baseURL ? { key, baseURL } : { key }
    }
  }

  // 2. provider config (opencode.json `provider.<id>.options.apiKey`)
  const cfgKey = opts.providerConfig?.[providerID]?.apiKey
  if (isNonEmpty(cfgKey)) {
    return cfgBaseURL ? { key: cfgKey, baseURL: cfgBaseURL } : { key: cfgKey }
  }

  // 3. environment variable (first non-empty entry from models.json `env[]`)
  const envVars = provider?.env ?? []
  for (const name of envVars) {
    if (!isAllowedProviderEnv(providerID, provider?.npm, name)) continue
    const value = process.env[name]
    if (isNonEmpty(value)) {
      return cfgBaseURL ? { key: value, baseURL: cfgBaseURL } : { key: value }
    }
  }

  return null
}

export function listCredentialedProviders(data: ModelsData, opts: ResolveKeyOptions = {}): Set<string> {
  const out = new Set<string>()
  const providerIDs = new Set([...Object.keys(data), ...Object.keys(opts.providerConfig ?? {})])
  for (const providerID of providerIDs) {
    if (resolveKey(data, providerID, opts)) out.add(providerID)
  }
  return out
}

export function isCredentialed(data: ModelsData, providerID: string, opts: ResolveKeyOptions = {}): boolean {
  return resolveKey(data, providerID, opts) !== null
}
