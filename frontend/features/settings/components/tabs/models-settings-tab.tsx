"use client";

import * as React from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/client";
import type { ApiProviderConfig } from "@/features/settings/types";

function getStatusLabel(
  t: (key: string) => string,
  credentialState: ApiProviderConfig["credentialState"],
) {
  if (credentialState === "user") {
    return t("settings.providerStatusUser");
  }
  if (credentialState === "system") {
    return t("settings.providerStatusSystem");
  }
  return t("settings.providerStatusNone");
}

interface ApiProviderSectionProps {
  config: ApiProviderConfig;
  onChange: (patch: Partial<ApiProviderConfig>) => void;
  onSave: () => Promise<void> | void;
  onClear: () => Promise<void> | void;
}

function ApiProviderSection({
  config,
  onChange,
  onSave,
  onClear,
}: ApiProviderSectionProps) {
  const { t } = useT("translation");
  const statusLabel = getStatusLabel(t, config.credentialState);
  const canClear = config.hasStoredUserKey || config.hasStoredUserBaseUrl;
  const storedBaseUrl = React.useMemo(
    () =>
      config.baseUrlSource === "user" ? config.effectiveBaseUrl.trim() : "",
    [config.baseUrlSource, config.effectiveBaseUrl],
  );
  const hasChanges =
    config.keyInput.trim().length > 0 ||
    config.baseUrlInput.trim() !== storedBaseUrl;

  return (
    <section className="space-y-4 rounded-3xl border border-border/60 bg-card/60 p-5 shadow-[var(--shadow-sm)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-medium text-foreground">
              {config.displayName}
            </h3>
            <Badge variant="outline">{statusLabel}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-1 self-start">
          {canClear ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => void onClear()}
              disabled={config.isSaving}
              title={t("settings.providerClearCustom")}
            >
              <RotateCcw className="size-4" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => void onSave()}
            disabled={config.isSaving || !hasChanges}
            title={t("common.save")}
          >
            {config.isSaving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          {t("settings.providerApiKeyLabel", { provider: config.displayName })}
        </p>
        <Input
          type="password"
          value={config.keyInput}
          onChange={(event) => onChange({ keyInput: event.target.value })}
          placeholder={t("settings.providerApiKeyPlaceholder", {
            provider: config.displayName,
          })}
          disabled={config.isSaving}
        />
        <p className="text-xs text-muted-foreground">
          {t("settings.providerApiKeyHint")}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          {t("settings.providerBaseUrlLabel")}
        </p>
        <Input
          value={config.baseUrlInput}
          onChange={(event) => onChange({ baseUrlInput: event.target.value })}
          placeholder={config.defaultBaseUrl}
          disabled={config.isSaving}
        />
        <p className="text-xs text-muted-foreground">
          {t("settings.providerBaseUrlHint")}
        </p>
      </div>
    </section>
  );
}

interface ModelsSettingsTabProps {
  providers: ApiProviderConfig[];
  isLoading: boolean;
  onChangeProvider: (
    providerId: string,
    patch: Partial<ApiProviderConfig>,
  ) => void;
  onSaveProvider: (providerId: string) => Promise<void> | void;
  onClearProvider: (providerId: string) => Promise<void> | void;
}

export function ModelsSettingsTab({
  providers,
  isLoading,
  onChangeProvider,
  onSaveProvider,
  onClearProvider,
}: ModelsSettingsTabProps) {
  const { t } = useT("translation");

  return (
    <div className="flex-1 space-y-8 overflow-y-auto p-6">
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          {t("settings.modelConfigTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t("settings.providerConfigDescription")}
        </p>
      </section>

      <section className="space-y-4">
        {isLoading ? (
          <div className="rounded-3xl border border-border/60 bg-card/60 p-5 text-sm text-muted-foreground">
            {t("status.loading")}
          </div>
        ) : providers.length > 0 ? (
          providers.map((provider) => (
            <ApiProviderSection
              key={provider.providerId}
              config={provider}
              onChange={(patch) => onChangeProvider(provider.providerId, patch)}
              onSave={() => onSaveProvider(provider.providerId)}
              onClear={() => onClearProvider(provider.providerId)}
            />
          ))
        ) : (
          <div className="rounded-3xl border border-border/60 bg-card/60 p-5 text-sm text-muted-foreground">
            {t("settings.providerListEmpty")}
          </div>
        )}
      </section>
    </div>
  );
}
