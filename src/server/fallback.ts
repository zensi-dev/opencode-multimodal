import { getModel, modelSupportsModality, providerEnv, providerNpm } from "../shared/models-data"
import { modalityChain } from "../shared/config-store"
import type { ModelsData, Modality, PluginConfig, ProviderConfigMap, SelectedFallback } from "../shared/types"
import { isSupportedProviderPackage } from "../shared/provider-packages"
import { DEFAULT_CUSTOM_PROVIDER_NPM } from "../shared/model-catalog"

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
    const providerInConfig = providerConfig?.[entry.providerID]
    const npm =
      providerNpm(data, entry.providerID) ??
      providerInConfig?.npm ??
      (providerInConfig ? DEFAULT_CUSTOM_PROVIDER_NPM : undefined)
    if (!isSupportedProviderPackage(npm)) continue

    if (providerInData) {
      const model = getModel(data, entry.providerID, entry.modelID)
      if (model && !modelSupportsModality(model, modality)) continue
      if (!model && !providerInConfig) continue
      return {
        providerID: entry.providerID,
        modelID: entry.modelID,
        npm,
        env: providerEnv(data, entry.providerID),
      }
    }

    if (providerInConfig) return { providerID: entry.providerID, modelID: entry.modelID, npm, env: [] }
  }
  return null
}
