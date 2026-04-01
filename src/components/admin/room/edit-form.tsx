"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateRoom, deleteRoom } from "@/lib/actions/rooms";
import { Button, buttonVariants } from "@/components/ui/button";
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
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setErrors(undefined);

    const result = await updateRoom(room.id, formData);

    if (result && 'error' in result) {
      setErrors(result.error);
      setSubmitting(false);
      return;
    }

    router.refresh();
    setSubmitting(false);
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this room?")) return;

    setDeleting(true);
    const result = await deleteRoom(room.id);

    if (result && 'error' in result) {
      setErrors(result.error as Record<string, string[]>);
      setDeleting(false);
      return;
    }

    router.push("/admin/rooms");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Room Details</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-4">
          <FormErrors errors={errors} />

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={room.name} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
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
            <Label htmlFor="is_active">Active</Label>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save Changes"}
            </Button>
            <Link href="/admin/rooms" className={cn(buttonVariants({ variant: "outline" }))}>Back</Link>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="ml-auto"
            >
              {deleting ? "Deleting..." : "Delete Room"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
