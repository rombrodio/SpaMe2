import { getSpaSettings } from "@/lib/actions/settings";
import { SettingsForm } from "@/components/admin/settings/settings-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSpaSettings();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Operational settings editable without a redeploy.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">On-call manager</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            This phone number receives SMS and WhatsApp alerts for new
            unassigned bookings, therapist declines, and bookings close
            to start time that still need a therapist. Leave blank to
            disable these alerts.
          </p>
          <SettingsForm
            initialName={settings?.on_call_manager_name ?? ""}
            initialPhone={settings?.on_call_manager_phone ?? ""}
          />
        </CardContent>
      </Card>
    </div>
  );
}
