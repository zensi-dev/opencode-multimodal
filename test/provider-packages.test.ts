import { describe, expect, it } from "vitest"
import {
  isAllowedProviderEnv,
  isSupportedProviderPackage,
  providerFactoryExport,
} from "../src/shared/provider-packages"

describe("provider package support", () => {
  it("uses the current OpenAI factory export name", () => {
    expect(providerFactoryExport("@ai-sdk/openai")).toBe("createOpenAI")
  })

  it("rejects providers that are not shipped as runtime dependencies", () => {
    expect(isSupportedProviderPackage("@ai-sdk/anthropic")).toBe(true)
    expect(isSupportedProviderPackage("@example/missing-provider")).toBe(false)
    expect(isSupportedProviderPackage(undefined)).toBe(false)
  })

  it("restricts env lookup to provider-owned API key names", () => {
    expect(isAllowedProviderEnv("anthropic", "@ai-sdk/anthropic", "ANTHROPIC_API_KEY")).toBe(true)
    expect(isAllowedProviderEnv("nokey", "@ai-sdk/openai-compatible", "NOKEY_API_KEY")).toBe(true)
    expect(isAllowedProviderEnv("nokey", "@ai-sdk/openai-compatible", "AWS_SECRET_ACCESS_KEY")).toBe(false)
    expect(isAllowedProviderEnv("nokey", "@ai-sdk/openai-compatible", "GITHUB_TOKEN")).toBe(false)
  })
})
