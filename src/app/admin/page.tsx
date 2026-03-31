import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Users, BookOpen, MessageSquare } from "lucide-react";

export default function AdminDashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-1 text-muted-foreground">
        Welcome to the SpaMe admin panel.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title="Today's Bookings"
          value="--"
          icon={<Calendar className="h-5 w-5 text-muted-foreground" />}
        />
        <DashboardCard
          title="Active Therapists"
          value="--"
          icon={<Users className="h-5 w-5 text-muted-foreground" />}
        />
        <DashboardCard
          title="Pending Payments"
          value="--"
          icon={<BookOpen className="h-5 w-5 text-muted-foreground" />}
        />
        <DashboardCard
          title="Open Threads"
          value="--"
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
