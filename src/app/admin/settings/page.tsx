import { getTranslations } from "next-intl/server";
import { getSpaSettings } from "@/lib/actions/settings";
import { SettingsForm } from "@/components/admin/settings/settings-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_SPA_SETTINGS } from "@/lib/schemas/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, t] = await Promise.all([getSpaSettings(), getTranslations()]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.settings.title")}</h1>
        <p className="mt-1 text-muted-foreground">
          {t("admin.settings.subheading")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("admin.settings.configCardTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            {t("admin.settings.configIntro")}
          </p>
          <SettingsForm
            initialName={settings?.on_call_manager_name ?? ""}
            initialPhone={settings?.on_call_manager_phone ?? ""}
            initialBusinessHoursStart={
              settings?.business_hours_start ??
              DEFAULT_SPA_SETTINGS.businessHoursStart
            }
            initialBusinessHoursEnd={
              settings?.business_hours_end ??
              DEFAULT_SPA_SETTINGS.businessHoursEnd
            }
            initialSlotGranularityMinutes={
              settings?.slot_granularity_minutes ??
              DEFAULT_SPA_SETTINGS.slotGranularityMinutes
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
