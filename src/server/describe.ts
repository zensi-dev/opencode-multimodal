import { readAttachment, errorMessage } from "../shared/util"
import type { Modality, ResolvedKey, SelectedFallback } from "../shared/types"
import { providerFactoryExport } from "../shared/provider-packages"

export class DescribeError extends Error {}

export type DescribeArgs = {
  fallback: SelectedFallback
  modality: Modality
  mime: string
  url: string
  prompt: string
  key: ResolvedKey
  signal: AbortSignal
}

export async function describe(args: DescribeArgs): Promise<string> {
  const { fallback, modality, mime, url, prompt, key, signal } = args

  const mod = (await import(fallback.npm).catch((error) => {
    throw new DescribeError(
      `provider package "${fallback.npm}" could not be loaded from the plugin installation: ${errorMessage(error)}`,
    )
  })) as Record<string, unknown>

  const factoryName = providerFactoryExport(fallback.npm)
  const factory = (factoryName ? mod[factoryName] : findFactory(mod)) ?? mod.default
  if (typeof factory !== "function") {
    throw new DescribeError(`no provider factory found in ${fallback.npm}`)
  }

  const provider = factory({ apiKey: key.key, ...(key.baseURL ? { baseURL: key.baseURL } : {}) })
  const model = typeof provider === "function" ? provider(fallback.modelID) : provider(fallback.modelID)
  if (!model)
    throw new DescribeError(`provider ${fallback.npm} did not return a model for ${fallback.modelID}`)

  const ai = (await import("ai").catch((error) => {
    throw new DescribeError(`the "ai" package is unavailable: ${errorMessage(error)}`)
  })) as { generateText: (opts: Record<string, unknown>) => Promise<{ text?: string }> }

  const attachment = await readAttachment(url, mime)
  if (!attachment) throw new DescribeError("attachment could not be read (empty or unreadable)")

  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image"; image: Uint8Array }
    | { type: "file"; data: Uint8Array; mediaType: string }
  const content: ContentPart[] = [{ type: "text", text: prompt }]
  if (modality === "image") {
    content.push({ type: "image", image: attachment.data })
  } else {
    content.push({ type: "file", data: attachment.data, mediaType: attachment.mediaType })
  }

  const result = await ai.generateText({
    model,
    messages: [{ role: "user", content }],
    abortSignal: signal,
  })

  const text = (result?.text ?? "").trim()
  if (!text) throw new DescribeError("fallback model returned empty text")
  return text
}

function findFactory(mod: Record<string, unknown>): ((opts: unknown) => unknown) | undefined {
  for (const key of Object.keys(mod)) {
    if (key.startsWith("create") && typeof mod[key] === "function") {
      return mod[key] as (opts: unknown) => unknown
    }
  }
  return undefined
}
