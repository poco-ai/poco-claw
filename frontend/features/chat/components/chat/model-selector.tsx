"use client";

import * as React from "react";
import { ChevronDown, Plus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/client";
import type { ModelConfigResponse } from "@/features/chat/types";
import type { ModelCatalogOption } from "@/features/chat/lib/model-catalog";
import { inferProviderId } from "@/features/chat/lib/model-catalog";
import { addCustomModelId } from "@/features/chat/lib/model-catalog-state";
import { toast } from "sonner";

interface ModelSelectorProps {
  options: ModelCatalogOption[];
  selectedModelId: string;
  defaultModelId?: string | null;
  fallbackLabel?: string;
  onChange: (modelId: string | null) => void;
  disabled?: boolean;
  triggerClassName?: string;
  modelConfig?: ModelConfigResponse | null;
}

function getCredentialLabel(
  t: (key: string) => string,
  credentialState: ModelCatalogOption["credentialState"],
) {
  if (credentialState === "user") {
    return t("settings.providerStatusUser");
  }
  if (credentialState === "system") {
    return t("settings.providerStatusSystem");
  }
  return t("settings.providerStatusNone");
}

export function ModelSelector({
  options,
  selectedModelId,
  defaultModelId,
  fallbackLabel,
  onChange,
  disabled = false,
  triggerClassName,
  modelConfig,
}: ModelSelectorProps) {
  const { t } = useT("translation");
  const [isCustomDialogOpen, setIsCustomDialogOpen] = React.useState(false);
  const [customModelInput, setCustomModelInput] = React.useState("");
  const defaultOption = React.useMemo(
    () =>
      options.find(
        (option) => option.modelId === (defaultModelId || "").trim(),
      ) ?? null,
    [defaultModelId, options],
  );
  const selectedOption = React.useMemo(
    () =>
      options.find((option) => option.modelId === selectedModelId.trim()) ??
      defaultOption,
    [defaultOption, options, selectedModelId],
  );
  const canOpen = !disabled && options.some((option) => option.isAvailable);

  const handleSaveCustomModel = React.useCallback(() => {
    const modelId = customModelInput.trim();
    if (!modelId) {
      toast.error(t("models.customModelRequired"));
      return;
    }

    const knownOption =
      options.find((option) => option.modelId === modelId) ?? null;
    if (knownOption) {
      if (!knownOption.isAvailable) {
        toast.error(t("models.customModelProviderUnavailable"));
        return;
      }
      onChange(knownOption.isDefault ? null : knownOption.modelId);
      setIsCustomDialogOpen(false);
      setCustomModelInput("");
      return;
    }

    const providerId = inferProviderId(modelId);
    if (!providerId) {
      toast.error(t("models.customModelUnsupported"));
      return;
    }

    const provider =
      modelConfig?.providers.find((item) => item.provider_id === providerId) ??
      null;
    if (!provider || provider.credential_state === "none") {
      toast.error(t("models.customModelProviderUnavailable"));
      return;
    }

    addCustomModelId(modelId);
    onChange(modelId);
    setIsCustomDialogOpen(false);
    setCustomModelInput("");
    toast.success(t("models.customModelSaved"));
  }, [customModelInput, modelConfig?.providers, onChange, options, t]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={triggerClassName}
            disabled={!canOpen}
            title={t("header.switchModel")}
          >
            <span className="max-w-[220px] truncate font-medium font-serif">
              {selectedOption?.displayName ||
                fallbackLabel ||
                t("status.loading")}
            </span>
            <ChevronDown className="ml-2 size-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          {defaultOption ? (
            <>
              <DropdownMenuItem
                onClick={() => onChange(null)}
                disabled={!defaultOption.isAvailable}
                className="flex items-start justify-between gap-3 p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {defaultOption.displayName}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{t("models.defaultTag")}</span>
                    <span>/</span>
                    <span>{defaultOption.providerName}</span>
                    <span>/</span>
                    <span>
                      {getCredentialLabel(t, defaultOption.credentialState)}
                    </span>
                  </div>
                </div>
                {selectedOption?.modelId === defaultOption.modelId ? (
                  <div className="text-primary text-sm">✓</div>
                ) : null}
              </DropdownMenuItem>
              {options.some((option) => !option.isDefault) ? (
                <DropdownMenuSeparator />
              ) : null}
            </>
          ) : null}

          {options
            .filter((option) => !option.isDefault)
            .map((option) => (
              <DropdownMenuItem
                key={option.modelId}
                onClick={() => onChange(option.modelId)}
                disabled={!option.isAvailable}
                className="flex items-start justify-between gap-3 p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {option.displayName}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{option.providerName}</span>
                    {option.isCustom ? (
                      <Badge
                        variant="outline"
                        className="h-5 px-1.5 text-[10px]"
                      >
                        {t("models.customBadge")}
                      </Badge>
                    ) : null}
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                      {getCredentialLabel(t, option.credentialState)}
                    </Badge>
                  </div>
                </div>
                {selectedOption?.modelId === option.modelId ? (
                  <div className="text-primary text-sm">✓</div>
                ) : null}
              </DropdownMenuItem>
            ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setIsCustomDialogOpen(true);
              setCustomModelInput(selectedModelId || "");
            }}
            className="gap-2 p-3"
          >
            <Plus className="size-4" />
            <span>{t("models.customModelAction")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={isCustomDialogOpen}
        onOpenChange={(open) => {
          setIsCustomDialogOpen(open);
          if (!open) {
            setCustomModelInput("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("models.customModelTitle")}</DialogTitle>
            <DialogDescription>
              {t("models.customModelDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={customModelInput}
              onChange={(event) => setCustomModelInput(event.target.value)}
              placeholder={t("models.customModelPlaceholder")}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {t("models.customModelHint")}
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCustomDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={handleSaveCustomModel}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
