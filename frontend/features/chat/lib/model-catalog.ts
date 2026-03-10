import type {
  CredentialState,
  ModelConfigResponse,
  ModelDefinition,
  ModelProvider,
} from "@/features/chat/types";

export interface ModelCatalogOption {
  modelId: string;
  displayName: string;
  providerId: string;
  providerName: string;
  credentialState: CredentialState;
  isAvailable: boolean;
  isDefault: boolean;
  isCustom: boolean;
}

function buildProviderMap(
  providers: ModelConfigResponse["providers"] | undefined,
): Map<string, ModelProvider> {
  return new Map(
    (providers ?? []).map((provider) => [provider.provider_id, provider]),
  );
}

function getOrderedModels(
  modelConfig: ModelConfigResponse,
  customModels: ModelDefinition[] = [],
): ModelDefinition[] {
  const orderedModels: ModelDefinition[] = [];
  const seen = new Set<string>();
  const modelMap = new Map(
    modelConfig.models.map((model) => [model.model_id, model]),
  );

  const push = (modelId: string | null | undefined) => {
    const cleaned = (modelId || "").trim();
    if (!cleaned || seen.has(cleaned)) {
      return;
    }
    const model = modelMap.get(cleaned);
    if (!model) {
      return;
    }
    seen.add(cleaned);
    orderedModels.push(model);
  };

  push(modelConfig.default_model);
  modelConfig.model_list.forEach(push);
  modelConfig.models.forEach((model) => push(model.model_id));
  customModels.forEach((model) => {
    if (seen.has(model.model_id)) {
      return;
    }
    seen.add(model.model_id);
    orderedModels.push(model);
  });

  return orderedModels;
}

export function inferProviderId(modelId: string): string | null {
  const value = (modelId || "").trim();
  if (!value) {
    return null;
  }

  const lowered = value.toLowerCase();
  if (lowered.startsWith("claude-")) {
    return "anthropic";
  }
  if (
    lowered.startsWith("gpt") ||
    lowered.startsWith("o1") ||
    lowered.startsWith("o3") ||
    lowered.startsWith("o4")
  ) {
    return "openai";
  }
  if (lowered.startsWith("glm-") || value.startsWith("GLM-")) {
    return "glm";
  }
  if (lowered.startsWith("minimax-") || value.startsWith("MiniMax-")) {
    return "minimax";
  }
  if (lowered.startsWith("deepseek-")) {
    return "deepseek";
  }
  return null;
}

export function humanizeModelName(modelId: string): string {
  const value = (modelId || "").trim();
  if (!value) {
    return modelId;
  }

  return value
    .replace(/_/g, "-")
    .split("-")
    .filter(Boolean)
    .map((part) => {
      const lowered = part.toLowerCase();
      if (lowered === "gpt" || lowered === "glm") {
        return part.toUpperCase();
      }
      if (lowered === "claude") {
        return "Claude";
      }
      if (lowered === "deepseek") {
        return "DeepSeek";
      }
      if (lowered === "minimax") {
        return "MiniMax";
      }
      return /^[a-z]{1,4}$/i.test(part) ? part.toUpperCase() : part;
    })
    .join(" ");
}

function buildCustomModelDefinition(
  modelId: string,
  providers: ModelConfigResponse["providers"],
): ModelDefinition | null {
  const clean = (modelId || "").trim();
  if (!clean) {
    return null;
  }

  const providerId = inferProviderId(clean);
  if (!providerId) {
    return null;
  }

  const provider = providers.find((item) => item.provider_id === providerId);
  if (!provider) {
    return null;
  }

  return {
    model_id: clean,
    display_name: humanizeModelName(clean),
    provider_id: providerId,
    requires_credentials: true,
    supports_custom_base_url: true,
  };
}

export function buildModelCatalogOptions(
  modelConfig: ModelConfigResponse | null | undefined,
  customModelIds: string[] = [],
): ModelCatalogOption[] {
  if (!modelConfig) {
    return [];
  }

  const defaultModel = (modelConfig.default_model || "").trim();
  const providerMap = buildProviderMap(modelConfig.providers);
  const customModels = customModelIds
    .map((modelId) =>
      buildCustomModelDefinition(modelId, modelConfig.providers),
    )
    .filter((model): model is ModelDefinition => model !== null);
  const customModelMap = new Map(
    customModels.map((model) => [model.model_id, model]),
  );
  const modelMap = new Map(
    modelConfig.models.map((model) => [model.model_id, model]),
  );

  return getOrderedModels(modelConfig, customModels)
    .map((rawModel) => {
      const model =
        modelMap.get(rawModel.model_id) ??
        customModelMap.get(rawModel.model_id);
      if (!model) {
        return null;
      }
      const provider = providerMap.get(model.provider_id);
      const credentialState = provider?.credential_state ?? "none";

      return {
        modelId: model.model_id,
        displayName: model.display_name,
        providerId: model.provider_id,
        providerName: provider?.display_name ?? model.provider_id,
        credentialState,
        isAvailable: !model.requires_credentials || credentialState !== "none",
        isDefault: model.model_id === defaultModel,
        isCustom: !modelMap.has(model.model_id),
      };
    })
    .filter((option): option is ModelCatalogOption => option !== null);
}

export function findModelCatalogOption(
  modelConfig: ModelConfigResponse | null | undefined,
  modelId: string | null | undefined,
  customModelIds: string[] = [],
): ModelCatalogOption | null {
  const cleanModelId = (modelId || "").trim();
  if (!cleanModelId) {
    return null;
  }

  return (
    buildModelCatalogOptions(modelConfig, customModelIds).find(
      (option) => option.modelId === cleanModelId,
    ) ?? null
  );
}
