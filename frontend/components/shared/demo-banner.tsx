import { useT } from "@/lib/i18n/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export function DemoBanner() {
  const { t } = useT();

  return (
    <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-center">
        {t("demoMode.banner")}
      </AlertDescription>
    </Alert>
  );
}
