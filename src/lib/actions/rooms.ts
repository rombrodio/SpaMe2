"use server";

import { createClient } from "@/lib/supabase/server";
import { roomSchema, roomBlockSchema } from "@/lib/schemas/room";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { writeAuditLog } from "@/lib/audit";

// ── Room CRUD ──

export async function getRooms() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .order("name");
  if (error) throw new Error(error.message);
  return data;
}

export async function getRoom(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createRoom(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = roomSchema.safeParse({
    ...raw,
    is_active: raw.is_active === "on" || raw.is_active === "true",
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: inserted, error } = await supabase
    .from("rooms")
    .insert(parsed.data)
    .select("*")
    .single();
  if (error) return { error: { _form: [error.message] } };

  writeAuditLog({
    userId: user?.id,
    action: "create",
    entityType: "room",
    entityId: inserted.id,
    newData: inserted,
  });

  revalidatePath("/admin/rooms");
  return { success: true };
}

export async function updateRoom(id: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = roomSchema.safeParse({
    ...raw,
    is_active: raw.is_active === "on" || raw.is_active === "true",
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: oldRow } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { data: updated, error } = await supabase
    .from("rooms")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return { error: { _form: [error.message] } };

  writeAuditLog({
    userId: user?.id,
    action: "update",
    entityType: "room",
    entityId: id,
    oldData: oldRow ?? undefined,
    newData: updated,
  });

  revalidatePath("/admin/rooms");
  return { success: true };
}

export async function deleteRoom(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: oldRow } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("rooms").delete().eq("id", id);
  if (error) return { error: { _form: [error.message] } };

  writeAuditLog({
    userId: user?.id,
    action: "delete",
    entityType: "room",
    entityId: id,
    oldData: oldRow ?? undefined,
  });

  revalidatePath("/admin/rooms");
  return { success: true };
}

// ── Room Services (junction) ──

export async function getRoomServices(roomId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("room_services")
    .select("service_id, services(id, name)")
    .eq("room_id", roomId);
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Replace the room's set of compatible services.
 *
 * Diff-based for the same reason as `setTherapistServices`: `bookings.fk_room_service`
 * (migration 00007) is a composite FK on `(room_id, service_id)` — delete-all
 * fails whenever any booking references a pair we're about to remove (DEF-033).
 * We pre-check bookings and surface a translated error listing the blocked
 * service names; the admin must cancel/reassign first.
 */
export async function setRoomServices(roomId: string, serviceIds: string[]) {
  const supabase = await createClient();
  const t = await getTranslations();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: currentRows, error: currentError } = await supabase
    .from("room_services")
    .select("service_id")
    .eq("room_id", roomId);
  if (currentError) return { error: { _form: [currentError.message] } };

  const currentSet = new Set(
    (currentRows ?? []).map((r: { service_id: string }) => r.service_id)
  );
  const selectedSet = new Set(serviceIds);
  const toInsert = [...selectedSet].filter((id) => !currentSet.has(id));
  const toRemove = [...currentSet].filter((id) => !selectedSet.has(id));

  if (toRemove.length > 0) {
    const { data: blocking, error: blockingError } = await supabase
      .from("bookings")
      .select("service_id")
      .eq("room_id", roomId)
      .in("service_id", toRemove);
    if (blockingError) return { error: { _form: [blockingError.message] } };

    if (blocking && blocking.length > 0) {
      const blockedIds = Array.from(
        new Set(blocking.map((r: { service_id: string }) => r.service_id))
      );
      const { data: svcRows } = await supabase
        .from("services")
        .select("name")
        .in("id", blockedIds);
      const names = (svcRows ?? [])
        .map((s: { name: string }) => s.name)
        .join(", ");
      return {
        error: {
          _form: [
            t("admin.rooms.services.cantRemoveHasBookings", {
              names,
              count: blocking.length,
            }),
          ],
        },
      };
    }

    const { error: delError } = await supabase
      .from("room_services")
      .delete()
      .eq("room_id", roomId)
      .in("service_id", toRemove);
    if (delError) return { error: { _form: [delError.message] } };
  }

  if (toInsert.length > 0) {
    const rows = toInsert.map((service_id) => ({
      room_id: roomId,
      service_id,
    }));
    const { error: insError } = await supabase
      .from("room_services")
      .insert(rows);
    if (insError) return { error: { _form: [insError.message] } };
  }

  if (toInsert.length > 0 || toRemove.length > 0) {
    writeAuditLog({
      userId: user?.id,
      action: "update",
      entityType: "room_services",
      entityId: roomId,
      oldData: { service_ids: Array.from(currentSet).sort() },
      newData: { service_ids: Array.from(selectedSet).sort() },
    });
  }

  revalidatePath(`/admin/rooms/${roomId}`);
  return { success: true };
}

// ── Room Blocks ──

export async function getRoomBlocks(roomId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("room_blocks")
    .select("*")
    .eq("room_id", roomId)
    .order("start_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function createRoomBlock(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = roomBlockSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("room_blocks").insert(parsed.data);
  if (error) return { error: { _form: [error.message] } };

  revalidatePath(`/admin/rooms/${parsed.data.room_id}`);
  return { success: true };
}

export async function deleteRoomBlock(id: string, roomId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("room_blocks").delete().eq("id", id);
  if (error) return { error: { _form: [error.message] } };

  revalidatePath(`/admin/rooms/${roomId}`);
  return { success: true };
}
