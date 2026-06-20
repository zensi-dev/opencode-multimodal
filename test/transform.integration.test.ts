import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { listCredentialedProviders } from "../src/shared/auth"
import { normalizeConfig } from "../src/shared/config-store"
import { supportedInputModalities } from "../src/shared/models-data"
import type { Modality, ModelsData, PluginConfig } from "../src/shared/types"
import { hashPart } from "../src/shared/util"
import { DescriptionCache } from "../src/server/cache"
import { selectFallback } from "../src/server/fallback"
import {
  distinctModalities,
  findUnsupportedAttachments,
  replaceWithText,
  type MessageContainer,
} from "../src/server/parts"

const fixturePath = fileURLToPath(new URL("./fixtures/models.json", import.meta.url))
const authPath = fileURLToPath(new URL("./fixtures/auth.json", import.meta.url))
const data = JSON.parse(readFileSync(fixturePath, "utf8")) as ModelsData

function filePart(mime: string, url: string, filename?: string) {
  return {
    id: `p-${mime}`,
    sessionID: "s1",
    messageID: "m1",
    type: "file",
    mime,
    url,
    ...(filename ? { filename } : {}),
  }
}

describe("transform pipeline (stubbed describe)", () => {
  it("replaces image + pdf attachments for a text-only active model", () => {
    // Active model is text-only; user configured claude-vision (credentialed) for image + pdf.
    const active = { providerID: "anthropic", modelID: "claude-text-only" }
    const config: PluginConfig = normalizeConfig({
      modalities: {
        image: { enabled: true, chain: [{ providerID: "anthropic", modelID: "claude-vision" }] },
        pdf: { enabled: true, chain: [{ providerID: "anthropic", modelID: "claude-vision" }] },
      },
    })
    const credentialed = listCredentialedProviders(data, { authPath })

    const messages: MessageContainer[] = [
      {
        info: { sessionID: "s1", role: "user" },
        parts: [
          { type: "text", text: "what are these?" },
          filePart("image/png", "data:image/png;base64,AAAA", "shot.png"),
          filePart("application/pdf", "data:application/pdf;base64,BBBB"),
        ],
      },
    ]

    // 1. active model capabilities
    const supported = supportedInputModalities(data, active.providerID, active.modelID)
    expect([...supported]).toEqual([])

    // 2. which configured modalities are missing?
    const missing = new Set<Modality>()
    for (const m of ["image", "pdf", "audio"] as const) {
      if (config.modalities[m].enabled && config.modalities[m].chain.length > 0 && !supported.has(m)) {
        missing.add(m)
      }
    }
    expect([...missing].sort()).toEqual(["image", "pdf"])

    // 3. find attachments
    const hits = findUnsupportedAttachments(messages, missing)
    expect(distinctModalities(hits)).toEqual(new Set(["image", "pdf"]))

    // 4. plan + stubbed describe (canned per modality)
    const plan = new Map<Modality, ReturnType<typeof selectFallback>>()
    for (const m of distinctModalities(hits)) plan.set(m, selectFallback(data, config, credentialed, m))
    expect(plan.get("image")?.modelID).toBe("claude-vision")

    const cache = new DescriptionCache(60_000)
    const descriptions = new Map<string, string>()
    for (const hit of hits) {
      const key = hashPart(hit.part.mime, hit.part.url)
      const canned = hit.modality === "image" ? "a red square with text OK" : "PDF says: hello world"
      cache.set(key, canned)
      descriptions.set(key, canned)
    }

    // 5. replace in place
    replaceWithText(
      messages,
      hits,
      (hit) => cache.get(hashPart(hit.part.mime, hit.part.url)),
      (m) => plan.get(m) ?? undefined,
    )

    const parts = messages[0]!.parts
    expect(parts[0]!.type).toBe("text") // original text part untouched
    const img = parts[1] as { type: string; text: string }
    const pdf = parts[2] as { type: string; text: string }
    expect(img.type).toBe("text")
    expect(img.text).toContain("[image analysed by anthropic/claude-vision]")
    expect(img.text).toContain("a red square with text OK")
    expect(img.text).toContain("source: shot.png")
    expect(pdf.type).toBe("text")
    expect(pdf.text).toContain("[pdf analysed by anthropic/claude-vision]")
    expect(pdf.text).toContain("source: inline")
    // no file parts remain
    expect(parts.every((p) => p.type !== "file")).toBe(true)
  })

  it("leaves attachments untouched when no credentialed fallback resolves", () => {
    const config = normalizeConfig({
      modalities: {
        // chain points at a model whose provider is NOT credentialed in the fixture
        image: { enabled: true, chain: [{ providerID: "nokey", modelID: "nk-vision" }] },
      },
    })
    const credentialed = listCredentialedProviders(data, { authPath }) // openai + anthropic only
    expect(credentialed.has("nokey")).toBe(false)

    const messages: MessageContainer[] = [
      {
        info: { sessionID: "s1", role: "user" },
        parts: [filePart("image/png", "data:image/png;base64,AAAA")],
      },
    ]
    const hits = findUnsupportedAttachments(messages, new Set<Modality>(["image"]))
    const plan = new Map<Modality, ReturnType<typeof selectFallback>>()
    for (const m of distinctModalities(hits)) plan.set(m, selectFallback(data, config, credentialed, m))
    expect(plan.get("image")).toBeNull()

    replaceWithText(
      messages,
      hits,
      () => "SHOULD NOT BE USED",
      (m) => plan.get(m) ?? undefined,
    )
    // part left as a file so opencode's own error substitution handles it (graceful no-op)
    expect(messages[0]!.parts[0]!.type).toBe("file")
  })
})
