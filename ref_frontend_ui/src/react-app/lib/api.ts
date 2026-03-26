export type CurrencyCode = "INR" | "USD" | "EUR" | "GBP" | "RUB";

export interface WebappUser {
  sip_username: string;
  sip_domain: string;
  currency: CurrencyCode;
  balance_inr: number;
  balance_display: string;
  caller_id: string;
  default_sip_user?: string;
  sip_password?: string | null;
  telegram_id?: string | null;
  telegram_username?: string | null;
  telegram_name?: string | null;
  is_admin?: boolean;
  account_type?: "admin" | "user" | string;
  membership: {
    plan_name: string;
    plan_status: string;
    expiry_date: string | null;
    started_at?: string | null;
    days_remaining?: number | null;
    is_expiring?: boolean;
    price_eur?: number | null;
    duration_days?: number | null;
  };
}

export interface DashboardStats {
  totalContacts: number;
  activeCampaigns: number;
  callsToday: number;
  dtmfResponsesToday: number;
}

export interface RecentActivityRow {
  id: number;
  number: string;
  campaign: string;
  duration: string;
  dtmfPressed: string;
  status: string;
}

export interface CallPerformanceRow {
  day: string;
  calls: number;
  answered: number;
  dtmf: number;
}

export interface CampaignRow {
  id: number;
  name: string;
  callerId: string;
  sipAccount: string;
  status: string;
  totalCalls: number;
  dtmfResponses: number;
  campaignType: string;
  audioSource: string;
  concurrency?: number;
  ivrText?: string;
  ivrTextPreview?: string;
  ttsVoice?: string;
  maxCallDuration?: number;
  retryAttempts?: number;
  retryDelay?: number;
  dtmfMaxDigits?: number;
  enableDtmf?: boolean;
  enableRecording?: boolean;
  audioPreviewUrl?: string;
  numbersCount: number;
  runUuid: string | null;
}

export interface CampaignHistoryDtmfResult {
  number: string;
  digit: string;
}

export interface CampaignHistoryRow {
  runId: number;
  runUuid: string;
  campaignId: number;
  campaignName: string;
  runStatus: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationSeconds: number;
  durationFormatted: string;
  audioSource: string;
  ttsVoice: string;
  ttsTextPreview: string;
  audioPreviewUrl: string;
  totalNumbers: number;
  answeredCount: number;
  failedCount: number;
  dtmfHits: number;
  answerRate: number;
  dtmfSuccessRate: number;
  dtmfAnsweredRate: number;
  allNumbers: string[];
  answeredNumbers: string[];
  failedNumbers: string[];
  dtmfResults: CampaignHistoryDtmfResult[];
}

export interface ContactRow {
  id: number;
  number: string;
  name: string;
  status: string;
  attempts: number;
  lastResult: string;
  listId?: number;
  listName?: string;
}

export type ContactCleanupMode =
  | "clear_all"
  | "clear_answered"
  | "clear_dtmf"
  | "replace_from_text";

export interface ContactListRow {
  id: number;
  name: string;
  description?: string;
  contactsCount: number;
  pendingCount: number;
  calledCount: number;
  failedCount: number;
  timeCreated?: string | null;
}

export interface LiveCallRow {
  id: number;
  number: string;
  campaign: string;
  status: string;
  duration: string;
  durationSeconds?: number;
  dtmf: string;
  run_uuid: string;
  queuePosition?: number;
}

export interface CdrRow {
  id: number;
  date: string;
  number: string;
  callerId?: string;
  campaign: string;
  duration: string;
  durationSeconds?: number;
  dtmf: string;
  result: string;
  hasRecording: boolean;
  runUuid: string;
}

export interface RunEventRow {
  id: number;
  date: string;
  number: string;
  callerId: string;
  campaign: string;
  status: string;
  result: string;
  dtmf: string;
  duration: string;
  durationSeconds: number;
  sourceEvent: string;
  hangupCause: string;
}

export interface CallerIdRow {
  id: number;
  number: string;
  label: string;
  verified: boolean;
  isActive: boolean;
  sipUsername?: string;
  isTrunk?: boolean;
}

export interface SipUserRow {
  id: number;
  username: string;
  callerId: string;
  sipPassword?: string;
  host?: string;
  isTrunk?: boolean;
  lineStatus: string;
  isDefault: boolean;
}

export interface OutboundSettingsResponse {
  ok: true;
  callerIds: CallerIdRow[];
  sipUsers: SipUserRow[];
  trunkAccounts?: SipUserRow[];
  defaultSipUser: string;
  defaultCallerId: string;
}

export interface SubscriptionPlan {
  id: number;
  planKey: string;
  name: string;
  price: number;
  currency: string;
  durationDays: number;
  limits: string;
}

export interface AdminOverviewStats {
  total_users: number;
  telegram_registered_users: number;
  active_memberships: number;
  expiring_memberships: number;
  running_campaigns: number;
  live_calls: number;
  total_campaigns: number;
  total_runs: number;
  today_calls: number;
}

export interface AdminUserMembership {
  plan_name: string;
  status: "active" | "expiring" | "inactive" | "expired" | string;
  expiry_date: string | null;
  days_remaining: number | null;
  is_expiring: boolean;
}

export interface AdminUserRow {
  id: number;
  sip_username: string;
  telegram_id: string | null;
  telegram_username: string | null;
  telegram_name: string | null;
  telegram_registered: boolean;
  default_sip_user: string;
  membership: AdminUserMembership;
  campaigns_total: number;
  active_runs: number;
  last_run_at: string | null;
  time_created: string | null;
}

export interface AdminLiveCallRow extends LiveCallRow {
  sip_username: string;
}

export interface AdminLiveLogRow {
  timestamp: string;
  message: string;
  raw: string;
}

export interface AdminCampaignRow {
  id: number;
  sip_username: string;
  campaign_name: string;
  campaign_type: string;
  audio_source: string;
  numbers_count: number;
  status: string;
  active_run_uuid: string | null;
  runs_total: number;
  total_calls: number;
  dtmf_hits: number;
  created_at: string | null;
  latest_run_at: string | null;
}

export interface AdminCdrRow extends CdrRow {
  sip_username: string;
}

export interface AdminCdrPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface AdminActivityLogRow {
  id: number;
  date: string;
  action: string;
  actorRole: string;
  actorUsername: string;
  targetUsername: string;
  runUuid: string;
  ipAddress: string;
  detailsText: string;
}

export interface AdminBroadcastJob {
  job_id: string;
  status: "running" | "finished" | "failed" | string;
  total: number;
  sent: number;
  failed: number;
  started_at: string;
  finished_at: string | null;
  errors: string[];
  text_preview: string;
}

export type CampaignAudioSource = "tts" | "upload";

export interface TtsVoiceOption {
  id: string;
  label: string;
  lang: string;
  accent: string;
}

export interface CreateCampaignInput {
  name: string;
  callerId: string;
  sipAccount?: string;
  audioSource: CampaignAudioSource;
  ttsText: string;
  ttsVoice: string;
  voiceMessage: File | null;
  concurrency: number;
  maxCallDuration: number;
  retryAttempts: number;
  retryDelay: number;
  dtmfMaxDigits?: number;
  enableDtmf: boolean;
  enableRecording: boolean;
}

type ApiResponseWithOk = {
  ok: boolean;
  error?: string;
};

const API_BASE_URL = (() => {
  const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (envBase) {
    return envBase.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const port = window.location.port;
    const isLocalHost = host === "127.0.0.1" || host === "localhost";
    if (isLocalHost && (port === "5173" || port === "5174")) {
      return "http://127.0.0.1:7777";
    }
    // In production, always use same-origin (/api/...) through nginx/cloudflare.
    return "";
  }

  return "";
})();

async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (!isFormData && init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  const payload = (await parseJsonSafe(response)) as ApiResponseWithOk;

  if (!response.ok || (typeof payload.ok === "boolean" && !payload.ok)) {
    const message =
      payload.error ||
      `${response.status} ${response.statusText || "Request failed"}`.trim();
    throw new Error(message);
  }

  return payload as T;
}

async function apiRequestPublic<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (!isFormData && init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "omit",
  });

  const payload = (await parseJsonSafe(response)) as ApiResponseWithOk;

  if (!response.ok || (typeof payload.ok === "boolean" && !payload.ok)) {
    const message =
      payload.error ||
      `${response.status} ${response.statusText || "Request failed"}`.trim();
    throw new Error(message);
  }

  return payload as T;
}

export const webappApi = {
  health: () => apiRequest<{ ok: boolean; service: string }>("/api/webapp/health"),

  login: (sipUsername: string, sipPassword: string) =>
    apiRequest<{ ok: true; user: WebappUser }>("/api/webapp/auth/login", {
      method: "POST",
      body: JSON.stringify({ sip_username: sipUsername, sip_password: sipPassword }),
    }),

  me: () => apiRequest<{ ok: true; user: WebappUser }>("/api/webapp/auth/me"),

  logout: () => apiRequest<{ ok: true }>("/api/webapp/auth/logout", { method: "POST" }),

  getPreferences: () =>
    apiRequest<{ ok: true; currency: CurrencyCode; rates: Record<string, number> }>(
      "/api/webapp/preferences",
    ),

  setCurrency: (currency: CurrencyCode) =>
    apiRequest<{ ok: true; currency: CurrencyCode }>("/api/webapp/preferences/currency", {
      method: "POST",
      body: JSON.stringify({ currency }),
    }),

  getDashboard: () =>
    apiRequest<{
      ok: true;
      stats: DashboardStats;
      recentActivity: RecentActivityRow[];
      callPerformanceData: CallPerformanceRow[];
      user: WebappUser;
    }>("/api/webapp/dashboard"),

  getCampaigns: () => apiRequest<{ ok: true; campaigns: CampaignRow[] }>("/api/webapp/campaigns"),

  getCampaign: (campaignId: number) =>
    apiRequest<{ ok: true; campaign: CampaignRow }>(
      `/api/webapp/campaigns/${encodeURIComponent(String(campaignId))}`,
    ),

  getCampaignHistory: (limit = 120) =>
    apiRequest<{ ok: true; history: CampaignHistoryRow[] }>(
      `/api/webapp/campaigns/history?limit=${encodeURIComponent(String(limit))}`,
    ),

  getCampaignAudioPreviewUrl: (campaignId: number) =>
    `${API_BASE_URL}/api/webapp/campaigns/${encodeURIComponent(String(campaignId))}/audio-preview`,

  createCampaign: async (input: CreateCampaignInput) => {
    const concurrency = Math.max(
      1,
      Math.min(Number.parseInt(String(input.concurrency ?? 5), 10) || 5, 10),
    );
    const dtmfMaxDigits = Math.max(
      1,
      Math.min(Number.parseInt(String(input.dtmfMaxDigits ?? 1), 10) || 1, 6),
    );
    const formData = new FormData();
    formData.append("name", input.name);
    formData.append("callerId", input.callerId);
    if (input.sipAccount) {
      formData.append("sipAccount", input.sipAccount);
    }
    formData.append("maxCallDuration", String(input.maxCallDuration));
    formData.append("retryAttempts", String(input.retryAttempts));
    formData.append("retryDelay", String(input.retryDelay));
    formData.append("enableDtmf", String(input.enableDtmf));
    formData.append("enableRecording", String(input.enableRecording));
    formData.append("campaign_type", input.enableDtmf ? "dtmf" : "press1");
    formData.append("dtmf_max_digits", String(dtmfMaxDigits));
    formData.append("concurrency", String(concurrency));
    if (input.audioSource === "upload" && input.voiceMessage) {
      formData.append("voiceMessage", input.voiceMessage);
      formData.append("audio_source", "upload");
    } else {
      formData.append("audio_source", "tts");
      formData.append("ivrText", input.ttsText || `Hello from campaign ${input.name}`);
      formData.append("ttsVoice", input.ttsVoice || "en_us_female");
    }
    return apiRequest<{
      ok: true;
      campaign: { id: number; name: string; status: string; numbersCount: number };
    }>("/api/webapp/campaigns", {
      method: "POST",
      body: formData,
    });
  },

  launchCampaign: (campaignId: number, contactListId?: number) =>
    apiRequest<{ ok: true; run_uuid: string; campaign_id: number; numbersCount?: number }>(
      `/api/webapp/campaigns/${campaignId}/launch`,
      {
        method: "POST",
        body: JSON.stringify(
          contactListId && contactListId > 0
            ? { contact_list_id: contactListId }
            : {},
        ),
      },
    ),

  toggleCampaign: (campaignId: number, status?: "active" | "paused") =>
    apiRequest<{ ok: true; status: string }>(`/api/webapp/campaigns/${campaignId}/toggle`, {
      method: "POST",
      body: JSON.stringify(status ? { status } : {}),
    }),

  updateCampaign: async (campaignId: number, input: CreateCampaignInput) => {
    const concurrency = Math.max(
      1,
      Math.min(Number.parseInt(String(input.concurrency ?? 5), 10) || 5, 10),
    );
    const dtmfMaxDigits = Math.max(
      1,
      Math.min(Number.parseInt(String(input.dtmfMaxDigits ?? 1), 10) || 1, 6),
    );
    const formData = new FormData();
    formData.append("name", input.name);
    formData.append("callerId", input.callerId);
    if (input.sipAccount) {
      formData.append("sipAccount", input.sipAccount);
    }
    formData.append("maxCallDuration", String(input.maxCallDuration));
    formData.append("retryAttempts", String(input.retryAttempts));
    formData.append("retryDelay", String(input.retryDelay));
    formData.append("enableDtmf", String(input.enableDtmf));
    formData.append("enableRecording", String(input.enableRecording));
    formData.append("campaign_type", input.enableDtmf ? "dtmf" : "press1");
    formData.append("dtmf_max_digits", String(dtmfMaxDigits));
    formData.append("concurrency", String(concurrency));

    if (input.audioSource === "upload") {
      formData.append("audio_source", "upload");
      if (input.voiceMessage) {
        formData.append("voiceMessage", input.voiceMessage);
      }
    } else {
      formData.append("audio_source", "tts");
      formData.append("ivrText", input.ttsText || `Hello from campaign ${input.name}`);
      formData.append("ttsVoice", input.ttsVoice || "en_us_female");
    }

    return apiRequest<{ ok: true; campaign: CampaignRow }>(`/api/webapp/campaigns/${campaignId}`, {
      method: "PATCH",
      body: formData,
    });
  },

  deleteCampaign: (campaignId: number) =>
    apiRequest<{ ok: true }>(`/api/webapp/campaigns/${campaignId}`, { method: "DELETE" }),

  getContacts: (query = "", status = "all", listId?: number) => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (status && status !== "all") params.set("status", status);
    if (listId && listId > 0) params.set("list_id", String(listId));
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return apiRequest<{ ok: true; contacts: ContactRow[] }>(`/api/webapp/contacts${suffix}`);
  },

  addContact: (name: string, number: string, listId?: number) =>
    apiRequest<{ ok: true; contact_id: number; updated: boolean }>("/api/webapp/contacts", {
      method: "POST",
      body: JSON.stringify({ name, number, list_id: listId }),
    }),

  getContactLists: () =>
    apiRequest<{ ok: true; contactLists: ContactListRow[] }>("/api/webapp/contact-lists"),

  createContactList: (name: string, description = "") =>
    apiRequest<{ ok: true; contactList: ContactListRow }>("/api/webapp/contact-lists", {
      method: "POST",
      body: JSON.stringify({ name, description }),
    }),

  renameContactList: (listId: number, name: string) =>
    apiRequest<{ ok: true; contactList: ContactListRow }>(`/api/webapp/contact-lists/${listId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),

  deleteContactList: (listId: number) =>
    apiRequest<{ ok: true; movedToListId?: number }>(`/api/webapp/contact-lists/${listId}`, {
      method: "DELETE",
    }),

  deleteContact: (contactId: number) =>
    apiRequest<{ ok: true }>(`/api/webapp/contacts/${contactId}`, { method: "DELETE" }),

  importContactsCsv: (file: File, listId?: number) => {
    const formData = new FormData();
    formData.append("file", file);
    if (listId && listId > 0) {
      formData.append("list_id", String(listId));
    }
    return apiRequest<{ ok: true; added: number; updated: number }>(
      "/api/webapp/contacts/import",
      {
        method: "POST",
        body: formData,
      },
    );
  },

  importContactsText: (text: string, listId?: number) =>
    apiRequest<{ ok: true; added: number; updated: number }>("/api/webapp/contacts/import", {
      method: "POST",
      body: JSON.stringify({
        csv_text: text,
        list_id: listId,
      }),
    }),

  cleanupContacts: (mode: ContactCleanupMode, listId: number, csvText = "") =>
    apiRequest<{ ok: true; deleted?: number; added?: number; listId?: number }>(
      "/api/webapp/contacts/cleanup",
      {
        method: "POST",
        body: JSON.stringify({
          mode,
          list_id: listId,
          csv_text: csvText,
        }),
      },
    ),

  getLiveCalls: () =>
    apiRequest<{ ok: true; liveCalls: LiveCallRow[] }>("/api/webapp/live-calls"),

  stopRun: (runUuid: string) =>
    apiRequest<{ ok: true }>(`/api/webapp/live-calls/${runUuid}/stop`, {
      method: "POST",
    }),

  getLocalCdrs: () => apiRequest<{ ok: true; cdrRecords: CdrRow[] }>("/api/webapp/cdrs/local"),

  getMagnusCdrs: () =>
    apiRequest<{ ok: true; rows: unknown[] }>("/api/webapp/cdrs/magnus"),

  getTtsVoices: () =>
    apiRequest<{ ok: true; voices: TtsVoiceOption[] }>("/api/webapp/tts/voices"),

  previewTts: async (text: string, voice: string) => {
    const response = await fetch(`${API_BASE_URL}/api/webapp/tts/preview`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, voice }),
    });

    if (!response.ok) {
      const payload = (await parseJsonSafe(response)) as ApiResponseWithOk;
      throw new Error(payload.error || "Failed to generate TTS preview");
    }

    return response.blob();
  },

  getCallerIds: () =>
    apiRequest<OutboundSettingsResponse>("/api/webapp/caller-ids"),

  getOutboundSettings: () =>
    apiRequest<OutboundSettingsResponse>("/api/webapp/settings/outbound"),

  saveOutboundSettings: (sipUsername: string, callerId: string) =>
    apiRequest<OutboundSettingsResponse>("/api/webapp/settings/outbound", {
      method: "POST",
      body: JSON.stringify({ sip_username: sipUsername, caller_id: callerId }),
    }),

  setSipUserCallerId: (sipUsername: string, callerId: string) =>
    apiRequest<OutboundSettingsResponse>(`/api/webapp/sip-users/${encodeURIComponent(sipUsername)}/caller-id`, {
      method: "POST",
      body: JSON.stringify({ caller_id: callerId }),
    }),

  setDefaultSipUser: (sipUsername: string) =>
    apiRequest<OutboundSettingsResponse>("/api/webapp/settings/outbound/default-sip", {
      method: "POST",
      body: JSON.stringify({ sip_username: sipUsername }),
    }),

  getSubscription: () =>
    apiRequest<{
      ok: true;
      current: { plan_name: string; plan_status: string; expiry_date: string | null };
      plans: SubscriptionPlan[];
    }>("/api/webapp/subscription"),

  activateSubscription: (planKey: string) =>
    apiRequest<{
      ok: true;
      plan_name: string;
      expiry_date: string;
      balance_inr: number;
    }>("/api/webapp/subscription/activate", {
      method: "POST",
      body: JSON.stringify({ plan_key: planKey }),
    }),

  getRunStatus: (runUuid: string) =>
    apiRequest<{
      ok: true;
      state: string;
      run_uuid: string;
      campaign_name: string;
      completed: number;
      total: number;
      percent: number;
      dtmf_hits?: number;
    }>(`/api/webapp/runs/${runUuid}/status`),

  getRunLogs: (runUuid: string) =>
    apiRequest<{ ok: true; lines: string[] }>(`/api/webapp/runs/${runUuid}/logs`),

  getRunEvents: (runUuid: string) =>
    apiRequest<{ ok: true; events: RunEventRow[] }>(`/api/webapp/runs/${runUuid}/events`),

  getPublicRunStatus: (runUuid: string, token: string) =>
    apiRequestPublic<{
      ok: true;
      state: string;
      run_uuid: string;
      campaign_name: string;
      completed: number;
      total: number;
      percent: number;
      dtmf_hits?: number;
    }>(
      `/api/webapp/public/runs/${encodeURIComponent(runUuid)}/status?token=${encodeURIComponent(token)}`,
    ),

  getPublicRunLogs: (runUuid: string, token: string) =>
    apiRequestPublic<{ ok: true; lines: string[] }>(
      `/api/webapp/public/runs/${encodeURIComponent(runUuid)}/logs?token=${encodeURIComponent(token)}`,
    ),

  getPublicRunEvents: (runUuid: string, token: string) =>
    apiRequestPublic<{ ok: true; events: RunEventRow[] }>(
      `/api/webapp/public/runs/${encodeURIComponent(runUuid)}/events?token=${encodeURIComponent(token)}`,
    ),

  getAdminOverview: () =>
    apiRequest<{ ok: true; stats: AdminOverviewStats }>("/api/webapp/admin/overview"),

  getAdminUsers: (query = "", membership = "all") => {
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (membership && membership !== "all") {
      params.set("membership", membership);
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return apiRequest<{ ok: true; users: AdminUserRow[] }>(`/api/webapp/admin/users${suffix}`);
  },

  grantAdminFreeMembership: (sipUsername: string, durationDays = 7) =>
    apiRequest<{
      ok: true;
      sip_username: string;
      membership: {
        plan_name: string;
        status: string;
        expiry_date: string;
        days_remaining: number;
      };
    }>("/api/webapp/admin/memberships/grant-free", {
      method: "POST",
      body: JSON.stringify({ sip_username: sipUsername, duration_days: durationDays }),
    }),

  getAdminLiveCalls: () =>
    apiRequest<{ ok: true; liveCalls: AdminLiveCallRow[] }>("/api/webapp/admin/live-calls"),

  getAdminLiveLogs: (limit = 120) =>
    apiRequest<{ ok: true; active_run_uuids: string[]; logs: AdminLiveLogRow[] }>(
      `/api/webapp/admin/live-logs?limit=${encodeURIComponent(String(limit))}`,
    ),

  getAdminCampaigns: (query = "", limit = 400) => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (query.trim()) {
      params.set("q", query.trim());
    }
    return apiRequest<{ ok: true; campaigns: AdminCampaignRow[] }>(
      `/api/webapp/admin/campaigns?${params.toString()}`,
    );
  },

  getAdminCdrs: (query = "", page = 1, pageSize = 200) => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    if (query.trim()) {
      params.set("q", query.trim());
    }
    return apiRequest<{ ok: true; cdrRecords: AdminCdrRow[]; pagination: AdminCdrPagination }>(
      `/api/webapp/admin/cdrs?${params.toString()}`,
    );
  },

  getAdminActivityLogs: (query = "", action = "all", page = 1, pageSize = 200) => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (action && action !== "all") {
      params.set("action", action);
    }
    return apiRequest<{
      ok: true;
      logs: AdminActivityLogRow[];
      actions: string[];
      pagination: AdminCdrPagination;
    }>(`/api/webapp/admin/activity-logs?${params.toString()}`);
  },

  startAdminBroadcast: (text: string) =>
    apiRequest<{ ok: true; job: AdminBroadcastJob }>("/api/webapp/admin/broadcast", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  getAdminBroadcastJobs: () =>
    apiRequest<{ ok: true; jobs: AdminBroadcastJob[] }>("/api/webapp/admin/broadcast/jobs"),

  changeAdminPassword: (currentPassword: string, newPassword: string) =>
    apiRequest<{ ok: true }>("/api/webapp/admin/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    }),
};
