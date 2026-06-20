import { getModel, modelSupportsModality, providerEnv, providerNpm } from "../shared/models-data"
import { modalityChain } from "../shared/config-store"
import type { ModelsData, Modality, PluginConfig, SelectedFallback } from "../shared/types"
import { isSupportedProviderPackage } from "../shared/provider-packages"

// Picks the first entry in the user-configured per-modality chain that is both
// credentialed and whose model actually supports the modality. The chain is the
// single source of truth (built via the /multimodal UI), so there is no implicit
// auto-selection here — the UI can suggest a chain, but nothing ships by default.
export function selectFallback(
  data: ModelsData,
  config: PluginConfig,
  credentialed: Set<string>,
  modality: Modality,
): SelectedFallback | null {
  for (const entry of modalityChain(config, modality)) {
    if (!credentialed.has(entry.providerID)) continue
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
  }
  return null
}
