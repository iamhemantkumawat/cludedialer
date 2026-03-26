import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { Activity, BellRing, Phone, TerminalSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Badge } from "@/react-app/components/ui/badge";
import { Progress } from "@/react-app/components/ui/progress";
import { webappApi, type RunEventRow } from "@/react-app/lib/api";

type RunStatusState = {
  state: string;
  run_uuid: string;
  campaign_name: string;
  completed: number;
  total: number;
  percent: number;
  dtmf_hits?: number;
};

type FriendlyLogLevel = "info" | "success" | "warning" | "error";

type FriendlyLogEntry = {
  id: string;
  timestamp: string;
  sortTs: number;
  level: FriendlyLogLevel;
  message: string;
};

function extractLogTimestamp(line: string): string {
  const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
  return match?.[1] ?? "";
}

function timestampValue(rawTimestamp: string): number {
  if (!rawTimestamp) return 0;
  const normalized = rawTimestamp.includes("T")
    ? rawTimestamp
    : rawTimestamp.replace(" ", "T");
  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasRealDtmf(value: string | null | undefined): boolean {
  const safe = String(value || "").trim();
  if (!safe) return false;
  return !["-", "N/A", "NONE", "NULL"].includes(safe.toUpperCase());
}

function eventToFriendlyMessage(event: RunEventRow): { level: FriendlyLogLevel; message: string } {
  const number = event.number || "-";
  const status = String(event.status || "").toLowerCase();
  const dtmf = String(event.dtmf || "").trim();

  if (status === "answered_dtmf" && hasRealDtmf(dtmf)) {
    return {
      level: "success",
      message: `Captured key '${dtmf}' from ${number}.`,
    };
  }
  if (status === "answered_dtmf") {
    return {
      level: "warning",
      message: `Call answered by ${number}, no DTMF input.`,
    };
  }
  if (status === "no_dtmf") {
    return {
      level: "warning",
      message: `Call answered by ${number}, no DTMF input.`,
    };
  }
  if (status === "answered") {
    return {
      level: "success",
      message: `Call answered by ${number}.`,
    };
  }
  if (status === "failed" || status === "no_answer") {
    return {
      level: "warning",
      message: `No answer from ${number}.`,
    };
  }
  if (status === "hangup") {
    return {
      level: "info",
      message: `Call ended for ${number}.`,
    };
  }
  return {
    level: "info",
    message: `Updated ${number}: ${event.result || status || "unknown"}.`,
  };
}

function terminalLogLevelClass(level: FriendlyLogLevel): string {
  if (level === "success") return "text-emerald-300";
  if (level === "warning") return "text-amber-300";
  if (level === "error") return "text-red-300";
  return "text-zinc-200";
}

function statusBadge(status: string) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "running") {
    return <Badge className="bg-blue-600 text-white hover:bg-blue-700">Running</Badge>;
  }
  if (normalized === "finished" || normalized === "completed") {
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">Completed</Badge>;
  }
  return <Badge variant="secondary">{status || "-"}</Badge>;
}

export default function PublicRun() {
  const { runUuid = "" } = useParams();
  const [searchParams] = useSearchParams();
  const token = String(searchParams.get("token") || "").trim();

  const [status, setStatus] = useState<RunStatusState | null>(null);
  const [events, setEvents] = useState<RunEventRow[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const [streamedLogs, setStreamedLogs] = useState<FriendlyLogEntry[]>([]);
  const streamedLogIdsRef = useRef<Set<string>>(new Set());
  const queuedLogIdsRef = useRef<Set<string>>(new Set());
  const logQueueRef = useRef<FriendlyLogEntry[]>([]);
  const logAnimationTimerRef = useRef<number | null>(null);

  const dtmfRows = useMemo(
    () => events.filter((row) => hasRealDtmf(row.dtmf)),
    [events],
  );

  const friendlyLogs = useMemo(() => {
    const entries: FriendlyLogEntry[] = [];
    const seen = new Set<string>();
    let hasCampaignStarted = false;
    let hasSipConnected = false;
    let hasAudioPrepared = false;
    let hasCallingStarted = false;
    let hasDtmf = false;
    let hasCampaignEnded = false;

    const addEntry = (
      key: string,
      timestamp: string,
      level: FriendlyLogLevel,
      message: string,
    ) => {
      const dedupeKey = `${key}|${timestamp}|${message}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      entries.push({
        id: dedupeKey,
        timestamp,
        sortTs: timestampValue(timestamp),
        level,
        message,
      });
    };

    for (const line of logs) {
      const timestamp = extractLogTimestamp(line);
      const lowered = line.toLowerCase();
      if (lowered.includes("werkzeug")) continue;
      if (lowered.includes("ami userevent received")) continue;

      if (
        lowered.includes("campaign added to active_campaigns") ||
        lowered.includes("started in dedicated background thread") ||
        lowered.includes("scheduled on existing asyncio loop")
      ) {
        hasCampaignStarted = true;
        addEntry("campaign-start", timestamp, "info", "Campaign started.");
      }

      if (lowered.includes("connected to ami")) {
        hasSipConnected = true;
        addEntry("sip-connected", timestamp, "success", "Connected to SIP account.");
      }

      if (lowered.includes("generating tts")) {
        addEntry("tts-generate", timestamp, "info", "Generating campaign TTS audio.");
      }

      if (lowered.includes("audio conversion attempt failed")) {
        addEntry("audio-fallback", timestamp, "warning", "GSM conversion failed, switched to WAV format.");
      }

      if (
        lowered.includes("successfully converted audio file") ||
        lowered.includes("successfully moved file") ||
        lowered.includes("playback path")
      ) {
        hasAudioPrepared = true;
        addEntry("audio-ready", timestamp, "success", "Voice audio prepared and sent to dialer server.");
      }

      if (
        lowered.includes("all originate commands have been sent") ||
        lowered.includes("origination queue started with max concurrency")
      ) {
        hasCallingStarted = true;
        addEntry("calls-started", timestamp, "info", "Calling numbers from selected contact list.");
      }

      if (lowered.includes("campaign removed from active_campaigns") || lowered.includes("finished and cleaned up")) {
        hasCampaignEnded = true;
        addEntry("campaign-end", timestamp, "success", "Campaign ended.");
      }

      if (lowered.includes("error in campaign") || lowered.includes("campaign failed")) {
        addEntry("campaign-error", timestamp, "error", "Campaign failed. Check dialer server settings.");
      }
    }

    const orderedEvents = [...events].sort(
      (a, b) => timestampValue(a.date) - timestampValue(b.date),
    );
    for (const event of orderedEvents) {
      const parsed = eventToFriendlyMessage(event);
      if (hasRealDtmf(event.dtmf)) {
        hasDtmf = true;
      }
      addEntry(`event-${event.id}`, event.date, parsed.level, parsed.message);
    }

    if (!hasCampaignStarted && status) {
      addEntry("fallback-start", "", "info", "Campaign started.");
    }
    if (!hasSipConnected && status?.state === "running") {
      addEntry("fallback-connect", "", "info", "Connecting to SIP account...");
    }
    if (!hasAudioPrepared && status?.state === "running") {
      addEntry("fallback-audio", "", "info", "Preparing and sending campaign audio.");
    }
    if (!hasCallingStarted && status?.state === "running") {
      addEntry("fallback-calling", "", "info", "Calling numbers from selected contact list.");
    }
    if (!hasDtmf && status?.state === "running") {
      addEntry("fallback-dtmf", "", "info", "Waiting for key press from answered calls.");
    }
    if (!hasCampaignEnded && status?.state === "finished") {
      addEntry("fallback-end", "", "success", "Campaign ended.");
    }
    if (entries.length === 0) {
      addEntry("waiting", "", "info", "Waiting for campaign activity...");
    }

    return entries
      .sort((a, b) => a.sortTs - b.sortTs)
      .slice(-220);
  }, [events, logs, status]);

  const stopLogAnimation = useCallback(() => {
    if (logAnimationTimerRef.current !== null) {
      window.clearTimeout(logAnimationTimerRef.current);
      logAnimationTimerRef.current = null;
    }
  }, []);

  const streamNextLogLine = useCallback(() => {
    const next = logQueueRef.current.shift();
    if (!next) {
      stopLogAnimation();
      return;
    }

    queuedLogIdsRef.current.delete(next.id);
    streamedLogIdsRef.current.add(next.id);
    setStreamedLogs((prev) => [...prev, next].slice(-220));
    logAnimationTimerRef.current = window.setTimeout(streamNextLogLine, 110);
  }, [stopLogAnimation]);

  const loadRun = useCallback(async () => {
    if (!runUuid || !token) {
      setError("Invalid live progress link.");
      setLoading(false);
      return;
    }
    try {
      const [statusRes, logsRes, eventsRes] = await Promise.all([
        webappApi.getPublicRunStatus(runUuid, token),
        webappApi.getPublicRunLogs(runUuid, token),
        webappApi.getPublicRunEvents(runUuid, token),
      ]);
      setStatus(statusRes);
      setLogs(logsRes.lines || []);
      setEvents(eventsRes.events || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load live progress.");
    } finally {
      setLoading(false);
    }
  }, [runUuid, token]);

  useEffect(() => {
    void loadRun();
  }, [loadRun]);

  useEffect(() => {
    if (!runUuid || !token) return;
    const interval = window.setInterval(() => {
      void loadRun();
    }, 2500);
    return () => window.clearInterval(interval);
  }, [runUuid, token, loadRun]);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [streamedLogs.length]);

  useEffect(() => {
    const currentIds = new Set(friendlyLogs.map((entry) => entry.id));

    streamedLogIdsRef.current.forEach((id) => {
      if (!currentIds.has(id)) streamedLogIdsRef.current.delete(id);
    });
    queuedLogIdsRef.current.forEach((id) => {
      if (!currentIds.has(id)) queuedLogIdsRef.current.delete(id);
    });
    logQueueRef.current = logQueueRef.current.filter((entry) => currentIds.has(entry.id));

    setStreamedLogs((prev) => prev.filter((entry) => currentIds.has(entry.id)));

    const incoming = friendlyLogs.filter(
      (entry) =>
        !streamedLogIdsRef.current.has(entry.id) && !queuedLogIdsRef.current.has(entry.id),
    );
    if (!incoming.length) return;

    if (streamedLogIdsRef.current.size === 0 && incoming.length > 24) {
      const seed = friendlyLogs.slice(-28);
      stopLogAnimation();
      queuedLogIdsRef.current.clear();
      logQueueRef.current = [];
      for (const entry of seed) {
        streamedLogIdsRef.current.add(entry.id);
      }
      setStreamedLogs(seed);
      return;
    }

    for (const entry of incoming) {
      queuedLogIdsRef.current.add(entry.id);
      logQueueRef.current.push(entry);
    }
    if (logAnimationTimerRef.current === null) {
      logAnimationTimerRef.current = window.setTimeout(streamNextLogLine, 60);
    }
  }, [friendlyLogs, stopLogAnimation, streamNextLogLine]);

  useEffect(
    () => () => {
      stopLogAnimation();
    },
    [stopLogAnimation],
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-zinc-50 to-emerald-50 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <Card className="border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Activity className="h-6 w-6 text-red-600" />
              Campaign Live Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && <p className="text-sm text-zinc-600">Loading live run data...</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
            {!loading && !error && status && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-700">
                  <span className="font-semibold">{status.campaign_name || "Campaign"}</span>
                  {statusBadge(status.state)}
                  <span>Run: {status.run_uuid}</span>
                </div>
                <Progress value={Math.max(0, Math.min(100, status.percent || 0))} className="h-3" />
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                    <p className="text-xs text-zinc-500">Processed</p>
                    <p className="text-lg font-semibold text-zinc-900">
                      {status.completed} / {status.total}
                    </p>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                    <p className="text-xs text-zinc-500">Progress</p>
                    <p className="text-lg font-semibold text-zinc-900">{status.percent}%</p>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                    <p className="text-xs text-zinc-500">DTMF Hits</p>
                    <p className="text-lg font-semibold text-zinc-900">{status.dtmf_hits || 0}</p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-zinc-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BellRing className="h-5 w-5 text-violet-600" />
                DTMF Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!dtmfRows.length && <p className="text-sm text-zinc-500">No DTMF captured yet.</p>}
              {dtmfRows.slice(0, 24).map((row) => (
                <div
                  key={`${row.id}-${row.number}-${row.dtmf}-${row.date}`}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-zinc-900">{row.number || "-"}</span>
                  <span className="text-violet-700 font-semibold">Key: {row.dtmf}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-zinc-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Phone className="h-5 w-5 text-emerald-600" />
                Recent Call Events
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!events.length && <p className="text-sm text-zinc-500">No events yet.</p>}
              {events.slice(0, 24).map((row) => (
                <div
                  key={`${row.id}-${row.number}-${row.status}-${row.date}`}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-zinc-900">{row.number || "-"}</span>
                    <span className="text-zinc-500">{row.date}</span>
                  </div>
                  <p className="text-zinc-600">
                    {row.result || row.status} {row.dtmf !== "-" ? `| DTMF: ${row.dtmf}` : ""}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TerminalSquare className="h-5 w-5 text-zinc-900" />
              Live Logs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              ref={logRef}
              className="h-72 overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-100"
            >
              {!streamedLogs.length && <p className="text-zinc-400">Waiting for campaign activity...</p>}
              {streamedLogs.map((entry) => (
                <div key={entry.id} className="cx-log-line-enter flex items-start gap-2 mb-1">
                  <span className="text-zinc-500 shrink-0">
                    [{entry.timestamp || "--:--:--"}]
                  </span>
                  <span className="text-cyan-300 shrink-0">dialer-server</span>
                  <span className={`whitespace-pre-wrap break-words ${terminalLogLevelClass(entry.level)}`}>
                    {entry.message}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
