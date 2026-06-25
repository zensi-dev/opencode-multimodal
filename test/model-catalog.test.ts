import { describe, expect, it } from "vitest"
import { mergeProviderConfigModels, providerConfigFromOpencodeConfig } from "../src/shared/model-catalog"
import { supportedInputModalities } from "../src/shared/models-data"
import type { ModelsData } from "../src/shared/types"

describe("providerConfigFromOpencodeConfig", () => {
  it("parses provider auth, package, display name, and models", () => {
    const providerConfig = providerConfigFromOpencodeConfig({
      provider: {
        gateway: {
          name: "Gateway",
          npm: "@ai-sdk/openai-compatible",
          options: {
            apiKey: "sk-test",
            baseURL: "https://gateway.example.com/v1",
          },
          models: {
            "gateway-vision": {
              name: "Gateway Vision",
              modalities: { input: ["text", "image"], output: ["text"] },
            },
          },
        },
      },
    })

    expect(providerConfig.gateway).toEqual({
      apiKey: "sk-test",
      baseURL: "https://gateway.example.com/v1",
      npm: "@ai-sdk/openai-compatible",
      name: "Gateway",
      models: {
        "gateway-vision": {
          id: "gateway-vision",
          name: "Gateway Vision",
          modalities: { input: ["text", "image"], output: ["text"] },
        },
      },
    })
  })

  it("ignores invalid and blank provider config values", () => {
    const providerConfig = providerConfigFromOpencodeConfig({
      provider: {
        nullish: null,
        blank: { npm: "  ", options: { apiKey: "  ", baseURL: "" }, models: { broken: null } },
      },
    })

    expect(providerConfig).toEqual({})
  })
})

describe("mergeProviderConfigModels", () => {
  it("adds custom providers to the shared model catalog", () => {
    const data: ModelsData = {}
    const providerConfig = providerConfigFromOpencodeConfig({
      provider: {
        gateway: {
          options: { apiKey: "sk-test" },
          models: {
            "gateway-vision": {
              modalities: { input: ["text", "image"], output: ["text"] },
            },
          },
        },
      },
    })

    const merged = mergeProviderConfigModels(data, providerConfig)

    expect(merged.gateway?.npm).toBe("@ai-sdk/openai-compatible")
    expect(merged.gateway?.models?.["gateway-vision"]?.id).toBe("gateway-vision")
    expect(supportedInputModalities(merged, "gateway", "gateway-vision").has("image")).toBe(true)
  })
})
