"use client";

import * as React from "react";

import { apiClient, API_ENDPOINTS } from "@/services/api-client";
import type { ModelConfigResponse } from "@/features/chat/types";
import { buildModelCatalogOptions } from "@/features/chat/lib/model-catalog";
import {
  getModelCatalogInvalidatedEventName,
  readCustomModelIds,
} from "@/features/chat/lib/model-catalog-state";

export function useModelCatalog(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const [modelConfig, setModelConfig] =
    React.useState<ModelConfigResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(enabled);
  const [customModelIds, setCustomModelIds] = React.useState<string[]>([]);

  const refresh = React.useCallback(async () => {
    if (!enabled) {
      return;
    }

    setIsLoading(true);
    try {
      const nextConfig = await apiClient.get<ModelConfigResponse>(
        API_ENDPOINTS.models,
      );
      setModelConfig(nextConfig);
    } catch (error) {
      console.error("[Chat] Failed to load model catalog:", error);
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  React.useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    setCustomModelIds(readCustomModelIds());
    void refresh();
  }, [enabled, refresh]);

  React.useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    const eventName = getModelCatalogInvalidatedEventName();
    const handleInvalidated = () => {
      setCustomModelIds(readCustomModelIds());
      void refresh();
    };
    const handleStorage = () => {
      setCustomModelIds(readCustomModelIds());
    };

    window.addEventListener(eventName, handleInvalidated);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(eventName, handleInvalidated);
      window.removeEventListener("storage", handleStorage);
    };
  }, [enabled, refresh]);

  return {
    modelConfig,
    modelOptions: buildModelCatalogOptions(modelConfig, customModelIds),
    isLoading,
    refresh,
  };
}
