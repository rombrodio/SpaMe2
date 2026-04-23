import Link from "next/link";
import { getServices } from "@/lib/actions/services";
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

export default async function ServicesListPage() {
  const services = await getServices();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Services</h1>
        <Link href="/admin/services/new" className={cn(buttonVariants())}>New Service</Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Services</CardTitle>
        </CardHeader>
        <CardContent>
          {services.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No services yet. Create one to get started.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Duration</th>
                    <th className="pb-2 font-medium">Price</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((service) => (
                    <RowLink
                      key={service.id}
                      href={`/admin/services/${service.id}`}
                    >
                      <td className="py-3">{service.name}</td>
                      <td className="py-3">{service.duration_minutes} min</td>
                      <td className="py-3">
                        ₪{(service.price_ils / 100).toFixed(2)}
                      </td>
                      <td className="py-3">
                        <Badge
                          variant={service.is_active ? "success" : "muted"}
                        >
                          <span className="dot mr-1.5 inline-block h-1.5 w-1.5 rounded-full" />
                          {service.is_active ? "Active" : "Inactive"}
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
