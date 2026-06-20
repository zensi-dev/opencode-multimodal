import crypto from "node:crypto"
import type { Modality } from "./types.js"

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

export function mimeToModality(mime: string | undefined): Modality | undefined {
  if (!mime) return undefined
  const lower = mime.toLowerCase()
  if (lower.startsWith("image/")) return "image"
  if (lower === "application/pdf") return "pdf"
  if (lower.startsWith("audio/")) return "audio"
  if (lower.startsWith("video/")) return "video"
  return undefined
}

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex")
}

export function hashPart(mime: string, url: string): string {
  return sha256Hex(`${mime}\0${url}`)
}

export function decodeDataUrl(
  url: string,
  maxBytes: number = MAX_ATTACHMENT_BYTES,
): { data: Uint8Array; mediaType: string } | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url)
  if (!match) return null
  const mediaType = match[1] || "application/octet-stream"
  const isBase64 = Boolean(match[2])
  const payload = match[3] ?? ""
  if (isBase64) {
    if (payload.length > Math.ceil((maxBytes * 4) / 3) + 4096) return null
    const normalized = payload.replace(/\s/g, "")
    if (Math.ceil((normalized.length * 3) / 4) > maxBytes) return null
    try {
      const buffer = Buffer.from(normalized, "base64")
      if (buffer.length === 0 || buffer.length > maxBytes) return null
      return { data: buffer, mediaType }
    } catch {
      return null
    }
  }
  if (estimatedDecodedPayloadBytes(payload) > maxBytes) return null
  try {
    const buffer = Buffer.from(decodeURIComponent(payload), "utf8")
    if (buffer.length === 0 || buffer.length > maxBytes) return null
    return { data: buffer, mediaType }
  } catch {
    return null
  }
}

export async function readAttachment(
  url: string,
  mime: string,
  maxBytes: number = MAX_ATTACHMENT_BYTES,
): Promise<{ data: Uint8Array; mediaType: string } | null> {
  if (url.startsWith("data:")) return decodeDataUrl(url, maxBytes)
  if (!url.startsWith("file://")) return null
  try {
    const fs = await import("node:fs")
    const { fileURLToPath } = await import("node:url")
    const target = new URL(url)
    if (target.protocol !== "file:") return null
    const file = fileURLToPath(target)
    const stat = fs.statSync(file)
    if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes) return null
    const fd = fs.openSync(file, "r")
    try {
      const buffer = Buffer.allocUnsafe(maxBytes + 1)
      const bytesRead = fs.readSync(fd, buffer, 0, maxBytes + 1, 0)
      if (bytesRead <= 0 || bytesRead > maxBytes) return null
      return { data: buffer.subarray(0, bytesRead), mediaType: mime }
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return null
  }
}

function estimatedDecodedPayloadBytes(payload: string): number {
  let bytes = 0
  for (let i = 0; i < payload.length; i++) {
    if (payload[i] === "%" && isHex(payload[i + 1]) && isHex(payload[i + 2])) {
      bytes++
      i += 2
    } else {
      bytes++
    }
  }
  return bytes
}

function isHex(value: string | undefined): boolean {
  return Boolean(value && /^[0-9a-fA-F]$/.test(value))
}

export function isNonEmpty(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return value.slice(0, Math.max(0, max - 1)) + "…"
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return redactSensitive(error.message || error.name)
  if (typeof error === "string") return redactSensitive(error)
  try {
    return redactSensitive(JSON.stringify(error))
  } catch {
    return redactSensitive(String(error))
  }
}

export function redactSensitive(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|sk-ant-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{8,})\b/g, "[redacted]")
    .replace(
      /\b(api[_-]?key|authorization|x-api-key|access[_-]?token|refresh[_-]?token|token|secret)(["'\s:=]+)([^"'\s,}]+)/gi,
      "$1$2[redacted]",
    )
}
