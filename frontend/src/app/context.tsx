import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { io } from "socket.io-client";
import { ApiError, accountHeaders, jsonRequest, magnusHeaders, requestJson, withAccountQuery } from "./api";
import type {
  ActiveCall,
  Agent,
  AudioFile,
  Campaign,
  ContactList,
  FlowType,
  MagnusLoginResponse,
  MagnusUser,
  QueueConfig,
  QueueSettingsResponse,
  ToastMessage,
  DtmfFeedEntry,
  EventFeedEntry,
  ToastTone,
} from "./types";
import { createFeedEntry, formatDuration, historyTone } from "./utils";

const STORAGE_SESSION_KEY = "magnus_session";
const STORAGE_USER_KEY = "magnus_user";

interface DialerContextValue {
  authReady: boolean;
  isAuthenticated: boolean;
  session: string | null;
  user: MagnusUser | null;
  amiConnected: boolean;
  campaigns: Campaign[];
  ivrs: Campaign[];
  contactLists: ContactList[];
  sipAccounts: import("./types").SipAccount[];
  audioFiles: AudioFile[];
  activeCalls: ActiveCall[];
  agents: Agent[];
  queueConfig: QueueConfig;
  queueName: string;
  eventFeed: EventFeedEntry[];
  dtmfFeed: DtmfFeedEntry[];
  toasts: ToastMessage[];
  notify: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: string) => void;
  clearEventFeed: () => void;
  clearDtmfFeed: () => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  subscription: { active: boolean; expires_at: string | null } | null;
  refreshSubscription: () => Promise<void>;
  syncMagnusSipAccounts: () => Promise<void>;
  refreshCampaigns: () => Promise<void>;
  refreshIvrs: () => Promise<void>;
  refreshContactLists: () => Promise<void>;
  refreshSipAccounts: () => Promise<void>;
  refreshAudioFiles: () => Promise<void>;
  refreshActiveCalls: () => Promise<void>;
  refreshAgentsData: () => Promise<void>;
}

const DialerContext = createContext<DialerContextValue | null>(null);

function readStoredUser() {
  const raw = window.localStorage.getItem(STORAGE_USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as MagnusUser;
  } catch {
    return null;
  }
}

const EMPTY_QUEUE_CONFIG: QueueConfig = {
  strategy: "ringall",
  agent_timeout: 15,
  max_wait: 120,
  moh_file: "",
};

export function DialerProvider({ children }: PropsWithChildren) {
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState<string | null>(() => window.localStorage.getItem(STORAGE_SESSION_KEY));
  const [user, setUser] = useState<MagnusUser | null>(() => readStoredUser());
  const [amiConnected, setAmiConnected] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [ivrs, setIvrs] = useState<Campaign[]>([]);
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [sipAccounts, setSipAccounts] = useState<import("./types").SipAccount[]>([]);
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [queueConfig, setQueueConfig] = useState<QueueConfig>(EMPTY_QUEUE_CONFIG);
  const [queueName, setQueueName] = useState("");
  const [eventFeed, setEventFeed] = useState<EventFeedEntry[]>([]);
  const [dtmfFeed, setDtmfFeed] = useState<DtmfFeedEntry[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [subscription, setSubscription] = useState<{ active: boolean; expires_at: string | null } | null>(null);

  const sessionRef = useRef(session);
  const userRef = useRef(user);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  function dismissToast(id: string) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function notify(message: string, tone: ToastTone = "info") {
    const id = crypto.randomUUID();
    setToasts((current) => [{ id, message, tone }, ...current].slice(0, 6));
    window.setTimeout(() => {
      dismissToast(id);
    }, 4200);
  }

  function pushEvent(message: string, tone: EventFeedEntry["tone"] = "default") {
    setEventFeed((current) => [createFeedEntry(message, tone), ...current].slice(0, 60));
  }

  function pushDtmf(phone: string, digits: string) {
    setDtmfFeed((current) => [
      {
        id: crypto.randomUUID(),
        phone,
        digits,
        time: Date.now(),
      },
      ...current,
    ].slice(0, 60));
  }

  function clearEventFeed() {
    setEventFeed([]);
  }

  function clearDtmfFeed() {
    setDtmfFeed([]);
  }

  function persistAuth(nextSession: string | null, nextUser: MagnusUser | null) {
    if (nextSession) {
      window.localStorage.setItem(STORAGE_SESSION_KEY, nextSession);
    } else {
      window.localStorage.removeItem(STORAGE_SESSION_KEY);
    }

    if (nextUser) {
      window.localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(nextUser));
    } else {
      window.localStorage.removeItem(STORAGE_USER_KEY);
    }
  }

  function resetAppState() {
    setCampaigns([]);
    setIvrs([]);
    setContactLists([]);
    setSipAccounts([]);
    setAudioFiles([]);
    setActiveCalls([]);
    setAgents([]);
    setQueueConfig(EMPTY_QUEUE_CONFIG);
    setQueueName("");
    setEventFeed([]);
    setDtmfFeed([]);
    setAmiConnected(false);
    setSubscription(null);
  }

  async function refreshCampaigns() {
    const data = await requestJson<Campaign[]>("/api/campaigns");
    setCampaigns(Array.isArray(data) ? data : []);
  }

  async function refreshIvrs() {
    const data = await requestJson<Campaign[]>("/api/ivrs");
    setIvrs(Array.isArray(data) ? data : []);
  }

  async function refreshContactLists() {
    const data = await requestJson<ContactList[]>("/api/contact-lists");
    setContactLists(Array.isArray(data) ? data : []);
  }

  async function refreshSipAccounts() {
    const data = await requestJson<import("./types").SipAccount[]>("/api/sip");
    setSipAccounts(Array.isArray(data) ? data : []);
  }

  async function refreshAudioFiles() {
    const data = await requestJson<AudioFile[]>("/api/audio");
    setAudioFiles(Array.isArray(data) ? data : []);
  }

  async function refreshActiveCalls() {
    const data = await requestJson<ActiveCall[]>("/api/calls/active");
    setActiveCalls(Array.isArray(data) ? data : []);
  }

  async function refreshAgentsData() {
    const currentUser = userRef.current;
    if (!currentUser) return;

    const [agentData, queueData] = await Promise.all([
      requestJson<Agent[]>(withAccountQuery("/api/agents", currentUser), {
        headers: accountHeaders(currentUser),
      }),
      requestJson<QueueSettingsResponse>(withAccountQuery("/api/queue", currentUser), {
        headers: accountHeaders(currentUser),
      }),
    ]);

    setAgents(Array.isArray(agentData) ? agentData : []);
    setQueueConfig(queueData.config || EMPTY_QUEUE_CONFIG);
    setQueueName(queueData.queue_name || "");
  }

  async function refreshBalance() {
    const currentSession = sessionRef.current;
    if (!currentSession) return;

    const profile = await requestJson<MagnusUser>("/api/magnus/me", {
      headers: magnusHeaders(currentSession),
    });

    setUser((current) => {
      const nextUser = current ? { ...current, ...profile } : profile;
      persistAuth(currentSession, nextUser);
      return nextUser;
    });
  }

  async function refreshSubscription() {
    try {
      const data = await requestJson<{ subscription: { expires_at: string; status: string } | null }>("/api/subscription");
      const sub = data.subscription;
      setSubscription(sub ? { active: true, expires_at: sub.expires_at } : { active: false, expires_at: null });
    } catch {
      setSubscription({ active: false, expires_at: null });
    }
  }

  // Silently syncs Magnus SIP accounts then refreshes the local list.
  // Called automatically when the SIP accounts page loads — no manual button needed.
  async function syncMagnusSipAccounts() {
    const currentSession = sessionRef.current;
    if (!currentSession) return;
    await requestJson<{ success: boolean }>("/api/magnus/sip-accounts/sync", {
      headers: magnusHeaders(currentSession),
    });
    await refreshSipAccounts();
  }

  async function hydrateBaseData() {
    await Promise.allSettled([
      refreshCampaigns(),
      refreshIvrs(),
      refreshContactLists(),
      refreshSipAccounts(),
      refreshAudioFiles(),
      refreshActiveCalls(),
      refreshSubscription(),
    ]);
  }

  async function login(username: string, password: string) {
    const response = await jsonRequest<MagnusLoginResponse>("/api/magnus/login", "POST", {
      username,
      password,
    });

    const nextUser: MagnusUser = {
      username: response.username,
      magnusId: response.magnusId,
      credit: response.credit,
      firstname: response.firstname,
      lastname: response.lastname,
      email: response.email,
    };

    setSession(response.sessionId);
    setUser(nextUser);
    persistAuth(response.sessionId, nextUser);
    setAuthReady(true);
    await hydrateBaseData();
  }

  async function logout() {
    const currentSession = sessionRef.current;
    if (currentSession) {
      try {
        await jsonRequest<{ success: boolean }>(
          "/api/magnus/logout",
          "POST",
          undefined,
          { headers: magnusHeaders(currentSession) },
        );
      } catch {
        // Best-effort logout only.
      }
    }

    setSession(null);
    setUser(null);
    persistAuth(null, null);
    resetAppState();
    setAuthReady(true);
  }

  useEffect(() => {
    let cancelled = false;

    async function verifySavedSession() {
      const currentSession = sessionRef.current;
      const currentUser = userRef.current;

      if (!currentSession || !currentUser) {
        setAuthReady(true);
        return;
      }

      try {
        const profile = await requestJson<MagnusUser>("/api/magnus/me", {
          headers: magnusHeaders(currentSession),
        });

        if (cancelled) return;

        const nextUser = { ...currentUser, ...profile };
        setUser(nextUser);
        persistAuth(currentSession, nextUser);
        await hydrateBaseData();
      } catch {
        if (cancelled) return;
        setSession(null);
        setUser(null);
        persistAuth(null, null);
        resetAppState();
      } finally {
        if (!cancelled) {
          setAuthReady(true);
        }
      }
    }

    void verifySavedSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session) return undefined;

    const socket = io({
      auth: {
        sessionId: session,
        accountId: userRef.current?.username || "",
      },
    });

    socket.on("ami:status", ({ connected }: { connected: boolean }) => {
      setAmiConnected(connected);
    });

    socket.on("campaign:updated", (campaign: Campaign) => {
      const flowType = (campaign.flow_type || "campaign") as FlowType;
      const applyUpdate = (current: Campaign[]) => {
        const index = current.findIndex((item) => item.id === campaign.id);
        if (index === -1) {
          return [campaign, ...current];
        }
        return current.map((item) => (item.id === campaign.id ? campaign : item));
      };

      if (flowType === "ivr") {
        setIvrs(applyUpdate);
        setCampaigns((current) => current.filter((item) => item.id !== campaign.id));
      } else {
        setCampaigns(applyUpdate);
        setIvrs((current) => current.filter((item) => item.id !== campaign.id));
      }
    });

    socket.on(
      "campaign:completed",
      ({ name, flowType }: { campaignId: string; name: string; flowType?: FlowType }) => {
        notify(`${flowType === "ivr" ? "IVR" : "Campaign"} "${name}" completed`, "success");
      },
    );

    socket.on("call:started", ({ phone }: { phone: string }) => {
      pushEvent(`Calling ${phone}`, "blue");
      void refreshActiveCalls().catch(() => undefined);
    });

    socket.on(
      "call:answered",
      ({ phone }: { phone: string; contactId: string; startTime: number }) => {
        pushEvent(`Answered: ${phone}`, "green");
        void refreshActiveCalls().catch(() => undefined);
      },
    );

    socket.on(
      "call:ended",
      ({
        phone,
        status,
        duration,
        dtmf,
        retrying,
      }: {
        phone: string;
        status: string;
        duration: number;
        dtmf: string;
        retrying?: boolean;
      }) => {
        const retrySuffix = retrying ? " [retrying]" : "";
        pushEvent(
          `${phone} — ${status}${retrySuffix} (${formatDuration(duration || 0)})`,
          historyTone(status),
        );
        if (dtmf && dtmf !== "NONE") {
          pushDtmf(phone, dtmf);
        }
        void refreshActiveCalls().catch(() => undefined);
      },
    );

    socket.on("call:dtmf", ({ phone, digit }: { phone: string; digit: string }) => {
      pushDtmf(phone, digit);
    });

    return () => {
      socket.close();
    };
  }, [session]);

  useEffect(() => {
    if (!session) return undefined;

    const callsInterval = window.setInterval(() => {
      void refreshActiveCalls().catch(() => undefined);
    }, 5000);

    const balanceInterval = window.setInterval(() => {
      void refreshBalance().catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          void logout();
        }
      });
    }, 60000);

    return () => {
      window.clearInterval(callsInterval);
      window.clearInterval(balanceInterval);
    };
  }, [session]);

  return (
    <DialerContext.Provider
      value={{
        authReady,
        isAuthenticated: Boolean(session && user),
        session,
        user,
        amiConnected,
        campaigns,
        ivrs,
        contactLists,
        sipAccounts,
        audioFiles,
        activeCalls,
        agents,
        queueConfig,
        queueName,
        eventFeed,
        dtmfFeed,
        toasts,
        notify,
        dismissToast,
        clearEventFeed,
        clearDtmfFeed,
        login,
        logout,
        refreshBalance,
        subscription,
        refreshSubscription,
        syncMagnusSipAccounts,
        refreshCampaigns,
        refreshIvrs,
        refreshContactLists,
        refreshSipAccounts,
        refreshAudioFiles,
        refreshActiveCalls,
        refreshAgentsData,
      }}
    >
      {children}
    </DialerContext.Provider>
  );
}

export function useDialer() {
  const context = useContext(DialerContext);
  if (!context) {
    throw new Error("useDialer must be used within DialerProvider");
  }
  return context;
}
