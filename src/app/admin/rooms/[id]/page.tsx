import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  getRoom,
  getRoomServices,
  getRoomBlocks,
} from "@/lib/actions/rooms";
import { getServices } from "@/lib/actions/services";
import { RoomEditForm } from "@/components/admin/room/edit-form";
import { RoomServicesSection } from "@/components/admin/room/services-section";
import { RoomBlocksSection } from "@/components/admin/room/blocks-section";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

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

  const [roomServices, allServices, blocks, t] = await Promise.all([
    getRoomServices(id),
    getServices(),
    getRoomBlocks(id),
    getTranslations(),
  ]);

  const assignedServiceIds = (
    roomServices as Array<{ service_id: string }>
  ).map((rs) => rs.service_id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Breadcrumbs
        items={[
          { label: t("admin.rooms.crumb"), href: "/admin/rooms" },
          { label: room.name },
        ]}
      />
      <h1 className="text-2xl font-bold">{room.name}</h1>

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
