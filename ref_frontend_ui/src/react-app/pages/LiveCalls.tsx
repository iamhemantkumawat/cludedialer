import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Phone,
  PhoneOff,
  PhoneForwarded,
  Activity,
  Users,
  Clock,
  Keyboard,
  Loader2,
} from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
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
import { webappApi, type LiveCallRow } from "@/react-app/lib/api";
import { useLanguage } from "@/react-app/context/LanguageContext";

function StatusIndicator({ status }: { status: string }) {
  if (status === "queued") {
    return (
      <div className="flex items-center gap-2">
        <span className="relative flex h-3 w-3">
          <span className="relative inline-flex rounded-full h-3 w-3 bg-slate-400" />
        </span>
        <span className="text-slate-600 font-medium">Queue</span>
      </div>
    );
  }
  if (status === "ringing") {
    return (
      <div className="flex items-center gap-2">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
        </span>
        <span className="text-amber-600 font-medium">Ringing</span>
      </div>
    );
  }
  if (status === "up" || status === "answered") {
    return (
      <div className="flex items-center gap-2">
        <span className="relative flex h-3 w-3">
          <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
        </span>
        <span className="text-green-600 font-medium">Up</span>
      </div>
    );
  }
  return <Badge variant="secondary">{status}</Badge>;
}

export default function LiveCalls() {
  const { t } = useLanguage();
  const [calls, setCalls] = useState<LiveCallRow[]>([]);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [stoppingRun, setStoppingRun] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCalls = useCallback(async () => {
    try {
      const response = await webappApi.getLiveCalls();
      setCalls(response.liveCalls);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load live calls");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCalls();
    const interval = setInterval(() => {
      void loadCalls();
    }, 2500);
    return () => clearInterval(interval);
  }, [loadCalls]);

  const handleEndCall = async (runUuid: string) => {
    setStoppingRun(runUuid);
    setError(null);
    try {
      await webappApi.stopRun(runUuid);
      await loadCalls();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop run");
    } finally {
      setStoppingRun(null);
    }
  };

  const handleTransfer = (id: number) => {
    alert(`Transfer action placeholder for call ${id}`);
  };

  const activeCalls = calls.filter((c) => c.status !== "queued").length;
  const connectedCalls = calls.filter((c) => c.status === "up" || c.status === "answered").length;
  const ringingCalls = calls.filter((c) => c.status === "ringing").length;
  const dtmfCount = calls.filter((c) => c.dtmf !== "-").length;

  const activityBars = useMemo(() => {
    const now = new Date();
    const currentHour = now.getHours();
    return Array.from({ length: 24 }).map((_, hour) => {
      const isCurrentHour = hour === currentHour;
      const density = calls.reduce((sum, row) => {
        if (isCurrentHour) {
          return sum + 1;
        }
        return sum + (row.status === "answered" ? 0.4 : 0.2);
      }, 0);
      const intensity = Math.min(density / 10, 1);
      return { hour, isCurrentHour, intensity };
    });
  }, [calls]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">{t("page.liveCalls.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("page.liveCalls.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span>Live</span>
          <span className="text-xs">Updated: {lastUpdate.toLocaleTimeString()}</span>
        </div>
      </div>

      {error ? (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm border-l-4 border-l-primary">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="bg-primary/10 p-3 rounded-xl">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Dialing Now</p>
              <p className="text-2xl font-bold">{activeCalls}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-l-4 border-l-green-500">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="bg-green-100 p-3 rounded-xl">
              <Phone className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Up</p>
              <p className="text-2xl font-bold">{connectedCalls}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-l-4 border-l-amber-500">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="bg-amber-100 p-3 rounded-xl">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ringing</p>
              <p className="text-2xl font-bold">{ringingCalls}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-l-4 border-l-purple-500">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="bg-purple-100 p-3 rounded-xl">
              <Keyboard className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">DTMF Received</p>
              <p className="text-2xl font-bold">{dtmfCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Active Calls
            {activeCalls > 0 ? (
              <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                {activeCalls}
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {calls.length === 0 && !loading ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Phone className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground">No Active Calls</h3>
              <p className="text-muted-foreground mt-1">
                Calls will appear here when campaigns are running.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead className="hidden md:table-cell">Campaign</TableHead>
                    <TableHead className="text-center">Duration</TableHead>
                    <TableHead className="text-center">DTMF</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calls.map((call) => {
                    const busy = stoppingRun === call.run_uuid;
                    return (
                      <TableRow key={`${call.run_uuid}-${call.id}`} className="group">
                        <TableCell>
                          <StatusIndicator status={call.status} />
                        </TableCell>
                        <TableCell className="font-mono text-sm">{call.number}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {call.campaign}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-mono bg-muted px-2 py-1 rounded text-sm">
                            {call.status === "queued" && call.queuePosition
                              ? `Queue #${call.queuePosition}`
                              : call.duration}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {call.dtmf !== "-" ? (
                            <Badge className="bg-purple-500 hover:bg-purple-600 animate-pulse">
                              {call.dtmf}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleTransfer(call.id)}
                              className="text-blue-500 hover:text-blue-600 hover:bg-blue-50"
                              title="Transfer"
                              disabled={busy}
                            >
                              <PhoneForwarded className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => void handleEndCall(call.run_uuid)}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Stop Campaign Run"
                              disabled={busy}
                            >
                              {busy ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <PhoneOff className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Loading live calls...
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Call Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {activityBars.map((bar) => (
              <div
                key={bar.hour}
                className={`
                  h-12 rounded-lg flex items-end justify-center pb-1 text-xs font-medium
                  ${bar.isCurrentHour ? "ring-2 ring-primary ring-offset-2" : ""}
                  ${bar.intensity > 0.7
                    ? "bg-primary text-primary-foreground"
                    : bar.intensity > 0.4
                      ? "bg-primary/60 text-primary-foreground"
                      : bar.intensity > 0.2
                        ? "bg-primary/30 text-primary"
                        : "bg-muted text-muted-foreground"}
                `}
                style={{ opacity: bar.isCurrentHour ? 1 : 0.7 + bar.intensity * 0.3 }}
                title={`${bar.hour}:00 - ${bar.hour + 1}:00`}
              >
                {bar.hour}h
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center mt-3">
            Live volume snapshot by hour (current hour highlighted).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
