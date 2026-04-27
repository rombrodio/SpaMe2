"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations, useLocale } from "next-intl";
import { createRoomBlock, deleteRoomBlock } from "@/lib/actions/rooms";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { FormErrors } from "@/components/admin/form-message";
import type { Locale } from "@/i18n/config";

interface RoomBlock {
  id: string;
  room_id: string;
  start_at: string;
  end_at: string;
  reason: string | null;
  created_at: string;
}

interface RoomBlocksSectionProps {
  roomId: string;
  blocks: RoomBlock[];
}

function intlLocale(locale: Locale): string {
  return locale === "he" ? "he-IL" : locale === "ru" ? "ru-IL" : "en-IL";
}

export function RoomBlocksSection({ roomId, blocks }: RoomBlocksSectionProps) {
  const router = useRouter();
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(formData: FormData) {
    setSubmitting(true);
    setErrors(undefined);

    formData.set("room_id", roomId);
    const result = await createRoomBlock(formData);

    if ("error" in result) {
      setErrors(result.error as Record<string, string[]>);
      setSubmitting(false);
      toast.error(t("admin.rooms.blocks.toasts.addError"));
      return;
    }

    toast.success(t("admin.rooms.blocks.toasts.added"));
    setSubmitting(false);
    router.refresh();
  }

  async function handleDelete(blockId: string) {
    const result = await deleteRoomBlock(blockId, roomId);

    if (result && "error" in result) {
      const err = result.error as Record<string, string[]>;
      throw new Error(
        err._form?.join(" ") ?? t("admin.rooms.blocks.toasts.deleteError")
      );
    }

    toast.success(t("admin.rooms.blocks.toasts.removed"));
    router.refresh();
  }

  function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString(intlLocale(locale), {
      timeZone: "Asia/Jerusalem",
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.rooms.blocks.cardTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Existing blocks */}
        {blocks.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("admin.rooms.blocks.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">
                    {t("admin.rooms.blocks.columns.start")}
                  </th>
                  <th className="pb-2 font-medium">
                    {t("admin.rooms.blocks.columns.end")}
                  </th>
                  <th className="pb-2 font-medium">
                    {t("admin.rooms.blocks.columns.reason")}
                  </th>
                  <th className="pb-2 font-medium">
                    {t("admin.rooms.blocks.columns.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {blocks.map((block) => (
                  <tr key={block.id} className="border-b last:border-0">
                    <td className="py-3">{formatDateTime(block.start_at)}</td>
                    <td className="py-3">{formatDateTime(block.end_at)}</td>
                    <td className="py-3 text-muted-foreground">
                      {block.reason || "\u2014"}
                    </td>
                    <td className="py-3">
                      <ConfirmButton
                        size="sm"
                        title={t("admin.rooms.blocks.deleteTitle")}
                        description={
                          <p>
                            {t("admin.rooms.blocks.deleteDescription", {
                              start: formatDateTime(block.start_at),
                              end: formatDateTime(block.end_at),
                            })}
                          </p>
                        }
                        confirmLabel={t("admin.rooms.blocks.deleteConfirmLabel")}
                        onConfirm={() => handleDelete(block.id)}
                      >
                        {t("admin.rooms.blocks.delete")}
                      </ConfirmButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add new block */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold mb-3">
            {t("admin.rooms.blocks.addHeading")}
          </h3>
          <form action={handleAdd} className="space-y-4">
            <FormErrors errors={errors} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("admin.rooms.blocks.labels.start")}</Label>
                <DateTimePicker name="start_at" required />
              </div>
              <div className="space-y-2">
                <Label>{t("admin.rooms.blocks.labels.end")}</Label>
                <DateTimePicker name="end_at" required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">
                {t("admin.rooms.blocks.labels.reasonOptional")}
              </Label>
              <Input id="reason" name="reason" />
            </div>

            <Button type="submit" disabled={submitting}>
              {submitting
                ? t("admin.rooms.blocks.adding")
                : t("admin.rooms.blocks.addButton")}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
