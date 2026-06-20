import { describe, expect, it } from "vitest"
import {
  distinctModalities,
  findUnsupportedAttachments,
  isFilePart,
  replaceWithText,
  type MessageContainer,
} from "../src/server/parts"
import type { Modality, SelectedFallback } from "../src/shared/types"

function filePart(mime: string, url: string, filename?: string) {
  return {
    id: "p1",
    sessionID: "s1",
    messageID: "m1",
    type: "file",
    mime,
    url,
    ...(filename ? { filename } : {}),
  }
}

function textPart(text: string) {
  return { type: "text", text }
}

function messages(parts: unknown[]): MessageContainer[] {
  return [{ info: { sessionID: "s1", role: "user" }, parts: parts as MessageContainer["parts"] }]
}

const fallback: SelectedFallback = {
  providerID: "anthropic",
  modelID: "claude-vision",
  npm: "@ai-sdk/anthropic",
  env: ["ANTHROPIC_API_KEY"],
}

describe("isFilePart", () => {
  it("recognises file parts", () => {
    expect(isFilePart(filePart("image/png", "data:image/png;base64,xx"))).toBe(true)
    expect(isFilePart(textPart("hi"))).toBe(false)
    expect(isFilePart(null)).toBe(false)
    expect(isFilePart({ type: "file" })).toBe(false) // missing url
  })
})

describe("findUnsupportedAttachments", () => {
  it("finds only the modalities marked missing", () => {
    const msgs = messages([
      textPart("hello"),
      filePart("image/png", "data:image/png;base64,aaaa"),
      filePart("application/pdf", "data:application/pdf;base64,bbbb"),
      filePart("audio/mpeg", "data:audio/mpeg;base64,cccc"),
      { type: "file", mime: "text/plain", url: "data:text/plain;base64,eA==" }, // unknown modality
    ])
    const missing = new Set<Modality>(["image", "pdf"])
    const hits = findUnsupportedAttachments(msgs, missing)
    expect(hits.map((h) => h.modality).sort()).toEqual(["image", "pdf"])
  })

  it("ignores non-file and tool/reasoning parts", () => {
    const msgs = messages([
      { type: "tool", content: "x" },
      { type: "reasoning", text: "y" },
      filePart("image/png", "data:image/png;base64,zz"),
    ])
    const hits = findUnsupportedAttachments(msgs, new Set<Modality>(["image"]))
    expect(hits).toHaveLength(1)
  })

  it("distinctModalities dedupes", () => {
    const msgs = messages([
      filePart("image/png", "data:image/png;base64,1"),
      filePart("image/png", "data:image/png;base64,2"),
    ])
    const hits = findUnsupportedAttachments(msgs, new Set<Modality>(["image"]))
    expect(distinctModalities(hits).size).toBe(1)
  })
})

describe("replaceWithText", () => {
  it("replaces unsupported parts with synthetic text carrying the marker", () => {
    const msgs = messages([
      filePart("image/png", "data:image/png;base64,aaaa", "shot.png"),
      filePart("application/pdf", "data:application/pdf;base64,bbbb"),
    ])
    const hits = findUnsupportedAttachments(msgs, new Set<Modality>(["image", "pdf"]))
    const descriptions = new Map<string, string>()
    for (const hit of hits) descriptions.set(`${hit.part.mime}\0${hit.part.url}`, "DESCRIPTION")

    replaceWithText(
      msgs,
      hits,
      (hit) => descriptions.get(`${hit.part.mime}\0${hit.part.url}`),
      () => fallback,
    )

    const parts = msgs[0]!.parts
    const text = (p: unknown): string => (p as { text: string }).text
    expect(parts[0]!.type).toBe("text")
    expect(text(parts[0])).toContain("[image analysed by anthropic/claude-vision]")
    expect(text(parts[0])).toContain("DESCRIPTION")
    expect(text(parts[0])).toContain("source: shot.png")
    expect(text(parts[1])).toContain("source: inline")
  })

  it("leaves parts untouched when no description is available", () => {
    const msgs = messages([filePart("image/png", "data:image/png;base64,aaaa")])
    const hits = findUnsupportedAttachments(msgs, new Set<Modality>(["image"]))
    replaceWithText(
      msgs,
      hits,
      () => undefined,
      () => fallback,
    )
    expect(msgs[0]!.parts[0]!.type).toBe("file")
  })

  it("is a no-op when no fallback resolves for the modality", () => {
    const msgs = messages([filePart("image/png", "data:image/png;base64,aaaa")])
    const hits = findUnsupportedAttachments(msgs, new Set<Modality>(["image"]))
    replaceWithText(
      msgs,
      hits,
      () => "DESC",
      () => undefined,
    )
    expect(msgs[0]!.parts[0]!.type).toBe("file")
  })
})
