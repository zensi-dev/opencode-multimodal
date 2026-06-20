import os from "node:os"
import path from "node:path"

function envDir(varName: string, fallback: string): string {
  const value = process.env[varName]
  return value && value.trim() ? value : fallback
}

export function home(): string {
  return os.homedir()
}

export function cacheDir(): string {
  if (process.platform === "darwin") return path.join(home(), "Library", "Caches", "opencode")
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA ?? path.join(home(), "AppData", "Local"), "opencode")
  }
  return path.join(envDir("XDG_CACHE_HOME", path.join(home(), ".cache")), "opencode")
}

export function dataDir(): string {
  if (process.platform === "darwin") return path.join(home(), "Library", "Application Support", "opencode")
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA ?? path.join(home(), "AppData", "Local"), "opencode")
  }
  return path.join(envDir("XDG_DATA_HOME", path.join(home(), ".local", "share")), "opencode")
}

export function modelsJsonPath(): string {
  return path.join(cacheDir(), "models.json")
}

export function authJsonPath(): string {
  return path.join(dataDir(), "auth.json")
}

export function pluginConfigPath(): string {
  return path.join(dataDir(), "opencode-multimodal.json")
}

export function resolvePluginConfigPathOption(value: string | undefined): string | undefined {
  if (!value || !value.trim()) return undefined
  const resolved = path.resolve(value.replace(/^~(?=$|\/|\\)/, home()))
  const root = path.resolve(dataDir())
  const relative = path.relative(root, resolved)
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return resolved
  return undefined
}
