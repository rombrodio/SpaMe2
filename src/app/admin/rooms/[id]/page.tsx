import { notFound } from "next/navigation";
import {
  getRoom,
  getRoomServices,
  getRoomBlocks,
} from "@/lib/actions/rooms";
import { getServices } from "@/lib/actions/services";
import { RoomEditForm } from "@/components/admin/room/edit-form";
import { RoomServicesSection } from "@/components/admin/room/services-section";
import { RoomBlocksSection } from "@/components/admin/room/blocks-section";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RoomDetailPage({ params }: Props) {
  const { id } = await params;

  let room;
  try {
    room = await getRoom(id);
  } catch {
    notFound();
  }

  const [roomServices, allServices, blocks] = await Promise.all([
    getRoomServices(id),
    getServices(),
    getRoomBlocks(id),
  ]);

  const assignedServiceIds = roomServices.map((rs: any) => rs.service_id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Edit Room</h1>

      <RoomEditForm room={room} />

      <RoomServicesSection
        roomId={id}
        allServices={allServices}
        assignedServiceIds={assignedServiceIds}
      />

      <RoomBlocksSection roomId={id} blocks={blocks} />
    </div>
  );
}
