import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getRooms } from "@/lib/actions/rooms";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RowLink } from "@/components/admin/row-link";

export default async function RoomsListPage() {
  const [rooms, t] = await Promise.all([getRooms(), getTranslations()]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("admin.rooms.title")}</h1>
        <Link href="/admin/rooms/new" className={cn(buttonVariants())}>
          {t("admin.rooms.newButton")}
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.rooms.cardTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {rooms.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("admin.rooms.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">
                      {t("admin.rooms.columns.name")}
                    </th>
                    <th className="pb-2 font-medium">
                      {t("admin.rooms.columns.description")}
                    </th>
                    <th className="pb-2 font-medium">
                      {t("admin.rooms.columns.status")}
                    </th>
                    <th className="pb-2 font-medium">
                      {t("admin.rooms.columns.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((room) => (
                    <RowLink key={room.id} href={`/admin/rooms/${room.id}`}>
                      <td className="py-3">{room.name}</td>
                      <td className="py-3 max-w-xs truncate text-muted-foreground">
                        {room.description || "\u2014"}
                      </td>
                      <td className="py-3">
                        <Badge
                          variant={room.is_active ? "success" : "muted"}
                        >
                          <span className="dot mr-1.5 inline-block h-1.5 w-1.5 rounded-full" />
                          {room.is_active
                            ? t("admin.rooms.statuses.active")
                            : t("admin.rooms.statuses.inactive")}
                        </Badge>
                      </td>
                    </RowLink>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
