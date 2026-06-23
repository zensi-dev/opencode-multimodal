import { getModel, modelSupportsModality, providerEnv, providerNpm } from "../shared/models-data"
import { modalityChain } from "../shared/config-store"
import type { ModelsData, Modality, PluginConfig, ProviderConfigMap, SelectedFallback } from "../shared/types"
import { isSupportedProviderPackage } from "../shared/provider-packages"

export function selectFallback(
  data: ModelsData,
  config: PluginConfig,
  credentialed: Set<string>,
  modality: Modality,
  providerConfig?: ProviderConfigMap,
): SelectedFallback | null {
  for (const entry of modalityChain(config, modality)) {
    if (!credentialed.has(entry.providerID)) continue
    const providerInData = data[entry.providerID]
    if (providerInData) {
      const model = getModel(data, entry.providerID, entry.modelID)
      if (!modelSupportsModality(model, modality)) continue
      const npm = providerNpm(data, entry.providerID)
      if (!isSupportedProviderPackage(npm)) continue
      return {
        providerID: entry.providerID,
        modelID: entry.modelID,
        npm,
        env: providerEnv(data, entry.providerID),
      }
    } else {
      const npm = providerConfig?.[entry.providerID]?.npm ?? "@ai-sdk/openai-compatible"
      if (!isSupportedProviderPackage(npm)) continue
      return { providerID: entry.providerID, modelID: entry.modelID, npm, env: [] }
    }
  }
  return null
}
