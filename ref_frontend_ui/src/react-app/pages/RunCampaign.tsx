import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BellRing,
  ClipboardList,
  Loader2,
  Phone,
  PhoneOff,
  PlayCircle,
  TerminalSquare,
} from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Badge } from "@/react-app/components/ui/badge";
import { Label } from "@/react-app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/react-app/components/ui/select";
import { ScrollArea } from "@/react-app/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/react-app/components/ui/table";
import {
  webappApi,
  type CampaignRow,
  type ContactListRow,
  type ContactRow,
  type LiveCallRow,
  type RunEventRow,
} from "@/react-app/lib/api";
import { useAuth } from "@/react-app/context/AuthContext";
import { usePortalNotifications } from "@/react-app/context/NotificationContext";
import { useLanguage } from "@/react-app/context/LanguageContext";

type RunStatusState = {
  state: string;
  run_uuid: string;
  campaign_name: string;
  completed: number;
  total: number;
  percent: number;
  dtmf_hits?: number;
  queued?: number;
  ringing?: number;
  up?: number;
  live?: number;
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
  if (normalized === "up" || normalized === "answered" || normalized === "answered_dtmf") {
    return <Badge className="bg-green-500 hover:bg-green-600 text-white">Up</Badge>;
  }
  if (normalized === "failed") {
    return <Badge className="bg-red-500 hover:bg-red-600 text-white">Failed</Badge>;
  }
  if (normalized === "no_answer" || normalized === "hangup" || normalized === "no_dtmf") {
    return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">No Answer</Badge>;
  }
  if (normalized === "ringing") {
    return <Badge className="bg-blue-500 hover:bg-blue-600 text-white">Ringing</Badge>;
  }
  if (normalized === "queued") {
    return <Badge className="bg-slate-500 hover:bg-slate-600 text-white">Queue</Badge>;
  }
  return <Badge variant="secondary">{status || "-"}</Badge>;
}

export default function RunCampaign() {
  const { t } = useLanguage();
  const { refreshUser } = useAuth();
  const { pushDtmfNotification } = usePortalNotifications();

  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [contactLists, setContactLists] = useState<ContactListRow[]>([]);
  const [selectedListContacts, setSelectedListContacts] = useState<ContactRow[]>([]);
  const [liveCalls, setLiveCalls] = useState<LiveCallRow[]>([]);
  const [runLogs, setRunLogs] = useState<string[]>([]);
  const [runEvents, setRunEvents] = useState<RunEventRow[]>([]);
  const [runStatus, setRunStatus] = useState<RunStatusState | null>(null);

  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [selectedContactListId, setSelectedContactListId] = useState<string>("");

  const [activeRunUuid, setActiveRunUuid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingContactPreview, setLoadingContactPreview] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [streamedLogs, setStreamedLogs] = useState<FriendlyLogEntry[]>([]);
  const streamedLogIdsRef = useRef<Set<string>>(new Set());
  const queuedLogIdsRef = useRef<Set<string>>(new Set());
  const logQueueRef = useRef<FriendlyLogEntry[]>([]);
  const logAnimationTimerRef = useRef<number | null>(null);
  const liveLogContainerRef = useRef<HTMLDivElement | null>(null);

  const seededRunRef = useRef<string | null>(null);
  const seenDtmfEventKeysRef = useRef<Set<string>>(new Set());
  const previousRunStateRef = useRef<string>("idle");

  const selectedCampaign = useMemo(
    () => campaigns.find((row) => String(row.id) === selectedCampaignId) || null,
    [campaigns, selectedCampaignId],
  );
  const selectedContactList = useMemo(
    () => contactLists.find((row) => String(row.id) === selectedContactListId) || null,
    [contactLists, selectedContactListId],
  );
  const selectedContactListIdNumber = useMemo(
    () => Number.parseInt(selectedContactListId, 10) || 0,
    [selectedContactListId],
  );
  const campaignTextPreview = useMemo(() => {
    if (!selectedCampaign) return "";
    const text = String(selectedCampaign.ivrTextPreview || "").trim();
    if (text) return text;
    if (selectedCampaign.audioSource === "upload") {
      return "Uploaded audio campaign.";
    }
    return "No TTS text preview available.";
  }, [selectedCampaign]);
  const campaignAudioPreviewUrl = useMemo(() => {
    if (!selectedCampaign) return "";
    return webappApi.getCampaignAudioPreviewUrl(selectedCampaign.id);
  }, [selectedCampaign]);
  const selectedLiveCalls = useMemo(
    () => (activeRunUuid ? liveCalls.filter((row) => row.run_uuid === activeRunUuid) : liveCalls),
    [liveCalls, activeRunUuid],
  );
  const selectedQueuedCalls = useMemo(
    () => selectedLiveCalls.filter((row) => String(row.status || "").toLowerCase() === "queued").length,
    [selectedLiveCalls],
  );
  const selectedActiveCalls = useMemo(
    () =>
      selectedLiveCalls.filter((row) => {
        const status = String(row.status || "").toLowerCase();
        return status === "ringing" || status === "up" || status === "answered";
      }).length,
    [selectedLiveCalls],
  );
  const dtmfEvents = useMemo(
    () => runEvents.filter((row) => hasRealDtmf(row.dtmf)),
    [runEvents],
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

    for (const line of runLogs) {
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

    const orderedEvents = [...runEvents].sort(
      (a, b) => timestampValue(a.date) - timestampValue(b.date),
    );
    for (const event of orderedEvents) {
      const parsed = eventToFriendlyMessage(event);
      if (hasRealDtmf(event.dtmf)) {
        hasDtmf = true;
      }
      addEntry(`event-${event.id}`, event.date, parsed.level, parsed.message);
    }

    if (!hasCampaignStarted && runStatus) {
      addEntry("fallback-start", "", "info", "Campaign started.");
    }
    if (!hasSipConnected && runStatus?.state === "running") {
      addEntry("fallback-connect", "", "info", "Connecting to SIP account...");
    }
    if (!hasAudioPrepared && runStatus?.state === "running") {
      addEntry("fallback-audio", "", "info", "Preparing and sending campaign audio.");
    }
    if (!hasCallingStarted && runStatus?.state === "running") {
      addEntry("fallback-calling", "", "info", "Calling numbers from selected contact list.");
    }

    if (!hasDtmf && runStatus?.state === "running") {
      addEntry("fallback-dtmf", "", "info", "Waiting for key press from answered calls.");
    }

    if (!hasCampaignEnded && runStatus?.state === "finished") {
      addEntry("fallback-end", "", "success", "Campaign ended.");
    }

    if (entries.length === 0) {
      addEntry("waiting", "", "info", "Waiting for campaign activity...");
    }

    return entries
      .sort((a, b) => a.sortTs - b.sortTs)
      .slice(-220);
  }, [runEvents, runLogs, runStatus]);

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

  const applyCampaignData = useCallback((rows: CampaignRow[]) => {
    setCampaigns(rows);
    if (!rows.length) {
      setSelectedCampaignId("");
      return;
    }
    setSelectedCampaignId((prev) => (prev ? prev : String(rows[0].id)));
    const running = rows.find((row) => row.runUuid)?.runUuid || null;
    setActiveRunUuid((prev) => prev || running);
  }, []);

  const applyContactListData = useCallback((rows: ContactListRow[]) => {
    setContactLists(rows);
    if (!rows.length) {
      setSelectedContactListId("");
      return;
    }
    setSelectedContactListId((prev) => {
      const currentExists = rows.some((row) => String(row.id) === prev);
      return currentExists ? prev : String(rows[0].id);
    });
  }, []);

  const loadBaseData = useCallback(async () => {
    setLoading(true);
    try {
      const [campaignResponse, contactListResponse, liveResponse] = await Promise.all([
        webappApi.getCampaigns(),
        webappApi.getContactLists(),
        webappApi.getLiveCalls(),
      ]);
      applyCampaignData(campaignResponse.campaigns || []);
      applyContactListData(contactListResponse.contactLists || []);
      setLiveCalls(liveResponse.liveCalls || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load run campaign data");
    } finally {
      setLoading(false);
    }
  }, [applyCampaignData, applyContactListData]);

  const loadLiveCalls = useCallback(async () => {
    try {
      const response = await webappApi.getLiveCalls();
      const rows = response.liveCalls || [];
      setLiveCalls(rows);
      setActiveRunUuid((prev) => {
        if (prev && rows.some((row) => row.run_uuid === prev)) return prev;
        if (!rows.length) return prev;
        return rows[0]?.run_uuid || prev;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load live calls");
    }
  }, []);

  const loadRunDetails = useCallback(async (runUuid: string) => {
    try {
      const [statusResponse, logsResponse, eventsResponse] = await Promise.all([
        webappApi.getRunStatus(runUuid),
        webappApi.getRunLogs(runUuid),
        webappApi.getRunEvents(runUuid),
      ]);
      setRunStatus(statusResponse);
      setRunLogs(logsResponse.lines || []);
      setRunEvents(eventsResponse.events || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load run details");
    }
  }, []);

  useEffect(() => {
    void loadBaseData();
  }, [loadBaseData]);

  useEffect(() => {
    const interval = setInterval(() => {
      void loadLiveCalls();
    }, 2500);
    return () => clearInterval(interval);
  }, [loadLiveCalls]);

  useEffect(() => {
    if (!activeRunUuid) {
      setRunStatus(null);
      setRunLogs([]);
      setRunEvents([]);
      return;
    }
    void loadRunDetails(activeRunUuid);
    const interval = setInterval(() => {
      void loadRunDetails(activeRunUuid);
    }, 2500);
    return () => clearInterval(interval);
  }, [activeRunUuid, loadRunDetails]);

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

  useEffect(() => {
    const node = liveLogContainerRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [streamedLogs.length]);

  useEffect(() => {
    if (!activeRunUuid) {
      seededRunRef.current = null;
      seenDtmfEventKeysRef.current.clear();
      return;
    }

    const dtmfRows = [...runEvents]
      .filter((row) => row.dtmf !== "-" || row.status === "answered_dtmf")
      .sort((a, b) => timestampValue(a.date) - timestampValue(b.date));

    if (seededRunRef.current !== activeRunUuid) {
      seededRunRef.current = activeRunUuid;
      seenDtmfEventKeysRef.current.clear();
      for (const row of dtmfRows) {
        seenDtmfEventKeysRef.current.add(`${activeRunUuid}:${row.id}`);
      }
      return;
    }

    for (const row of dtmfRows) {
      const eventKey = `${activeRunUuid}:${row.id}`;
      if (seenDtmfEventKeysRef.current.has(eventKey)) continue;
      seenDtmfEventKeysRef.current.add(eventKey);
      const digit = String(row.dtmf || "").trim() || "-";
      if (!hasRealDtmf(digit)) continue;
      pushDtmfNotification({
        runUuid: activeRunUuid,
        campaign: row.campaign || runStatus?.campaign_name || selectedCampaign?.name || "Campaign",
        number: row.number || "-",
        dtmf: digit,
        timestamp: row.date,
      });
    }
  }, [activeRunUuid, runEvents, runStatus?.campaign_name, selectedCampaign?.name, pushDtmfNotification]);

  useEffect(() => {
    const currentState = String(runStatus?.state || "idle").toLowerCase();
    const previousState = previousRunStateRef.current;
    previousRunStateRef.current = currentState;

    if (!activeRunUuid) return;
    if (currentState === "finished" && previousState !== "finished") {
      void refreshUser();
    }
  }, [activeRunUuid, runStatus?.state, refreshUser]);

  useEffect(() => {
    if (!selectedContactListIdNumber) {
      setSelectedListContacts([]);
      return;
    }

    let cancelled = false;
    const loadPreviewContacts = async () => {
      setLoadingContactPreview(true);
      try {
        const response = await webappApi.getContacts("", "all", selectedContactListIdNumber);
        if (!cancelled) {
          setSelectedListContacts(response.contacts || []);
        }
      } catch {
        if (!cancelled) {
          setSelectedListContacts([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingContactPreview(false);
        }
      }
    };

    void loadPreviewContacts();
    return () => {
      cancelled = true;
    };
  }, [selectedContactListIdNumber]);

  const handleRunCampaign = async () => {
    if (!selectedCampaignId) {
      setError("Please choose a campaign.");
      return;
    }
    if (!selectedContactListIdNumber) {
      setError("Please choose a contact list.");
      return;
    }

    setLaunching(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await webappApi.launchCampaign(
        Number.parseInt(selectedCampaignId, 10),
        selectedContactListIdNumber,
      );
      setActiveRunUuid(response.run_uuid);
      const numbersCount = response.numbersCount || selectedContactList?.contactsCount || 0;
      const listLabel = selectedContactList?.name || "Selected list";
      setSuccess(
        `Campaign started using '${listLabel}' with ${numbersCount} contact(s).`,
      );
      await Promise.all([loadBaseData(), loadRunDetails(response.run_uuid)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to launch campaign");
    } finally {
      setLaunching(false);
    }
  };

  const handleStopRun = async () => {
    if (!activeRunUuid) return;
    setStopping(true);
    setError(null);
    try {
      await webappApi.stopRun(activeRunUuid);
      await Promise.all([loadLiveCalls(), loadRunDetails(activeRunUuid)]);
      await refreshUser();
      setSuccess("Campaign stop signal sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop campaign");
    } finally {
      setStopping(false);
    }
  };

  const onCampaignChange = (value: string) => {
    setSelectedCampaignId(value);
    const row = campaigns.find((campaign) => String(campaign.id) === value);
    if (row?.runUuid) {
      setActiveRunUuid(row.runUuid);
    }
  };

  const percent = runStatus?.percent || 0;
  const processed = runStatus?.completed || 0;
  const total = runStatus?.total || 0;
  const runState = runStatus?.state || "idle";
  const dtmfHits = runStatus?.dtmf_hits ?? dtmfEvents.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">{t("page.runCampaign.title")}</h1>
        <p className="text-muted-foreground mt-1">
          {t("page.runCampaign.subtitle")}
        </p>
      </div>

      {error ? (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
          {success}
        </div>
      ) : null}

      <Card className="shadow-sm border-l-4 border-l-primary">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <PlayCircle className="h-5 w-5 text-primary" />
            Run Campaign Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Choose Campaign</Label>
              <Select value={selectedCampaignId} onValueChange={onCampaignChange} disabled={loading}>
                <SelectTrigger>
                  <SelectValue placeholder="Select campaign" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((campaign) => (
                    <SelectItem key={campaign.id} value={String(campaign.id)}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCampaign ? (
                <p className="text-xs text-muted-foreground">
                  Caller ID: {selectedCampaign.callerId} | SIP: {selectedCampaign.sipAccount} | Concurrency:{" "}
                  {Math.max(1, Math.min(Number(selectedCampaign.concurrency || 3), 5))} | DTMF:{" "}
                  {Math.max(1, Math.min(Number(selectedCampaign.dtmfMaxDigits || 1), 6))}{" "}
                  {Math.max(1, Math.min(Number(selectedCampaign.dtmfMaxDigits || 1), 6)) === 1
                    ? "key"
                    : "keys"}
                </p>
              ) : null}
              {selectedCampaign ? (
                <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">TTS Preview</p>
                  <p className="mt-1 text-xs text-foreground leading-relaxed">{campaignTextPreview}</p>
                  <div className="mt-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Play Preview</p>
                    <audio controls preload="none" src={campaignAudioPreviewUrl} className="mt-1 h-9 w-full max-w-[320px]">
                      Your browser does not support audio playback.
                    </audio>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Select Contact List</Label>
              <Select
                value={selectedContactListId}
                onValueChange={setSelectedContactListId}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select contact list" />
                </SelectTrigger>
                <SelectContent>
                  {contactLists.map((listRow) => (
                    <SelectItem key={listRow.id} value={String(listRow.id)}>
                      {listRow.name} ({listRow.contactsCount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedContactList ? (
                <p className="text-xs text-muted-foreground">
                  Total: {selectedContactList.contactsCount} | Pending: {selectedContactList.pendingCount} |
                  Called: {selectedContactList.calledCount} | Failed: {selectedContactList.failedCount}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No list selected. Create/import lists in Contacts first.
                </p>
              )}
              <div className="rounded-md border border-border/70 bg-muted/20">
                <div className="px-3 py-2 border-b border-border/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                  Numbers Preview
                </div>
                <ScrollArea className="h-24">
                  <div className="px-3 py-2 space-y-1">
                    {loadingContactPreview ? (
                      <p className="text-xs text-muted-foreground">Loading numbers...</p>
                    ) : selectedListContacts.length > 0 ? (
                      selectedListContacts.map((row) => (
                        <p key={row.id} className="text-xs font-mono text-foreground/90">
                          {row.number}
                        </p>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">No numbers in selected list.</p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={() => void handleRunCampaign()}
              disabled={launching || !selectedCampaignId || !selectedContactListIdNumber}
            >
              {launching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
              Run Campaign
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleStopRun()}
              disabled={!activeRunUuid || stopping}
            >
              {stopping ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PhoneOff className="h-4 w-4 mr-2" />}
              Stop Current Run
            </Button>
            {activeRunUuid ? (
              <span className="text-xs text-muted-foreground font-mono">Run UUID: {activeRunUuid}</span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <Activity className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Run State</p>
              <p className="text-lg font-semibold capitalize">{runState}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <ClipboardList className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-xs text-muted-foreground">Progress</p>
              <p className="text-lg font-semibold">
                {processed}/{total} ({percent}%)
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <Phone className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-xs text-muted-foreground">Live / Queue</p>
              <p className="text-lg font-semibold">
                {selectedActiveCalls} / {selectedQueuedCalls}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <BellRing className="h-5 w-5 text-purple-600" />
            <div>
              <p className="text-xs text-muted-foreground">DTMF Hits</p>
              <p className="text-lg font-semibold">{dtmfHits}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Live Calls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>DTMF</TableHead>
                  <TableHead className="hidden md:table-cell">Campaign</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedLiveCalls.map((call) => (
                  <TableRow key={`${call.run_uuid}-${call.id}`}>
                    <TableCell className="font-mono">{call.number}</TableCell>
                    <TableCell>{statusBadge(call.status)}</TableCell>
                    <TableCell>
                      {String(call.status || "").toLowerCase() === "queued" && call.queuePosition ? (
                        <span className="text-xs text-muted-foreground">Queue #{call.queuePosition}</span>
                      ) : (
                        call.duration
                      )}
                    </TableCell>
                    <TableCell>
                      {call.dtmf !== "-" ? (
                        <Badge className="bg-purple-500 hover:bg-purple-600 text-white">{call.dtmf}</Badge>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{call.campaign}</TableCell>
                  </TableRow>
                ))}
                {!loading && selectedLiveCalls.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No live calls right now.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <TerminalSquare className="h-5 w-5 text-primary" />
            Live Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
            <div
              ref={liveLogContainerRef}
              className="h-80 overflow-y-auto border rounded-lg bg-zinc-950 text-zinc-100"
            >
              <div className="p-3 space-y-1.5 font-mono text-xs">
                {streamedLogs.map((entry) => (
                  <div key={entry.id} className="cx-log-line-enter flex items-start gap-2">
                    <span className="text-zinc-500 shrink-0">
                      [{entry.timestamp || "--:--:--"}]
                    </span>
                    <span className="text-cyan-300 shrink-0">dialer-server</span>
                    <span className={`break-words ${terminalLogLevelClass(entry.level)}`}>
                      {entry.message}
                    </span>
                  </div>
                ))}
                {streamedLogs.length === 0 ? (
                  <p className="text-zinc-400">Waiting for campaign activity...</p>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <BellRing className="h-5 w-5 text-purple-600" />
              DTMF Notifications & Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>DTMF</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dtmfEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="text-xs">{event.date}</TableCell>
                      <TableCell className="font-mono text-xs">{event.number}</TableCell>
                      <TableCell>{statusBadge(event.status)}</TableCell>
                      <TableCell>
                        {event.dtmf !== "-" ? (
                          <Badge className="bg-purple-500 hover:bg-purple-600 text-white">{event.dtmf}</Badge>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>{statusBadge(event.result)}</TableCell>
                    </TableRow>
                  ))}
                  {dtmfEvents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No DTMF or result events yet.
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
