// The Vercel AI SDK (`ai`) is provided by the opencode runtime and loaded with
// dynamic import(). @ai-sdk/* provider packages are imported via a variable
// specifier (their package name), which TypeScript resolves to `any`. This shim
// lets the build's typecheck pass without bundling the real (heavy,
// version-specific) `ai` package into dev dependencies.
declare module "ai" {
  export interface GenerateTextResult {
    text?: string
    usage?: unknown
    [key: string]: unknown
  }
  export interface GenerateTextOptions {
    model?: unknown
    messages?: unknown
    system?: string
    abortSignal?: AbortSignal
    [key: string]: unknown
  }
  export function generateText(options: GenerateTextOptions): Promise<GenerateTextResult>
  export function streamText(options: GenerateTextOptions): unknown
}
