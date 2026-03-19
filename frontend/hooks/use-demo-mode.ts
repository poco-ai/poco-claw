import { useMemo } from "react";

export function useDemoMode(): boolean {
  return useMemo(() => {
    if (typeof window === "undefined") return false;
    return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  }, []);
}
