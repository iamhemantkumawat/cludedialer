import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BellRing, Hash } from "lucide-react";
import { useAuth } from "@/react-app/context/AuthContext";
import { webappApi } from "@/react-app/lib/api";

export interface PortalNotification {
  id: string;
  dedupeKey: string;
  type: "dtmf";
  title: string;
  message: string;
  campaign: string;
  number: string;
  dtmf: string;
  runUuid: string;
  timestamp: string;
  createdAt: number;
  read: boolean;
}

interface DtmfNotificationInput {
  runUuid: string;
  campaign?: string;
  number: string;
  dtmf: string;
  timestamp?: string;
}

interface NotificationContextValue {
  notifications: PortalNotification[];
  unreadCount: number;
  pushDtmfNotification: (payload: DtmfNotificationInput) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

const STORAGE_PREFIX = "cx_portal_notifications_v2";

function storageKey(username: string): string {
  return `${STORAGE_PREFIX}:${username.toLowerCase()}`;
}

function parseTimestamp(raw: string | undefined): string {
  if (!raw) return new Date().toISOString();
  const trimmed = String(raw).trim();
  if (!trimmed) return new Date().toISOString();
  if (trimmed.includes("T")) return trimmed;
  return trimmed.replace(" ", "T");
}

function formatToastTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Now";
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);
  const [toasts, setToasts] = useState<PortalNotification[]>([]);
  const toastTimersRef = useRef<number[]>([]);
  const seededRunsRef = useRef<Set<string>>(new Set());
  const seenDtmfEventKeysRef = useRef<Set<string>>(new Set());

  const usernameKey = useMemo(() => {
    if (!user || user.is_admin) return "";
    return String(user.sip_username || "").trim().toLowerCase();
  }, [user]);

  useEffect(
    () => () => {
      for (const timer of toastTimersRef.current) {
        window.clearTimeout(timer);
      }
      toastTimersRef.current = [];
    },
    [],
  );

  useEffect(() => {
    if (!usernameKey) {
      setNotifications([]);
      setToasts([]);
      seededRunsRef.current.clear();
      seenDtmfEventKeysRef.current.clear();
      return;
    }
    try {
      const raw = window.localStorage.getItem(storageKey(usernameKey));
      if (!raw) {
        setNotifications([]);
        return;
      }
      const parsed = JSON.parse(raw) as PortalNotification[];
      if (!Array.isArray(parsed)) {
        setNotifications([]);
        return;
      }
      setNotifications(
        parsed
          .filter((row) => row && typeof row.id === "string" && row.type === "dtmf")
          .slice(0, 120),
      );
    } catch {
      setNotifications([]);
    }
  }, [usernameKey]);

  useEffect(() => {
    if (!usernameKey) return;
    try {
      window.localStorage.setItem(storageKey(usernameKey), JSON.stringify(notifications.slice(0, 120)));
    } catch {
      // ignore quota failures
    }
  }, [notifications, usernameKey]);

  const pushDtmfNotification = useCallback(
    (payload: DtmfNotificationInput) => {
      if (!usernameKey) return;

      const number = String(payload.number || "").trim();
      const dtmf = String(payload.dtmf || "").trim();
      const runUuid = String(payload.runUuid || "").trim();
      if (!number || !dtmf || !runUuid) return;

      const campaign = String(payload.campaign || "").trim() || "Campaign";
      const timestamp = parseTimestamp(payload.timestamp);
      const dedupeKey = `${runUuid}|${number}|${dtmf}|${timestamp}`;

      let created: PortalNotification | null = null;
      setNotifications((prev) => {
        if (prev.some((row) => row.dedupeKey === dedupeKey)) {
          return prev;
        }
        created = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          dedupeKey,
          type: "dtmf",
          title: "DTMF captured",
          message: `Key '${dtmf}' from ${number}`,
          campaign,
          number,
          dtmf,
          runUuid,
          timestamp,
          createdAt: Date.now(),
          read: false,
        };
        return [created, ...prev].slice(0, 120);
      });

      if (!created) return;
      setToasts((prev) => [created as PortalNotification, ...prev].slice(0, 4));
      const timer = window.setTimeout(() => {
        setToasts((prev) => prev.filter((row) => row.id !== created?.id));
      }, 5600);
      toastTimersRef.current.push(timer);
    },
    [usernameKey],
  );

  useEffect(() => {
    if (!usernameKey || !user || user.is_admin) return;

    let cancelled = false;

    const pollLiveDtmf = async () => {
      try {
        const liveResponse = await webappApi.getLiveCalls();
        if (cancelled) return;
        const runUuids = Array.from(
          new Set(
            (liveResponse.liveCalls || [])
              .map((row) => String(row.run_uuid || "").trim())
              .filter(Boolean),
          ),
        );

        if (runUuids.length === 0) {
          return;
        }

        const eventResponses = await Promise.all(
          runUuids.map(async (runUuid) => {
            const response = await webappApi.getRunEvents(runUuid);
            return { runUuid, response };
          }),
        );
        if (cancelled) return;

        for (const { runUuid, response } of eventResponses) {
          if (cancelled) return;
          const dtmfRows = (response.events || [])
            .filter((row) => row.dtmf !== "-" || row.status === "answered_dtmf")
            .sort((a, b) => {
              const at = new Date(String(a.date || "").replace(" ", "T")).getTime() || 0;
              const bt = new Date(String(b.date || "").replace(" ", "T")).getTime() || 0;
              return at - bt;
            });

          if (!seededRunsRef.current.has(runUuid)) {
            seededRunsRef.current.add(runUuid);
            for (const row of dtmfRows) {
              seenDtmfEventKeysRef.current.add(`${runUuid}:${row.id}`);
            }
            continue;
          }

          for (const row of dtmfRows) {
            const eventKey = `${runUuid}:${row.id}`;
            if (seenDtmfEventKeysRef.current.has(eventKey)) continue;
            seenDtmfEventKeysRef.current.add(eventKey);
            const digit = String(row.dtmf || "").trim() || "-";
            if (digit === "-") continue;
            pushDtmfNotification({
              runUuid,
              campaign: row.campaign || "Campaign",
              number: row.number || "-",
              dtmf: digit,
              timestamp: row.date,
            });
          }
        }
      } catch {
        // Ignore transient polling errors.
      }
    };

    void pollLiveDtmf();
    const interval = window.setInterval(() => {
      void pollLiveDtmf();
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [usernameKey, user, pushDtmfNotification]);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((row) => (row.id === id ? { ...row, read: true } : row)),
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((row) => ({ ...row, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setToasts([]);
  }, []);

  const unreadCount = useMemo(
    () => notifications.reduce((acc, row) => (row.read ? acc : acc + 1), 0),
    [notifications],
  );

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount,
      pushDtmfNotification,
      markRead,
      markAllRead,
      clearAll,
    }),
    [notifications, unreadCount, pushDtmfNotification, markRead, markAllRead, clearAll],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {toasts.length > 0 ? (
        <div className="fixed top-20 right-4 z-[80] w-[min(360px,calc(100vw-1.5rem))] space-y-2 pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="cx-notify-toast pointer-events-auto rounded-xl border border-emerald-300/60 bg-white/95 shadow-xl px-3 py-2"
            >
              <div className="flex items-start gap-2">
                <div className="mt-0.5 h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <BellRing className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-tight">
                    {toast.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {toast.campaign}
                  </p>
                  <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-purple-300 bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">
                    <Hash className="h-3 w-3" />
                    {toast.number}
                    <span className="text-purple-500">→</span>
                    {toast.dtmf}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">{formatToastTime(toast.timestamp)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </NotificationContext.Provider>
  );
}

export function usePortalNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("usePortalNotifications must be used within NotificationProvider");
  }
  return context;
}
