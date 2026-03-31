import Link from "next/link";
import { getTherapists } from "@/lib/actions/therapists";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function TherapistsListPage() {
  const therapists = await getTherapists();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Therapists</h1>
        <Link href="/admin/therapists/new" className={cn(buttonVariants())}>New Therapist</Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Therapists</CardTitle>
        </CardHeader>
        <CardContent>
          {therapists.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No therapists yet. Create one to get started.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Phone</th>
                    <th className="pb-2 font-medium">Color</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {therapists.map((therapist: any) => (
                    <tr key={therapist.id} className="border-b last:border-0">
                      <td className="py-3">{therapist.full_name}</td>
                      <td className="py-3">
                        {therapist.phone || (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </td>
                      <td className="py-3">
                        {therapist.color ? (
                          <span
                            className="inline-block h-5 w-5 rounded border"
                            style={{ backgroundColor: therapist.color }}
                            title={therapist.color}
                          />
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </td>
                      <td className="py-3">
                        <Badge
                          variant={
                            therapist.is_active ? "default" : "secondary"
                          }
                        >
                          {therapist.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <Link href={`/admin/therapists/${therapist.id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                            Edit
                          </Link>
                      </td>
                    </tr>
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
