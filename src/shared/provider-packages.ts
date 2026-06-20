// Provider package allowlist for fallback calls. These packages are declared as
// runtime dependencies so npm-installed plugins work from opencode's cache.
export const PROVIDER_FACTORY_EXPORTS: Record<string, string> = {
  "@ai-sdk/anthropic": "createAnthropic",
  "@ai-sdk/openai": "createOpenAI",
  "@ai-sdk/openai-compatible": "createOpenAICompatible",
  "@ai-sdk/google": "createGoogleGenerativeAI",
  "@ai-sdk/google-vertex": "createVertex",
  "@ai-sdk/mistral": "createMistral",
  "@ai-sdk/cohere": "createCohere",
  "@ai-sdk/groq": "createGroq",
  "@ai-sdk/xai": "createXai",
  "@ai-sdk/amazon-bedrock": "createAmazonBedrock",
  "@ai-sdk/azure": "createAzure",
  "@ai-sdk/deepinfra": "createDeepInfra",
  "@ai-sdk/fireworks": "createFireworks",
  "@ai-sdk/togetherai": "createTogetherAI",
  "@ai-sdk/perplexity": "createPerplexity",
  "@openrouter/ai-sdk-provider": "createOpenRouter",
}

const PROVIDER_ENV_ALLOWLIST: Record<string, readonly string[]> = {
  "@ai-sdk/anthropic": ["ANTHROPIC_API_KEY"],
  "@ai-sdk/openai": ["OPENAI_API_KEY"],
  "@ai-sdk/openai-compatible": ["OPENAI_COMPATIBLE_API_KEY"],
  "@ai-sdk/google": ["GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY"],
  "@ai-sdk/google-vertex": ["GOOGLE_VERTEX_API_KEY"],
  "@ai-sdk/mistral": ["MISTRAL_API_KEY"],
  "@ai-sdk/cohere": ["COHERE_API_KEY"],
  "@ai-sdk/groq": ["GROQ_API_KEY"],
  "@ai-sdk/xai": ["XAI_API_KEY"],
  "@ai-sdk/amazon-bedrock": ["AWS_BEDROCK_API_KEY"],
  "@ai-sdk/azure": ["AZURE_API_KEY", "AZURE_OPENAI_API_KEY"],
  "@ai-sdk/deepinfra": ["DEEPINFRA_API_KEY"],
  "@ai-sdk/fireworks": ["FIREWORKS_API_KEY"],
  "@ai-sdk/togetherai": ["TOGETHER_API_KEY", "TOGETHERAI_API_KEY"],
  "@ai-sdk/perplexity": ["PERPLEXITY_API_KEY"],
  "@openrouter/ai-sdk-provider": ["OPENROUTER_API_KEY"],
}

export function providerFactoryExport(packageName: string): string | undefined {
  return PROVIDER_FACTORY_EXPORTS[packageName]
}

export function isSupportedProviderPackage(packageName: string | undefined): packageName is string {
  return Boolean(packageName && PROVIDER_FACTORY_EXPORTS[packageName])
}

export function isAllowedProviderEnv(
  providerID: string,
  packageName: string | undefined,
  envName: string,
): boolean {
  if (!/^[A-Z0-9_]+$/.test(envName)) return false
  if (packageName && PROVIDER_ENV_ALLOWLIST[packageName]?.includes(envName)) return true
  const providerPrefix = providerID.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase()
  return Boolean(providerPrefix && envName.startsWith(`${providerPrefix}_`) && envName.endsWith("_API_KEY"))
}
