import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Users, BookOpen, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function AdminDashboard() {
  const supabase = await createClient();

  const [therapists, customers, services, rooms] = await Promise.all([
    supabase.from("therapists").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("customers").select("id", { count: "exact", head: true }),
    supabase.from("services").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("rooms").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-1 text-muted-foreground">
        Welcome to the SpaMe admin panel.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title="Active Therapists"
          value={String(therapists.count ?? 0)}
          icon={<Users className="h-5 w-5 text-muted-foreground" />}
        />
        <DashboardCard
          title="Customers"
          value={String(customers.count ?? 0)}
          icon={<BookOpen className="h-5 w-5 text-muted-foreground" />}
        />
        <DashboardCard
          title="Active Services"
          value={String(services.count ?? 0)}
          icon={<Calendar className="h-5 w-5 text-muted-foreground" />}
        />
        <DashboardCard
          title="Active Rooms"
          value={String(rooms.count ?? 0)}
          icon={<MessageSquare className="h-5 w-5 text-muted-foreground" />}
        />
      </div>
    </div>
  );
}

function DashboardCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
