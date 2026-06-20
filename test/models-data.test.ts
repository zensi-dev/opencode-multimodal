import { beforeEach, describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  getModel,
  loadModelsData,
  modelSupportsModality,
  supportedInputModalities,
  supports,
} from "../src/shared/models-data"
import type { ModelsData } from "../src/shared/types"

const fixturePath = fileURLToPath(new URL("./fixtures/models.json", import.meta.url))
let data: ModelsData

beforeEach(() => {
  data = JSON.parse(readFileSync(fixturePath, "utf8")) as ModelsData
})

describe("loadModelsData", () => {
  it("loads a fixture file", () => {
    const loaded = loadModelsData(fixturePath)
    expect(loaded).not.toBeNull()
    expect(Object.keys(loaded!)).toContain("anthropic")
  })

  it("returns null for a missing path", () => {
    expect(loadModelsData("/does/not/exist/models.json")).toBeNull()
  })
})

describe("supportedInputModalities", () => {
  it("derives the set from modalities.input", () => {
    expect([...supportedInputModalities(data, "anthropic", "claude-vision")].sort()).toEqual(["image", "pdf"])
    expect([...supportedInputModalities(data, "openai", "gpt-4o")].sort()).toEqual(["audio", "image"])
  })

  it("returns an empty set for text-only models", () => {
    expect(supportedInputModalities(data, "anthropic", "claude-text-only").size).toBe(0)
  })

  it("returns an empty set for unknown models", () => {
    expect(supportedInputModalities(data, "anthropic", "nope").size).toBe(0)
  })

  it("supports() shortcut", () => {
    expect(supports(data, "anthropic", "claude-vision", "image")).toBe(true)
    expect(supports(data, "anthropic", "claude-vision", "audio")).toBe(false)
    expect(supports(data, "openai", "gpt-text", "image")).toBe(false)
  })
})

describe("modelSupportsModality with attachment fallback", () => {
  it("treats attachment=true as image+pdf when modalities missing", () => {
    const model = getModel(data, "anthropic", "claude-vision")!
    expect(modelSupportsModality({ ...model, modalities: undefined }, "image")).toBe(true)
    expect(modelSupportsModality({ ...model, modalities: undefined }, "pdf")).toBe(true)
    expect(modelSupportsModality({ ...model, modalities: undefined }, "audio")).toBe(false)
  })

  it("returns false for undefined model", () => {
    expect(modelSupportsModality(undefined, "image")).toBe(false)
  })
})
