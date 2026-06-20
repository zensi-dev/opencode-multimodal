import { beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  fetchModelsData,
  getModel,
  loadModelsData,
  modelSupportsModality,
  resolveModelsData,
  supportedInputModalities,
  supports,
} from "../src/shared/models-data"
import type { ModelsData } from "../src/shared/types"

const fixturePath = fileURLToPath(new URL("./fixtures/models.json", import.meta.url))
const fixtureJson = readFileSync(fixturePath, "utf8")
let data: ModelsData

beforeEach(() => {
  data = JSON.parse(fixtureJson) as ModelsData
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

describe("fetchModelsData", () => {
  it("parses a successful response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(fixtureJson),
    } as Response)
    const result = await fetchModelsData("https://example.test/api.json")
    expect(result).not.toBeNull()
    expect(Object.keys(result!)).toContain("anthropic")
    fetchMock.mockRestore()
  })

  it("returns null on a non-200 response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve(""),
    } as Response)
    expect(await fetchModelsData("https://example.test/api.json")).toBeNull()
    fetchMock.mockRestore()
  })

  it("returns null on a network error", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"))
    expect(await fetchModelsData("https://example.test/api.json")).toBeNull()
    fetchMock.mockRestore()
  })
})

describe("resolveModelsData", () => {
  it("uses the disk cache when available", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
    const result = await resolveModelsData(fixturePath, "https://example.test/api.json")
    expect(result).not.toBeNull()
    expect(Object.keys(result!)).toContain("anthropic")
    expect(fetchMock).not.toHaveBeenCalled()
    fetchMock.mockRestore()
  })

  it("falls back to fetch when the disk cache is missing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(fixtureJson),
    } as Response)
    const result = await resolveModelsData("/does/not/exist/models.json", "https://example.test/api.json")
    expect(result).not.toBeNull()
    expect(Object.keys(result!)).toContain("anthropic")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockRestore()
  })

  it("returns null when both disk and fetch fail", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"))
    expect(await resolveModelsData("/does/not/exist/models.json", "https://example.test/api.json")).toBeNull()
    fetchMock.mockRestore()
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
