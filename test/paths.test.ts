import { afterEach, describe, expect, it } from "vitest"
import os from "node:os"
import path from "node:path"
import { authJsonPath, cacheDir, dataDir, modelsJsonPath, pluginConfigPath } from "../src/shared/paths"

const originalCache = process.env.XDG_CACHE_HOME
const originalData = process.env.XDG_DATA_HOME

afterEach(() => {
  delete process.env.XDG_CACHE_HOME
  delete process.env.XDG_DATA_HOME
  if (originalCache !== undefined) process.env.XDG_CACHE_HOME = originalCache
  if (originalData !== undefined) process.env.XDG_DATA_HOME = originalData
})

describe("cacheDir", () => {
  it("defaults to ~/.cache/opencode on every platform", () => {
    expect(cacheDir()).toBe(path.join(os.homedir(), ".cache", "opencode"))
  })

  it("respects XDG_CACHE_HOME", () => {
    process.env.XDG_CACHE_HOME = "/custom/cache"
    expect(cacheDir()).toBe(path.join("/custom/cache", "opencode"))
  })

  it("ignores empty XDG_CACHE_HOME", () => {
    process.env.XDG_CACHE_HOME = "  "
    expect(cacheDir()).toBe(path.join(os.homedir(), ".cache", "opencode"))
  })
})

describe("dataDir", () => {
  it("defaults to ~/.local/share/opencode on every platform", () => {
    expect(dataDir()).toBe(path.join(os.homedir(), ".local", "share", "opencode"))
  })

  it("respects XDG_DATA_HOME", () => {
    process.env.XDG_DATA_HOME = "/custom/data"
    expect(dataDir()).toBe(path.join("/custom/data", "opencode"))
  })
})

describe("derived paths", () => {
  it("modelsJsonPath is <cacheDir>/models.json", () => {
    expect(modelsJsonPath()).toBe(path.join(cacheDir(), "models.json"))
  })

  it("authJsonPath is <dataDir>/auth.json", () => {
    expect(authJsonPath()).toBe(path.join(dataDir(), "auth.json"))
  })

  it("pluginConfigPath is <dataDir>/opencode-multimodal.json", () => {
    expect(pluginConfigPath()).toBe(path.join(dataDir(), "opencode-multimodal.json"))
  })
})
