"use client";

import * as React from "react";
import { Loader2, Settings2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { useAppShell } from "@/components/shell/app-shell-context";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { CapabilityContentShell } from "@/features/capabilities/components/capability-content-shell";
import {
  clearCachedSkillsMarketplaceRecommendations,
  readCachedSkillsMarketplaceRecommendations,
  writeCachedSkillsMarketplaceRecommendations,
} from "@/features/capabilities/skills/api/skills-marketplace-cache";
import { skillsService } from "@/features/capabilities/skills/api/skills-api";
import { SkillImportDialog } from "@/features/capabilities/skills/components/skill-import-dialog";
import { SkillMarketplaceBrowser } from "@/features/capabilities/skills/components/skill-marketplace-browser";
import type {
  SkillImportDiscoverResponse,
  SkillsMpRecommendationSection,
  SkillsMpSkillItem,
} from "@/features/capabilities/skills/types";
import { ApiError } from "@/lib/errors";
import { useT } from "@/lib/i18n/client";

export function SkillsMarketplacePageClient() {
  const { t } = useT("translation");
  const { openSettings } = useAppShell();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isSemanticSearch, setIsSemanticSearch] = React.useState(false);
  const [recommendations, setRecommendations] = React.useState<
    SkillsMpRecommendationSection[]
  >([]);
  const [searchItems, setSearchItems] = React.useState<SkillsMpSkillItem[]>([]);
  const [hasActiveSearch, setHasActiveSearch] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [downloadingExternalId, setDownloadingExternalId] = React.useState<
    string | null
  >(null);
  const [isConfigured, setIsConfigured] = React.useState(false);
  const [isStatusLoading, setIsStatusLoading] = React.useState(false);
  const [importDialogOpen, setImportDialogOpen] = React.useState(false);
  const [initialDiscoverResponse, setInitialDiscoverResponse] =
    React.useState<SkillImportDiscoverResponse | null>(null);
  const isActiveRef = React.useRef(true);

  React.useEffect(() => {
    isActiveRef.current = true;
    return () => {
      isActiveRef.current = false;
    };
  }, []);

  const loadMarketplaceStatus =
    React.useCallback(async (): Promise<boolean> => {
      setIsStatusLoading(true);
      try {
        const response = await skillsService.getMarketplaceStatus();
        if (!isActiveRef.current) return false;
        setIsConfigured(response.configured);
        return response.configured;
      } catch (error) {
        console.error(
          "[SkillsMarketplacePage] marketplace status failed:",
          error,
        );
        if (!isActiveRef.current) return false;
        setIsConfigured(false);
        return false;
      } finally {
        if (isActiveRef.current) {
          setIsStatusLoading(false);
        }
      }
    }, []);

  const loadMarketplaceRecommendations = React.useCallback(
    async (options?: { forceRefresh?: boolean }) => {
      const forceRefresh = options?.forceRefresh ?? false;

      if (!forceRefresh) {
        const cachedSections = readCachedSkillsMarketplaceRecommendations();
        if (cachedSections) {
          setRecommendations(cachedSections);
          setSearchItems([]);
          setHasActiveSearch(false);
          setErrorMessage(null);
          return;
        }
      } else {
        clearCachedSkillsMarketplaceRecommendations();
      }

      setIsLoading(true);
      setErrorMessage(null);
      try {
        const response = await skillsService.listMarketplaceRecommendations({
          limit: 8,
        });
        if (!isActiveRef.current) return;
        const nextSections = response.sections || [];
        writeCachedSkillsMarketplaceRecommendations(nextSections);
        setRecommendations(nextSections);
        setSearchItems([]);
        setHasActiveSearch(false);
      } catch (error) {
        console.error(
          "[SkillsMarketplacePage] marketplace recommendations failed:",
          error,
        );
        if (!isActiveRef.current) return;
        setErrorMessage(
          error instanceof ApiError
            ? error.message
            : t("library.skillsImport.toasts.marketplaceLoadError"),
        );
      } finally {
        if (isActiveRef.current) {
          setIsLoading(false);
        }
      }
    },
    [t],
  );

  React.useEffect(() => {
    void loadMarketplaceStatus();
  }, [loadMarketplaceStatus]);

  React.useEffect(() => {
    if (isStatusLoading || !isConfigured) return;
    if (recommendations.length > 0 || hasActiveSearch || isLoading) return;
    void loadMarketplaceRecommendations();
  }, [
    hasActiveSearch,
    isConfigured,
    isLoading,
    isStatusLoading,
    loadMarketplaceRecommendations,
    recommendations.length,
  ]);

  const searchMarketplace = React.useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) {
      setHasActiveSearch(false);
      setSearchItems([]);
      await loadMarketplaceRecommendations();
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await skillsService.searchMarketplaceSkills({
        q: query,
        page: 1,
        page_size: 12,
        semantic: isSemanticSearch,
      });
      if (!isActiveRef.current) return;
      setSearchItems(response.items || []);
      setHasActiveSearch(true);
    } catch (error) {
      console.error(
        "[SkillsMarketplacePage] marketplace search failed:",
        error,
      );
      if (!isActiveRef.current) return;
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : t("library.skillsImport.toasts.marketplaceLoadError"),
      );
    } finally {
      if (isActiveRef.current) {
        setIsLoading(false);
      }
    }
  }, [isSemanticSearch, loadMarketplaceRecommendations, searchQuery, t]);

  const resetMarketplaceSearch = React.useCallback(async () => {
    setSearchQuery("");
    setSearchItems([]);
    setHasActiveSearch(false);
    await loadMarketplaceRecommendations();
  }, [loadMarketplaceRecommendations]);

  const refreshMarketplaceRecommendations = React.useCallback(async () => {
    setSearchQuery("");
    setSearchItems([]);
    setHasActiveSearch(false);
    await loadMarketplaceRecommendations({ forceRefresh: true });
  }, [loadMarketplaceRecommendations]);

  const onMarketplaceDownload = React.useCallback(
    async (item: SkillsMpSkillItem) => {
      setDownloadingExternalId(item.external_id);
      try {
        const response = await skillsService.marketplaceImportDiscover({
          item,
        });
        if (!isActiveRef.current) return;
        setInitialDiscoverResponse(response);
        setImportDialogOpen(true);
      } catch (error) {
        console.error(
          "[SkillsMarketplacePage] marketplace import discover failed:",
          error,
        );
        toast.error(t("library.skillsImport.toasts.marketplaceDiscoverError"));
      } finally {
        if (isActiveRef.current) {
          setDownloadingExternalId(null);
        }
      }
    },
    [t],
  );

  const openMarketplaceSettings = React.useCallback(() => {
    openSettings("other");
  }, [openSettings]);

  const handleDialogClose = React.useCallback(() => {
    setImportDialogOpen(false);
    setInitialDiscoverResponse(null);
  }, []);

  const handleRefresh = React.useCallback(async () => {
    const configured = await loadMarketplaceStatus();
    if (!configured) return;
    if (hasActiveSearch && searchQuery.trim()) {
      await searchMarketplace();
      return;
    }
    await refreshMarketplaceRecommendations();
  }, [
    hasActiveSearch,
    loadMarketplaceStatus,
    refreshMarketplaceRecommendations,
    searchMarketplace,
    searchQuery,
  ]);

  return (
    <>
      <div className="flex flex-1 flex-col overflow-hidden">
        <PullToRefresh onRefresh={handleRefresh} isLoading={isLoading}>
          <CapabilityContentShell className="overflow-auto">
            {isStatusLoading ? (
              <div className="flex min-h-[24rem] items-center justify-center rounded-[1.5rem] border border-border/60 bg-muted/20">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : !isConfigured ? (
              <Empty className="min-h-[24rem] rounded-[1.5rem] border border-border/60 bg-gradient-to-br from-muted/25 via-background to-background px-6 py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon" className="size-14 rounded-2xl">
                    <Sparkles className="size-7" />
                  </EmptyMedia>
                  <EmptyTitle>
                    {t("library.skillsImport.marketplace.setupTitle")}
                  </EmptyTitle>
                  <EmptyDescription>
                    {t("library.skillsImport.marketplace.setupDescription")}
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent className="max-w-md">
                  <p className="text-sm leading-6 text-muted-foreground">
                    {t("library.skillsImport.marketplace.setupHint")}
                  </p>
                  <Button
                    type="button"
                    onClick={openMarketplaceSettings}
                    className="min-w-44"
                  >
                    <Settings2 className="size-4" />
                    {t("library.skillsImport.marketplace.openSettings")}
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <SkillMarketplaceBrowser
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                isSemanticSearch={isSemanticSearch}
                onSemanticSearchChange={setIsSemanticSearch}
                onSearch={() => {
                  void searchMarketplace();
                }}
                onReset={() => {
                  void resetMarketplaceSearch();
                }}
                onRefreshRecommendations={() => {
                  void refreshMarketplaceRecommendations();
                }}
                isLoading={isLoading}
                errorMessage={errorMessage}
                sections={recommendations}
                items={searchItems}
                hasActiveSearch={hasActiveSearch}
                onDownload={(item) => {
                  void onMarketplaceDownload(item);
                }}
                downloadingExternalId={downloadingExternalId}
              />
            )}
          </CapabilityContentShell>
        </PullToRefresh>
      </div>

      <SkillImportDialog
        open={importDialogOpen}
        onClose={handleDialogClose}
        initialDiscoverResponse={initialDiscoverResponse}
      />
    </>
  );
}
