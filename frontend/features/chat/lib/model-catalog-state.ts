"use client";

const MODEL_CATALOG_INVALIDATED_EVENT = "poco:model-catalog-invalidated";
const CUSTOM_MODEL_IDS_STORAGE_KEY = "poco_custom_model_ids";

function normalizeModelId(modelId: string | null | undefined): string {
  return (modelId || "").trim();
}

function dedupeModelIds(modelIds: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  modelIds.forEach((modelId) => {
    const clean = normalizeModelId(modelId);
    if (!clean || seen.has(clean)) {
      return;
    }
    seen.add(clean);
    unique.push(clean);
  });

  return unique;
}

export function invalidateModelCatalog(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(MODEL_CATALOG_INVALIDATED_EVENT));
}

export function getModelCatalogInvalidatedEventName(): string {
  return MODEL_CATALOG_INVALIDATED_EVENT;
}

export function readCustomModelIds(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(CUSTOM_MODEL_IDS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return dedupeModelIds(parsed.filter((item) => typeof item === "string"));
  } catch {
    return [];
  }
}

function writeCustomModelIds(modelIds: string[]): string[] {
  const nextModelIds = dedupeModelIds(modelIds);

  if (typeof window === "undefined") {
    return nextModelIds;
  }

  try {
    if (nextModelIds.length === 0) {
      window.localStorage.removeItem(CUSTOM_MODEL_IDS_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        CUSTOM_MODEL_IDS_STORAGE_KEY,
        JSON.stringify(nextModelIds),
      );
    }
  } catch (error) {
    console.error("[Model Catalog] Failed to persist custom models:", error);
  }

  invalidateModelCatalog();
  return nextModelIds;
}

export function addCustomModelId(modelId: string): string[] {
  return writeCustomModelIds([...readCustomModelIds(), modelId]);
}

export function removeCustomModelId(modelId: string): string[] {
  const clean = normalizeModelId(modelId);
  return writeCustomModelIds(
    readCustomModelIds().filter((item) => item !== clean),
  );
}
