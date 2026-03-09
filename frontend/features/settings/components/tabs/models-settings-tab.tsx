"use client";

import { Loader2, RotateCcw, Save } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
  const modelNames = config.models.map((item) => item.display_name).join(", ");
  const canClear = config.hasStoredUserKey || config.hasStoredUserBaseUrl;

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
          <p className="text-sm text-muted-foreground">
            {t("settings.providerModels", { models: modelNames })}
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          {config.apiKeyEnvKey}
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

      <div className="space-y-3 rounded-2xl border border-border/50 bg-background/70 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              {t("settings.providerBaseUrlLabel")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("settings.providerBaseUrlHint")}
            </p>
          </div>
          <Switch
            checked={config.useCustomBaseUrl}
            onCheckedChange={(checked) => onChange({ useCustomBaseUrl: checked })}
            disabled={config.isSaving}
          />
        </div>
        <Input
          value={config.baseUrlInput}
          onChange={(event) => onChange({ baseUrlInput: event.target.value })}
          placeholder={config.defaultBaseUrl}
          disabled={!config.useCustomBaseUrl || config.isSaving}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void onSave()} disabled={config.isSaving}>
          {config.isSaving ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Save className="mr-2 size-4" />
          )}
          {config.isSaving ? t("common.saving") : t("common.save")}
        </Button>
        {canClear ? (
          <Button
            variant="outline"
            onClick={() => void onClear()}
            disabled={config.isSaving}
          >
            <RotateCcw className="mr-2 size-4" />
            {t("settings.providerClearCustom")}
          </Button>
        ) : null}
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
