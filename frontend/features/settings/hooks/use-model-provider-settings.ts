"use client";

import * as React from "react";
import { toast } from "sonner";

import { modelConfigService } from "@/features/home/api/model-config-api";
import { envVarsService } from "@/features/capabilities/env-vars/api/env-vars-api";
import type { EnvVar } from "@/features/capabilities/env-vars/types";
import type { ModelConfigResponse, ModelProvider } from "@/features/chat/types";
import { invalidateModelCatalog } from "@/features/chat/lib/model-catalog-state";
import { useT } from "@/lib/i18n/client";
import type { ApiProviderConfig } from "@/features/settings/types";

function buildProviderConfig(
  provider: ModelProvider,
  envVars: EnvVar[],
  savingProviderId: string | null,
): ApiProviderConfig {
  const hasStoredUserKey = envVars.some(
    (item) => item.scope === "user" && item.key === provider.api_key_env_key,
  );
  const hasStoredUserBaseUrl = envVars.some(
    (item) => item.scope === "user" && item.key === provider.base_url_env_key,
  );
  return {
    providerId: provider.provider_id,
    displayName: provider.display_name,
    apiKeyEnvKey: provider.api_key_env_key,
    baseUrlEnvKey: provider.base_url_env_key,
    credentialState: provider.credential_state,
    defaultBaseUrl: provider.default_base_url,
    effectiveBaseUrl: provider.effective_base_url,
    baseUrlSource: provider.base_url_source,
    models: provider.models,
    keyInput: "",
    baseUrlInput:
      provider.base_url_source === "user" ? provider.effective_base_url : "",
    hasStoredUserKey,
    hasStoredUserBaseUrl,
    isSaving: savingProviderId === provider.provider_id,
  };
}

export function useModelProviderSettings(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const { t } = useT("translation");
  const [modelConfig, setModelConfig] =
    React.useState<ModelConfigResponse | null>(null);
  const [envVars, setEnvVars] = React.useState<EnvVar[]>([]);
  const [providerConfigs, setProviderConfigs] = React.useState<
    ApiProviderConfig[]
  >([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [savingProviderId, setSavingProviderId] = React.useState<string | null>(
    null,
  );

  const refresh = React.useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    try {
      const [nextModelConfig, nextEnvVars] = await Promise.all([
        modelConfigService.get(),
        envVarsService.list(),
      ]);
      setModelConfig(nextModelConfig);
      setEnvVars(nextEnvVars);
      setProviderConfigs(
        nextModelConfig.providers.map((provider) =>
          buildProviderConfig(provider, nextEnvVars, null),
        ),
      );
    } catch (error) {
      console.error("[Settings] Failed to load provider settings:", error);
      toast.error(t("settings.providerSaveError"));
    } finally {
      setIsLoading(false);
    }
  }, [enabled, t]);

  React.useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  const setProviderPatch = React.useCallback(
    (providerId: string, patch: Partial<ApiProviderConfig>) => {
      setProviderConfigs((prev) =>
        prev.map((item) =>
          item.providerId === providerId ? { ...item, ...patch } : item,
        ),
      );
    },
    [],
  );

  const findUserEnvVar = React.useCallback(
    (key: string) =>
      envVars.find((item) => item.scope === "user" && item.key === key) ?? null,
    [envVars],
  );

  const upsertUserEnvVar = React.useCallback(
    async (key: string, value: string, description: string) => {
      const existing = findUserEnvVar(key);
      if (existing) {
        await envVarsService.update(existing.id, {
          value,
          description,
        });
        return;
      }
      await envVarsService.create({
        key,
        value,
        description,
      });
    },
    [findUserEnvVar],
  );

  const deleteUserEnvVar = React.useCallback(
    async (key: string) => {
      const existing = findUserEnvVar(key);
      if (!existing) return;
      await envVarsService.remove(existing.id);
    },
    [findUserEnvVar],
  );

  const saveProvider = React.useCallback(
    async (providerId: string) => {
      const provider = providerConfigs.find(
        (item) => item.providerId === providerId,
      );
      if (!provider) return;

      setSavingProviderId(providerId);
      setProviderPatch(providerId, { isSaving: true });
      try {
        const keyValue = provider.keyInput.trim();
        const baseUrlValue = provider.baseUrlInput.trim();
        const keyDescription = `${provider.displayName} API key`;
        const baseUrlDescription = `${provider.displayName} base URL`;

        if (keyValue) {
          await upsertUserEnvVar(
            provider.apiKeyEnvKey,
            keyValue,
            keyDescription,
          );
        }

        if (baseUrlValue) {
          await upsertUserEnvVar(
            provider.baseUrlEnvKey,
            baseUrlValue,
            baseUrlDescription,
          );
        } else {
          await deleteUserEnvVar(provider.baseUrlEnvKey);
        }

        const [nextModelConfig, nextEnvVars] = await Promise.all([
          modelConfigService.get(),
          envVarsService.list(),
        ]);
        setModelConfig(nextModelConfig);
        setEnvVars(nextEnvVars);
        setProviderConfigs(
          nextModelConfig.providers.map((item) =>
            buildProviderConfig(item, nextEnvVars, null),
          ),
        );
        invalidateModelCatalog();
        toast.success(t("settings.providerSaveSuccess"));
      } catch (error) {
        console.error("[Settings] Failed to save provider settings:", error);
        toast.error(t("settings.providerSaveError"));
      } finally {
        setSavingProviderId(null);
        setProviderPatch(providerId, { isSaving: false });
      }
    },
    [deleteUserEnvVar, providerConfigs, setProviderPatch, t, upsertUserEnvVar],
  );

  const clearCustomProvider = React.useCallback(
    async (providerId: string) => {
      const provider = providerConfigs.find(
        (item) => item.providerId === providerId,
      );
      if (!provider) return;

      setSavingProviderId(providerId);
      setProviderPatch(providerId, { isSaving: true });
      try {
        await Promise.all([
          deleteUserEnvVar(provider.apiKeyEnvKey),
          deleteUserEnvVar(provider.baseUrlEnvKey),
        ]);
        const [nextModelConfig, nextEnvVars] = await Promise.all([
          modelConfigService.get(),
          envVarsService.list(),
        ]);
        setModelConfig(nextModelConfig);
        setEnvVars(nextEnvVars);
        setProviderConfigs(
          nextModelConfig.providers.map((item) =>
            buildProviderConfig(item, nextEnvVars, null),
          ),
        );
        invalidateModelCatalog();
        toast.success(t("settings.providerClearSuccess"));
      } catch (error) {
        console.error("[Settings] Failed to clear provider settings:", error);
        toast.error(t("settings.providerSaveError"));
      } finally {
        setSavingProviderId(null);
        setProviderPatch(providerId, { isSaving: false });
      }
    },
    [deleteUserEnvVar, providerConfigs, setProviderPatch, t],
  );

  return {
    modelConfig,
    providerConfigs,
    isLoading,
    savingProviderId,
    setProviderPatch,
    saveProvider,
    clearCustomProvider,
    refresh,
  };
}
