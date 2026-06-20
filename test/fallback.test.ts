import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { selectFallback } from "../src/server/fallback"
import { normalizeConfig } from "../src/shared/config-store"
import type { ModelsData, Modality, PluginConfig } from "../src/shared/types"

const fixturePath = fileURLToPath(new URL("./fixtures/models.json", import.meta.url))
const data = JSON.parse(readFileSync(fixturePath, "utf8")) as ModelsData

function configWith(
  chain: Array<{ providerID: string; modelID: string }>,
  modality: Modality = "image",
): PluginConfig {
  return normalizeConfig({ modalities: { [modality]: { enabled: true, chain } } })
}

describe("selectFallback", () => {
  it("returns the first credentialed, capable model in the chain", () => {
    const config = configWith([
      { providerID: "nokey", modelID: "nk-vision" }, // not credentialed
      { providerID: "anthropic", modelID: "claude-vision" }, // credentialed + supports image
    ])
    const credentialed = new Set(["openai", "anthropic"])
    const fallback = selectFallback(data, config, credentialed, "image")
    expect(fallback).toEqual({
      providerID: "anthropic",
      modelID: "claude-vision",
      npm: "@ai-sdk/anthropic",
      env: ["ANTHROPIC_API_KEY"],
    })
  })

  it("skips models that do not support the modality", () => {
    const config = configWith([
      { providerID: "openai", modelID: "gpt-text" }, // credentialed but text-only
      { providerID: "openai", modelID: "gpt-4o" },
    ])
    const fallback = selectFallback(data, config, new Set(["openai"]), "image")
    expect(fallback?.modelID).toBe("gpt-4o")
  })

  it("returns null when no entry is credentialed", () => {
    const config = configWith([{ providerID: "openai", modelID: "gpt-4o" }])
    expect(selectFallback(data, config, new Set(), "image")).toBeNull()
  })

  it("returns null for an empty chain", () => {
    expect(selectFallback(data, configWith([]), new Set(["openai"]), "image")).toBeNull()
  })

  it("respects audio modality routing", () => {
    const config = configWith([{ providerID: "openai", modelID: "gpt-4o" }], "audio")
    const fallback = selectFallback(data, config, new Set(["openai"]), "audio")
    expect(fallback?.modelID).toBe("gpt-4o")
  })
})
