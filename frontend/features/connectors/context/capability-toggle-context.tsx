"use client";

import {
  createContext,
  useContext,
  useCallback,
  useState,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { mcpService } from "@/features/capabilities/mcp/api/mcp-api";
import { skillsService } from "@/features/capabilities/skills/api/skills-api";

interface CapabilityToggleContextValue {
  mcpEnabledMap: Record<number, boolean>;
  skillEnabledMap: Record<number, boolean>;
  isLoading: boolean;
  hasFetched: boolean;

  toggleMcp: (serverId: number, enabled: boolean) => void;
  toggleSkill: (skillId: number, enabled: boolean) => void;
  refreshFromApi: () => Promise<void>;
  getMcpEnabled: (serverId: number, defaultEnabled: boolean) => boolean;
  getSkillEnabled: (skillId: number, defaultEnabled: boolean) => boolean;
}

const CapabilityToggleContext =
  createContext<CapabilityToggleContextValue | null>(null);

/**
 * Hook to access the capability toggle context.
 * Returns null if used outside of CapabilityToggleProvider.
 */
export function useCapabilityToggle() {
  return useContext(CapabilityToggleContext);
}

interface CapabilityToggleProviderProps {
  children: ReactNode;
}

export function CapabilityToggleProvider({
  children,
}: CapabilityToggleProviderProps) {
  const [mcpEnabledMap, setMcpEnabledMap] = useState<Record<number, boolean>>(
    {},
  );
  const [skillEnabledMap, setSkillEnabledMap] = useState<
    Record<number, boolean>
  >({});
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const didInitialFetchRef = useRef(false);

  const refreshFromApi = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const [mcpInstalls, skillInstalls] = await Promise.all([
        mcpService.listInstalls(),
        skillsService.listInstalls(),
      ]);

      const newMcpMap: Record<number, boolean> = {};
      for (const install of mcpInstalls) {
        newMcpMap[install.server_id] = install.enabled;
      }

      const newSkillMap: Record<number, boolean> = {};
      for (const install of skillInstalls) {
        newSkillMap[install.skill_id] = install.enabled;
      }

      setMcpEnabledMap(newMcpMap);
      setSkillEnabledMap(newSkillMap);
      setHasFetched(true);
    } catch (error) {
      console.error("[CapabilityToggleContext] Failed to fetch data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  useEffect(() => {
    if (didInitialFetchRef.current) return;
    didInitialFetchRef.current = true;
    void refreshFromApi();
  }, [refreshFromApi]);

  const toggleMcp = useCallback((serverId: number, enabled: boolean) => {
    setMcpEnabledMap((prev) => ({
      ...prev,
      [serverId]: enabled,
    }));
  }, []);

  const toggleSkill = useCallback((skillId: number, enabled: boolean) => {
    setSkillEnabledMap((prev) => ({
      ...prev,
      [skillId]: enabled,
    }));
  }, []);

  const getMcpEnabled = useCallback(
    (serverId: number, defaultEnabled: boolean) => {
      const override = mcpEnabledMap[serverId];
      return typeof override === "boolean" ? override : defaultEnabled;
    },
    [mcpEnabledMap],
  );

  const getSkillEnabled = useCallback(
    (skillId: number, defaultEnabled: boolean) => {
      const override = skillEnabledMap[skillId];
      return typeof override === "boolean" ? override : defaultEnabled;
    },
    [skillEnabledMap],
  );

  const value: CapabilityToggleContextValue = {
    mcpEnabledMap,
    skillEnabledMap,
    isLoading,
    hasFetched,
    toggleMcp,
    toggleSkill,
    refreshFromApi,
    getMcpEnabled,
    getSkillEnabled,
  };

  return (
    <CapabilityToggleContext.Provider value={value}>
      {children}
    </CapabilityToggleContext.Provider>
  );
}
