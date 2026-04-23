import Link from "next/link";
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
  const rooms = await getRooms();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Rooms</h1>
        <Link href="/admin/rooms/new" className={cn(buttonVariants())}>New Room</Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Rooms</CardTitle>
        </CardHeader>
        <CardContent>
          {rooms.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No rooms yet. Create one to get started.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Description</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Actions</th>
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
                          {room.is_active ? "Active" : "Inactive"}
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
