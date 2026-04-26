"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { updateRoom, deleteRoom } from "@/lib/actions/rooms";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import {
  DirtyFormGuard,
  useFormDirtyOnRef,
} from "@/components/ui/dirty-form-guard";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { FormErrors } from "@/components/admin/form-message";

interface RoomEditFormProps {
  room: {
    id: string;
    name: string;
    description: string | null;
    is_active: boolean;
  };
}

export function RoomEditForm({ room }: RoomEditFormProps) {
  const router = useRouter();
  const t = useTranslations();
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [dirty, resetDirty] = useFormDirtyOnRef(formRef);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setErrors(undefined);

    const result = await updateRoom(room.id, formData);

    if (result && 'error' in result) {
      setErrors(result.error);
      setSubmitting(false);
      toast.error(t("admin.rooms.edit.toastSaveError"));
      return;
    }

    toast.success(t("admin.rooms.edit.toastSaved"));
    resetDirty();
    router.refresh();
    setSubmitting(false);
  }

  async function handleDelete() {
    const result = await deleteRoom(room.id);

    if (result && 'error' in result) {
      const err = result.error as Record<string, string[]>;
      const message =
        err._form?.join(" ") ?? t("admin.rooms.edit.toastDeleteError");
      throw new Error(message);
    }

    toast.success(t("admin.rooms.edit.toastDeleted"));
    router.push("/admin/rooms");
  }

  return (
    <DirtyFormGuard dirty={dirty && !submitting}>
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.rooms.edit.cardTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={handleSubmit} className="space-y-4">
          <FormErrors errors={errors} />

          <div className="space-y-2">
            <Label htmlFor="name">{t("admin.rooms.fields.name")}</Label>
            <Input id="name" name="name" defaultValue={room.name} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">
              {t("admin.rooms.fields.description")}
            </Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={room.description ?? ""}
              rows={3}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="is_active"
              name="is_active"
              type="checkbox"
              defaultChecked={room.is_active}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="is_active">
              {t("admin.rooms.fields.active")}
            </Label>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={submitting}>
              {submitting
                ? t("admin.rooms.edit.saving")
                : t("admin.rooms.edit.save")}
            </Button>
            <Link
              href="/admin/rooms"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              {t("admin.rooms.edit.back")}
            </Link>
            <div className="ml-auto">
              <ConfirmButton
                title={t("admin.rooms.edit.deleteTitle")}
                description={
                  <p>
                    {t("admin.rooms.edit.deleteDescription", {
                      name: room.name,
                    })}
                  </p>
                }
                confirmLabel={t("admin.rooms.edit.deleteConfirmLabel")}
                onConfirm={handleDelete}
              >
                {t("admin.rooms.edit.delete")}
              </ConfirmButton>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
    </DirtyFormGuard>
  );
}
