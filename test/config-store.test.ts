import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  activeModalities,
  defaultConfig,
  isModalityActive,
  normalizeConfig,
  promptFor,
  readConfig,
  writeConfig,
} from "../src/shared/config-store"
import { DEFAULT_PROMPTS } from "../src/shared/prompts"

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mm-config-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("defaultConfig", () => {
  it("ships enabled but with empty chains (nothing configured by default)", () => {
    const config = defaultConfig()
    expect(config.enabled).toBe(true)
    for (const modality of ["image", "pdf", "audio"] as const) {
      expect(config.modalities[modality].chain).toEqual([])
      expect(config.modalities[modality].enabled).toBe(true)
    }
    expect(config.modalities.video.enabled).toBe(false)
  })
})

describe("normalizeConfig", () => {
  it("fills defaults for unknown shapes", () => {
    expect(normalizeConfig(null).enabled).toBe(true)
    expect(normalizeConfig({}).enabled).toBe(true)
    expect(normalizeConfig({ enabled: false }).enabled).toBe(false)
  })

  it("drops invalid chain entries but keeps valid ones", () => {
    const normalized = normalizeConfig({
      modalities: {
        image: {
          enabled: true,
          chain: [{ providerID: "openai", modelID: "gpt-4o" }, { providerID: "openai" }, "not-an-entry"],
        },
      },
    })
    expect(normalized.modalities.image.chain).toEqual([{ providerID: "openai", modelID: "gpt-4o" }])
  })

  it("preserves custom prompts and falls back to null", () => {
    const normalized = normalizeConfig({
      modalities: { image: { enabled: true, chain: [], prompt: "custom" } },
    })
    expect(normalized.modalities.image.prompt).toBe("custom")
    expect(normalized.modalities.pdf.prompt).toBeNull()
  })

  it("sanitizes invalid numeric settings", () => {
    const cfg = normalizeConfig({
      settings: {
        concurrency: Number.NaN,
        per_call_timeout_ms: "slow",
        cache_ttl_ms: -1,
        toast_on_missing_fallback: "no",
      },
    })
    expect(cfg.settings.concurrency).toBe(3)
    expect(cfg.settings.per_call_timeout_ms).toBe(30000)
    expect(cfg.settings.cache_ttl_ms).toBe(0)
    expect(cfg.settings.toast_on_missing_fallback).toBe(true)
  })

  it("clamps numeric settings to safe runtime bounds", () => {
    const cfg = normalizeConfig({
      settings: {
        concurrency: 99,
        per_call_timeout_ms: 1,
        cache_ttl_ms: 999999999,
        toast_on_missing_fallback: false,
      },
    })
    expect(cfg.settings.concurrency).toBe(16)
    expect(cfg.settings.per_call_timeout_ms).toBe(1000)
    expect(cfg.settings.cache_ttl_ms).toBe(86400000)
    expect(cfg.settings.toast_on_missing_fallback).toBe(false)
  })
})

describe("read/write roundtrip", () => {
  it("writes then reads back the same effective config", () => {
    const path = join(dir, "cfg.json")
    const config = normalizeConfig({
      enabled: true,
      modalities: {
        image: { enabled: true, chain: [{ providerID: "openai", modelID: "gpt-4o" }], prompt: "p" },
      },
    })
    writeConfig(config, path)
    expect(existsSync(path)).toBe(true)
    const read = readConfig(path)
    expect(read.modalities.image.chain).toEqual([{ providerID: "openai", modelID: "gpt-4o" }])
    expect(read.modalities.image.prompt).toBe("p")
  })

  it("readConfig returns defaults for a missing file", () => {
    const read = readConfig(join(dir, "missing.json"))
    expect(read).toEqual(defaultConfig())
  })
})

describe("modality activity", () => {
  it("only counts enabled modalities with a non-empty chain", () => {
    const config = normalizeConfig({
      modalities: {
        image: { enabled: true, chain: [{ providerID: "openai", modelID: "gpt-4o" }] },
        pdf: { enabled: true, chain: [] },
        audio: { enabled: false, chain: [{ providerID: "openai", modelID: "gpt-4o" }] },
      },
    })
    expect(isModalityActive(config, "image")).toBe(true)
    expect(isModalityActive(config, "pdf")).toBe(false)
    expect(isModalityActive(config, "audio")).toBe(false)
    expect(activeModalities(config)).toEqual(["image"])
  })
})

describe("promptFor", () => {
  it("uses the custom prompt when set, otherwise the default", () => {
    const custom = normalizeConfig({ modalities: { image: { enabled: true, chain: [], prompt: "x" } } })
    expect(promptFor(custom, "image")).toBe("x")
    expect(promptFor(defaultConfig(), "image")).toBe(DEFAULT_PROMPTS.image)
  })
})
