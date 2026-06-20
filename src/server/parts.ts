import { mimeToModality } from "../shared/util"
import type { Modality, SelectedFallback } from "../shared/types"

// Minimal local shapes of the SDK part types we touch. We mutate parts in place;
// keeping these loose avoids coupling the bundle to the heavy generated types.
export type FilePart = {
  id: string
  sessionID: string
  messageID: string
  type: "file"
  mime: string
  filename?: string
  url: string
  source?: unknown
}

export type TextPart = {
  id?: string
  sessionID?: string
  messageID?: string
  type: "text"
  text: string
  synthetic?: boolean
}

export type AnyPart = Record<string, unknown> & { type: string }

export type MessageContainer = { info: { sessionID?: string; role?: string }; parts: AnyPart[] }

export type UnsupportedHit = {
  messageIdx: number
  partIdx: number
  part: FilePart
  modality: Modality
}

export function isFilePart(part: unknown): part is FilePart {
  if (!part || typeof part !== "object") return false
  const value = part as Record<string, unknown>
  return value.type === "file" && typeof value.url === "string"
}

export function findUnsupportedAttachments(
  messages: MessageContainer[],
  missing: Set<Modality>,
): UnsupportedHit[] {
  const hits: UnsupportedHit[] = []
  messages.forEach((message, messageIdx) => {
    const parts = message?.parts
    if (!Array.isArray(parts)) return
    parts.forEach((raw, partIdx) => {
      if (!isFilePart(raw)) return
      const part = raw
      if (!part.url) return
      const modality = mimeToModality(part.mime)
      if (!modality) return
      if (!missing.has(modality)) return
      hits.push({ messageIdx, partIdx, part, modality })
    })
  })
  return hits
}

export function distinctModalities(hits: UnsupportedHit[]): Set<Modality> {
  const out = new Set<Modality>()
  for (const hit of hits) out.add(hit.modality)
  return out
}

// Mutates the message parts in place, replacing each unsupported file part with
// a synthetic text part carrying the fallback model's description. Parts without
// a description are left untouched so opencode's own error substitution applies.
export function replaceWithText(
  messages: MessageContainer[],
  hits: UnsupportedHit[],
  describeFor: (hit: UnsupportedHit) => string | undefined,
  fallbackFor: (modality: Modality) => SelectedFallback | undefined,
): void {
  for (const hit of hits) {
    const description = describeFor(hit)
    if (!description) continue
    const fallback = fallbackFor(hit.modality)
    if (!fallback) continue
    const header = `[${hit.modality} analysed by ${fallback.providerID}/${fallback.modelID}]`
    const source = hit.part.filename ? `source: ${hit.part.filename}` : "source: inline"
    const text = `${header}\n${description}\n(${source})`
    const parts = messages[hit.messageIdx]?.parts
    if (!parts) continue
    const original = parts[hit.partIdx] as Record<string, unknown> | undefined
    const replacement: TextPart = {
      ...(original as object),
      type: "text",
      text,
      synthetic: true,
    }
    parts[hit.partIdx] = replacement as unknown as AnyPart
  }
}
