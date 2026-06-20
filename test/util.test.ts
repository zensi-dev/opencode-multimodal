import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import {
  decodeDataUrl,
  errorMessage,
  hashPart,
  isNonEmpty,
  mimeToModality,
  readAttachment,
  sha256Hex,
} from "../src/shared/util"

let tempDir: string | undefined

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  tempDir = undefined
})

describe("mimeToModality", () => {
  it("maps image/pdf/audio/video prefixes", () => {
    expect(mimeToModality("image/png")).toBe("image")
    expect(mimeToModality("IMAGE/JPEG")).toBe("image")
    expect(mimeToModality("application/pdf")).toBe("pdf")
    expect(mimeToModality("audio/mpeg")).toBe("audio")
    expect(mimeToModality("video/mp4")).toBe("video")
  })

  it("returns undefined for unknown / empty", () => {
    expect(mimeToModality("text/plain")).toBeUndefined()
    expect(mimeToModality("application/zip")).toBeUndefined()
    expect(mimeToModality(undefined)).toBeUndefined()
    expect(mimeToModality("")).toBeUndefined()
  })
})

describe("decodeDataUrl", () => {
  it("decodes base64 payloads", () => {
    const url = "data:image/png;base64,iVBORw0KGgo="
    const result = decodeDataUrl(url)
    expect(result).not.toBeNull()
    expect(result?.mediaType).toBe("image/png")
    expect(result?.data.length).toBeGreaterThan(0)
  })

  it("returns null for empty base64 payloads", () => {
    expect(decodeDataUrl("data:image/png;base64,")).toBeNull()
  })

  it("returns null when payload exceeds byte cap", () => {
    expect(decodeDataUrl("data:text/plain;base64,aGVsbG8=", 2)).toBeNull()
  })

  it("returns null for non-data urls", () => {
    expect(decodeDataUrl("file:///tmp/x.png")).toBeNull()
    expect(decodeDataUrl("https://example.com/x.png")).toBeNull()
  })

  it("falls back to default media type when omitted", () => {
    const result = decodeDataUrl("data:;base64,aGVsbG8=")
    expect(result?.mediaType).toBe("application/octet-stream")
  })
})

describe("readAttachment", () => {
  it("reads file URLs", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "opencode-mm-"))
    const file = join(tempDir, "sample.txt")
    writeFileSync(file, "hello")
    const result = await readAttachment(pathToFileURL(file).toString(), "text/plain")
    expect(result?.mediaType).toBe("text/plain")
    expect(Buffer.from(result?.data ?? []).toString("utf8")).toBe("hello")
  })

  it("rejects plain paths, directories, and oversized files", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "opencode-mm-"))
    const file = join(tempDir, "sample.txt")
    writeFileSync(file, "hello")
    expect(await readAttachment(file, "text/plain")).toBeNull()
    expect(await readAttachment(pathToFileURL(tempDir).toString(), "text/plain")).toBeNull()
    expect(await readAttachment(pathToFileURL(file).toString(), "text/plain", 2)).toBeNull()
  })
})

describe("hashing", () => {
  it("sha256Hex is stable", () => {
    expect(sha256Hex("abc")).toBe(sha256Hex("abc"))
    expect(sha256Hex("abc")).not.toBe(sha256Hex("abd"))
  })

  it("hashPart distinguishes mime and url", () => {
    expect(hashPart("image/png", "u1")).not.toBe(hashPart("image/jpeg", "u1"))
    expect(hashPart("image/png", "u1")).not.toBe(hashPart("image/png", "u2"))
  })
})

describe("isNonEmpty", () => {
  it("rejects blank values", () => {
    expect(isNonEmpty("")).toBe(false)
    expect(isNonEmpty("   ")).toBe(false)
    expect(isNonEmpty(null)).toBe(false)
    expect(isNonEmpty(undefined)).toBe(false)
    expect(isNonEmpty("x")).toBe(true)
  })
})

describe("errorMessage", () => {
  it("redacts common secret shapes", () => {
    const fakeKey = `sk-${"testsecret"}`
    const message = errorMessage(`authorization: Bearer abcdef123456, apiKey: ${fakeKey}`)
    expect(message).toContain("[redacted]")
    expect(message).not.toContain("abcdef123456")
    expect(message).not.toContain(fakeKey)
  })
})
