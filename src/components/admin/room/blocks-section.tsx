"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createRoomBlock, deleteRoomBlock } from "@/lib/actions/rooms";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { FormErrors } from "@/components/admin/form-message";

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

export function RoomBlocksSection({ roomId, blocks }: RoomBlocksSectionProps) {
  const router = useRouter();
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
      toast.error("Couldn't add room block.");
      return;
    }

    toast.success("Room block added.");
    setSubmitting(false);
    router.refresh();
  }

  async function handleDelete(blockId: string) {
    const result = await deleteRoomBlock(blockId, roomId);

    if (result && "error" in result) {
      const err = result.error as Record<string, string[]>;
      throw new Error(err._form?.join(" ") ?? "Couldn't delete block.");
    }

    toast.success("Block removed.");
    router.refresh();
  }

  function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString("en-IL", {
      timeZone: "Asia/Jerusalem",
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Room Blocks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Existing blocks */}
        {blocks.length === 0 ? (
          <p className="text-muted-foreground text-sm">No blocks scheduled.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">Start</th>
                  <th className="pb-2 font-medium">End</th>
                  <th className="pb-2 font-medium">Reason</th>
                  <th className="pb-2 font-medium">Actions</th>
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
                        title="Delete room block"
                        description={
                          <p>
                            Remove this block (
                            {formatDateTime(block.start_at)} –{" "}
                            {formatDateTime(block.end_at)})? The room becomes
                            bookable again during this window.
                          </p>
                        }
                        confirmLabel="Delete"
                        onConfirm={() => handleDelete(block.id)}
                      >
                        Delete
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
          <h3 className="text-sm font-semibold mb-3">Add Block</h3>
          <form action={handleAdd} className="space-y-4">
            <FormErrors errors={errors} />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_at">Start</Label>
                <Input
                  id="start_at"
                  name="start_at"
                  type="datetime-local"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_at">End</Label>
                <Input
                  id="end_at"
                  name="end_at"
                  type="datetime-local"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason (optional)</Label>
              <Input id="reason" name="reason" />
            </div>

            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding..." : "Add Block"}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
