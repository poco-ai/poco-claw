"use client";

import * as React from "react";
import { Check, ChevronRight, Plus, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/lib/i18n/client";
import type { ApiProviderConfig } from "@/features/settings/types";

function splitModelDraft(value: string): string[] {
  return value
    .split(/[,\n，]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

interface ProviderModelFieldProps {
  config: ApiProviderConfig;
  inputId: string;
  onChange: (patch: Partial<ApiProviderConfig>) => void;
  onModelChange?: () => void;
}

function ProviderModelField({
  config,
  inputId,
  onChange,
  onModelChange,
}: ProviderModelFieldProps) {
  const { t } = useT("translation");
  const addModel = React.useCallback(
    (modelId: string) => {
      const nextModels = splitModelDraft(modelId);
      if (nextModels.length === 0) {
        return;
      }

      const nextSelectedModelIds = [...config.selectedModelIds];
      const seenModelIds = new Set(nextSelectedModelIds);

      nextModels.forEach((item) => {
        if (seenModelIds.has(item)) {
          return;
        }
        seenModelIds.add(item);
        nextSelectedModelIds.push(item);
      });
      onChange({
        selectedModelIds: nextSelectedModelIds,
        modelDraft: "",
      });
      onModelChange?.();
    },
    [config.selectedModelIds, onChange, onModelChange],
  );

  const commitDraft = React.useCallback(() => {
    addModel(config.modelDraft);
  }, [addModel, config.modelDraft]);

  const handleDraftKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      commitDraft();
    },
    [commitDraft],
  );

  const removeModel = React.useCallback(
    (modelId: string) => {
      onChange({
        selectedModelIds: config.selectedModelIds.filter(
          (item) => item !== modelId,
        ),
      });
      onModelChange?.();
    },
    [config.selectedModelIds, onChange, onModelChange],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          value={config.modelDraft}
          onChange={(event) => onChange({ modelDraft: event.target.value })}
          onKeyDown={handleDraftKeyDown}
          placeholder={t("settings.providerModelsSearchPlaceholder")}
          disabled={config.isSaving}
          className="h-9"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9 shrink-0"
          onClick={commitDraft}
          disabled={config.isSaving || config.modelDraft.trim().length === 0}
          title={t("settings.providerModelsAdd")}
          aria-label={t("settings.providerModelsAdd")}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      {config.selectedModelIds.length > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {config.selectedModelIds.map((modelId) => (
            <span
              key={modelId}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-foreground"
            >
              <span className="max-w-[120px] truncate">{modelId}</span>
              <span
                role="button"
                tabIndex={0}
                className="text-muted-foreground transition hover:text-foreground"
                onClick={() => removeModel(modelId)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") {
                    return;
                  }
                  event.preventDefault();
                  removeModel(modelId);
                }}
              >
                <X className="size-3" />
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface ApiProviderSectionProps {
  config: ApiProviderConfig;
  onChange: (patch: Partial<ApiProviderConfig>) => void;
  onSave: () => Promise<void> | void;
  onClear: () => Promise<void> | void;
  onToggleEnabled?: (enabled: boolean) => void;
}

function ApiProviderSection({
  config,
  onChange,
  onSave,
  onClear,
  onToggleEnabled,
}: ApiProviderSectionProps) {
  const { t } = useT("translation");
  const apiKeyInputId = `${config.providerId}-api-key`;
  const baseUrlInputId = `${config.providerId}-base-url`;
  const modelInputId = `${config.providerId}-model`;
  const [isEditingKey, setIsEditingKey] = React.useState(false);
  const canClear =
    config.hasStoredUserKey ||
    config.hasStoredUserBaseUrl ||
    config.selectedModelIds.length > 0;
  const storedBaseUrl = React.useMemo(
    () =>
      config.baseUrlSource === "user" ? config.effectiveBaseUrl.trim() : "",
    [config.baseUrlSource, config.effectiveBaseUrl],
  );
  const storedModelIds = React.useMemo(
    () => config.models.map((item) => item.model_id),
    [config.models],
  );

  const hasChanges =
    config.keyInput.trim().length > 0 ||
    config.baseUrlInput.trim() !== storedBaseUrl ||
    config.modelDraft.trim().length > 0 ||
    JSON.stringify(config.selectedModelIds) !== JSON.stringify(storedModelIds);

  // Check if provider can be enabled (must have API key and at least one model)
  const canActivate = config.hasStoredUserKey && storedModelIds.length > 0;

  const handleBlur = React.useCallback(() => {
    if (hasChanges && !config.isSaving) {
      void onSave();
      setIsEditingKey(false);
    }
  }, [hasChanges, config.isSaving, onSave]);

  const handleModelChange = React.useCallback(() => {
    if (!config.isSaving) {
      void onSave();
    }
  }, [config.isSaving, onSave]);

  const handleToggleEnabled = React.useCallback(
    (checked: boolean) => {
      if (!checked || canActivate) {
        onToggleEnabled?.(checked);
      }
    },
    [canActivate, onToggleEnabled],
  );

  const handleStartEditKey = React.useCallback(() => {
    setIsEditingKey(true);
  }, []);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between border-b border-border/50 pb-2">
        <h2 className="text-base font-semibold">{config.displayName}</h2>
        <div className="flex items-center gap-2">
          {!canActivate && config.enabled && (
            <span className="text-[10px] text-muted-foreground">
              {t("settings.providerNeedConfig")}
            </span>
          )}
          <Switch
            checked={config.enabled}
            onCheckedChange={handleToggleEnabled}
            disabled={!canActivate && !config.enabled}
          />
        </div>
      </div>
      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={apiKeyInputId} className="text-xs">
            {t("settings.providerApiKeyLabel", {
              provider: config.displayName,
            })}
          </Label>
          {config.hasStoredUserKey && !isEditingKey && !config.keyInput ? (
            <button
              type="button"
              onClick={handleStartEditKey}
              className="flex h-9 w-full items-center justify-between rounded-md border border-border bg-transparent px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
              disabled={config.isSaving}
            >
              <span className="flex items-center gap-2">
                <Check className="size-3.5 text-primary" />
                {t("settings.providerApiKeyConfigured")}
              </span>
              <ChevronRight className="size-3.5" />
            </button>
          ) : (
            <Input
              id={apiKeyInputId}
              type="password"
              value={config.keyInput}
              onChange={(event) => onChange({ keyInput: event.target.value })}
              onBlur={handleBlur}
              placeholder={t("settings.providerApiKeyPlaceholder", {
                provider: config.displayName,
              })}
              disabled={config.isSaving}
              className="h-9"
            />
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={baseUrlInputId} className="text-xs">
            {t("settings.providerBaseUrlLabel")}
          </Label>
          <Input
            id={baseUrlInputId}
            value={config.baseUrlInput}
            onChange={(event) => onChange({ baseUrlInput: event.target.value })}
            onBlur={handleBlur}
            placeholder={config.defaultBaseUrl}
            disabled={config.isSaving}
            className="h-9"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={modelInputId} className="text-xs">
            {t("settings.sidebar.models")}
          </Label>
          {storedModelIds.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
              {storedModelIds.length}
            </span>
          )}
        </div>
        <ProviderModelField
          config={config}
          inputId={modelInputId}
          onChange={onChange}
          onModelChange={handleModelChange}
        />
      </div>

      {canClear && (
        <div className="pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void onClear()}
            disabled={config.isSaving}
            className="text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
            {t("settings.providerClearCustom")}
          </Button>
        </div>
      )}
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
  const [activeProviderId, setActiveProviderId] = React.useState("");

  React.useEffect(() => {
    if (providers.length === 0) {
      if (activeProviderId) {
        setActiveProviderId("");
      }
      return;
    }

    const hasActiveProvider = providers.some(
      (provider) => provider.providerId === activeProviderId,
    );
    if (!hasActiveProvider) {
      setActiveProviderId(providers[0].providerId);
    }
  }, [activeProviderId, providers]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="rounded-3xl border border-border/60 bg-card/60 p-5 text-sm text-muted-foreground">
            {t("status.loading")}
          </div>
        </div>
      ) : providers.length > 0 && activeProviderId ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:grid md:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden min-h-0 flex-col border-r border-border/50 md:flex">
            <nav className="flex-1 overflow-y-auto p-2">
              <div className="space-y-1">
                {providers.map((provider) => {
                  const isActive = activeProviderId === provider.providerId;

                  return (
                    <button
                      key={provider.providerId}
                      type="button"
                      onClick={() => setActiveProviderId(provider.providerId)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                        isActive
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      }`}
                      aria-current={isActive ? "true" : undefined}
                    >
                      <span className="truncate font-medium">
                        {provider.displayName}
                      </span>
                      {provider.enabled && (
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          ON
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </nav>
          </aside>

          <div className="hidden min-h-0 flex-1 overflow-y-auto md:block">
            {providers.map((provider) => (
              <div
                key={provider.providerId}
                className={
                  activeProviderId === provider.providerId ? "block" : "hidden"
                }
              >
                <div className="p-4">
                  <ApiProviderSection
                    config={provider}
                    onChange={(patch) =>
                      onChangeProvider(provider.providerId, patch)
                    }
                    onSave={() => onSaveProvider(provider.providerId)}
                    onClear={() => onClearProvider(provider.providerId)}
                    onToggleEnabled={(enabled) =>
                      onChangeProvider(provider.providerId, { enabled })
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto border-b border-border/50 px-4 py-2 md:hidden">
            {providers.map((provider) => {
              const isActive = activeProviderId === provider.providerId;

              return (
                <button
                  key={provider.providerId}
                  type="button"
                  onClick={() => setActiveProviderId(provider.providerId)}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60"
                  }`}
                >
                  <span>{provider.displayName}</span>
                  {provider.enabled && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      ON
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto md:hidden">
            {providers.map((provider) => (
              <div
                key={provider.providerId}
                className={
                  activeProviderId === provider.providerId ? "block" : "hidden"
                }
              >
                <div className="p-3">
                  <ApiProviderSection
                    config={provider}
                    onChange={(patch) =>
                      onChangeProvider(provider.providerId, patch)
                    }
                    onSave={() => onSaveProvider(provider.providerId)}
                    onClear={() => onClearProvider(provider.providerId)}
                    onToggleEnabled={(enabled) =>
                      onChangeProvider(provider.providerId, { enabled })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="rounded-3xl border border-border/60 bg-card/60 p-5 text-sm text-muted-foreground">
            {t("settings.providerListEmpty")}
          </div>
        </div>
      )}
    </div>
  );
}
