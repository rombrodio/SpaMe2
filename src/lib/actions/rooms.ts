"use server";

import { createClient } from "@/lib/supabase/server";
import { roomSchema, roomBlockSchema } from "@/lib/schemas/room";
import { revalidatePath } from "next/cache";

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
  const { error } = await supabase.from("rooms").insert(parsed.data);
  if (error) return { error: { _form: [error.message] } };

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
  const { error } = await supabase.from("rooms").update(parsed.data).eq("id", id);
  if (error) return { error: { _form: [error.message] } };

  revalidatePath("/admin/rooms");
  return { success: true };
}

export async function deleteRoom(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("rooms").delete().eq("id", id);
  if (error) return { error: { _form: [error.message] } };

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

export async function setRoomServices(roomId: string, serviceIds: string[]) {
  const supabase = await createClient();

  const { error: delError } = await supabase
    .from("room_services")
    .delete()
    .eq("room_id", roomId);
  if (delError) return { error: { _form: [delError.message] } };

  if (serviceIds.length > 0) {
    const rows = serviceIds.map((service_id) => ({
      room_id: roomId,
      service_id,
    }));
    const { error: insError } = await supabase
      .from("room_services")
      .insert(rows);
    if (insError) return { error: { _form: [insError.message] } };
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
