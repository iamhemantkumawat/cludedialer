import { useEffect, useMemo, useState } from "react";
import {
  Users,
  Megaphone,
  Phone,
  Keyboard,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Badge } from "@/react-app/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/react-app/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  webappApi,
  type CallPerformanceRow,
  type DashboardStats,
  type RecentActivityRow,
} from "@/react-app/lib/api";
import { useLanguage } from "@/react-app/context/LanguageContext";

function getStatusBadge(status: string) {
  switch (status) {
    case "answered":
      return <Badge className="bg-green-500 hover:bg-green-600 text-white">Answered</Badge>;
    case "failed":
      return <Badge className="bg-red-500 hover:bg-red-600 text-white">Failed</Badge>;
    case "no_answer":
      return <Badge className="bg-orange-500 hover:bg-orange-600 text-white">No Answer</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function Dashboard() {
  const { t } = useLanguage();
  const [stats, setStats] = useState<DashboardStats>({
    totalContacts: 0,
    activeCampaigns: 0,
    callsToday: 0,
    dtmfResponsesToday: 0,
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivityRow[]>([]);
  const [callPerformanceData, setCallPerformanceData] = useState<CallPerformanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const statCards = useMemo(
    () => [
      {
        title: "Total Contacts",
        value: stats.totalContacts.toLocaleString(),
        icon: Users,
        color: "bg-blue-500",
      },
      {
        title: "Active Campaigns",
        value: stats.activeCampaigns,
        icon: Megaphone,
        color: "bg-green-500",
      },
      {
        title: "Calls Today",
        value: stats.callsToday.toLocaleString(),
        icon: Phone,
        color: "bg-primary",
      },
      {
        title: "DTMF Responses",
        value: stats.dtmfResponsesToday,
        icon: Keyboard,
        color: "bg-purple-500",
      },
    ],
    [stats],
  );

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const response = await webappApi.getDashboard();
        if (!mounted) return;
        setStats(response.stats);
        setRecentActivity(response.recentActivity);
        setCallPerformanceData(response.callPerformanceData);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();
    const interval = setInterval(() => {
      void load();
    }, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">{t("page.dashboard.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("page.dashboard.subtitle")}</p>
        {error ? <p className="text-destructive text-sm mt-1">{error}</p> : null}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <Card key={index} className="shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">{stat.title}</p>
                  <p className="text-2xl lg:text-3xl font-bold mt-1">{stat.value}</p>
                </div>
                <div className={`${stat.color} p-3 rounded-xl`}>
                  <stat.icon className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts and Recent Activity */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Call Performance Chart */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold">Call Performance</CardTitle>
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={callPerformanceData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="calls" fill="hsl(var(--primary))" name="Total Calls" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="answered" fill="#22c55e" name="Answered" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="dtmf" fill="#8b5cf6" name="DTMF" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead className="hidden sm:table-cell">Campaign</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>DTMF</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentActivity.map((activity) => (
                    <TableRow key={activity.id}>
                      <TableCell className="font-mono text-sm">{activity.number}</TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">{activity.campaign}</TableCell>
                      <TableCell className="text-sm">{activity.duration}</TableCell>
                      <TableCell>
                        {activity.dtmfPressed !== "-" ? (
                          <Badge variant="outline" className="font-mono">
                            {activity.dtmfPressed}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(activity.status)}</TableCell>
                    </TableRow>
                  ))}
                  {!loading && recentActivity.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No recent activity yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
