import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { isCredentialed, listCredentialedProviders, resolveKey } from "../src/shared/auth"
import type { ModelsData } from "../src/shared/types"

const fixturePath = fileURLToPath(new URL("./fixtures/models.json", import.meta.url))
const authPath = fileURLToPath(new URL("./fixtures/auth.json", import.meta.url))
const customAuthPath = fileURLToPath(new URL("./fixtures/auth-custom.json", import.meta.url))
let data: ModelsData
let envBackup: string | undefined
let awsSecretBackup: string | undefined

beforeEach(() => {
  data = JSON.parse(readFileSync(fixturePath, "utf8")) as ModelsData
  envBackup = process.env.NOKEY_API_KEY
  awsSecretBackup = process.env.AWS_SECRET_ACCESS_KEY
})

afterEach(() => {
  if (envBackup === undefined) delete process.env.NOKEY_API_KEY
  else process.env.NOKEY_API_KEY = envBackup
  if (awsSecretBackup === undefined) delete process.env.AWS_SECRET_ACCESS_KEY
  else process.env.AWS_SECRET_ACCESS_KEY = awsSecretBackup
})

describe("resolveKey", () => {
  it("reads `key` from auth.json first", () => {
    const result = resolveKey(data, "openai", { authPath })
    expect(result).toEqual({ key: "openai-test-key" })
  })

  it("tolerates the legacy `apikey` field", () => {
    const result = resolveKey(data, "anthropic", { authPath })
    expect(result).toEqual({ key: "anthropic-legacy-key" })
  })

  it("falls back to env when auth.json has no entry", () => {
    process.env.NOKEY_API_KEY = "env-key"
    const result = resolveKey(data, "nokey", { authPath })
    expect(result).toEqual({ key: "env-key" })
  })

  it("does not read unrelated env vars from provider metadata", () => {
    data.nokey!.env = ["AWS_SECRET_ACCESS_KEY"]
    process.env.AWS_SECRET_ACCESS_KEY = "do-not-read"
    expect(resolveKey(data, "nokey", { authPath })).toBeNull()
  })

  it("returns null when no source resolves", () => {
    delete process.env.NOKEY_API_KEY
    expect(resolveKey(data, "nokey", { authPath })).toBeNull()
  })

  it("honours provider config apiKey + baseURL", () => {
    const result = resolveKey(data, "nokey", {
      authPath,
      providerConfig: { nokey: { apiKey: "cfg-key", baseURL: "https://gw.example.com" } },
    })
    expect(result).toEqual({ key: "cfg-key", baseURL: "https://gw.example.com" })
  })
})

describe("credentialed sets", () => {
  it("lists providers with any resolvable key", () => {
    process.env.NOKEY_API_KEY = "env-key"
    const set = listCredentialedProviders(data, { authPath })
    expect(set.has("openai")).toBe(true)
    expect(set.has("anthropic")).toBe(true)
    expect(set.has("nokey")).toBe(true)
  })

  it("lists custom providers credentialed by provider config", () => {
    const set = listCredentialedProviders(data, {
      authPath,
      providerConfig: {
        gateway: { apiKey: "cfg-key", baseURL: "https://gateway.example.com/v1" },
      },
    })

    expect(set.has("gateway")).toBe(true)
  })

  it("lists custom providers credentialed by auth.json", () => {
    const providerConfig = {
      gateway: { baseURL: "https://gateway.example.com/v1", npm: "@ai-sdk/openai-compatible" },
    }

    const set = listCredentialedProviders(data, { authPath: customAuthPath, providerConfig })

    expect(set.has("gateway")).toBe(true)
    expect(resolveKey(data, "gateway", { authPath: customAuthPath, providerConfig })).toEqual({
      key: "gateway-auth-key",
      baseURL: "https://gateway.example.com/v1",
    })
  })

  it("does not treat blank custom provider keys as credentialed", () => {
    const set = listCredentialedProviders(data, {
      authPath,
      providerConfig: { gateway: { apiKey: "  " } },
    })

    expect(set.has("gateway")).toBe(false)
  })

  it("isCredentialed matches resolveKey", () => {
    delete process.env.NOKEY_API_KEY
    expect(isCredentialed(data, "openai", { authPath })).toBe(true)
    expect(isCredentialed(data, "nokey", { authPath })).toBe(false)
  })
})
