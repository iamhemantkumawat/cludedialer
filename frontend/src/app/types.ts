export type AudioType = "none" | "upload" | "tts";
export type ToastTone = "info" | "success" | "error";
export type FeedTone = "default" | "green" | "amber" | "red" | "blue";
export type CampaignStatus = "pending" | "running" | "paused" | "completed" | "stopped";
export type FlowType = "campaign" | "ivr";
export type CallStatus =
  | "answered"
  | "busy"
  | "no-answer"
  | "failed"
  | "calling"
  | "cancelled"
  | "rejected"
  | "not-found"
  | "network-error"
  | "congestion";

export interface Campaign {
  id: string;
  flow_type?: FlowType;
  name: string;
  sip_account_id: string;
  audio_file: string | null;
  audio_type: AudioType;
  ivr_definition?: string;
  tts_text: string;
  tts_language: string;
  tts_voice_type?: string;
  dtmf_digits: number;
  concurrent_calls: number;
  call_timeout: number;
  retry_attempts: number;
  transfer_on_dtmf: number;
  transfer_dest: string;
  status: CampaignStatus;
  total_numbers: number;
  dialed: number;
  answered: number;
  created_at: string;
}

export interface ContactList {
  id: number;
  list_name: string;
  description: string;
  contact_count: number;
  created_at: string;
}

export interface ContactRecord {
  id: string;
  contact_list_id: number;
  phone_number: string;
  contact_name: string;
  status?: string;
  attempts?: number;
  last_result?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PaginatedContacts {
  contacts: ContactRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface SipAccount {
  id: string;
  name: string;
  username: string;
  password: string;
  domain: string;
  port: number;
  caller_id: string;
  channel_type: "SIP" | "PJSIP";
  source?: "magnus" | "external";
  is_active?: number;
  created_at?: string;
}

export interface AudioFile {
  name: string;
  size?: number;
  modified?: string;
}

export interface ActiveCall {
  actionId: string;
  campaignId: string;
  contactId: string;
  phone: string;
  answered: boolean;
  startTime: number | null;
  dtmf: string;
  duration: number;
}

export type IvrActionType = "none" | "node" | "queue" | "agent" | "hangup";

export interface IvrRoute {
  type: IvrActionType;
  target: string;
}

export interface IvrNode {
  id: string;
  name: string;
  audio_type: AudioType;
  audio_file: string;
  tts_text: string;
  tts_language: string;
  tts_voice_type: "female" | "male";
  wait_seconds: number;
  routes: Record<string, IvrRoute>;
}

export interface IvrDefinition {
  root_node_id: string;
  nodes: IvrNode[];
}

export interface IvrFormState {
  name: string;
  sip_account_id: string;
  concurrent_calls: number;
  call_timeout: number;
  retry_attempts: number;
  ivr_definition: IvrDefinition;
}

export interface CallHistoryResult {
  id: string;
  campaign_id: string;
  phone_number: string;
  dtmf: string;
  status: CallStatus;
  duration: number;
  caller_id: string;
  cause_txt: string;
  called_at: string;
}

export interface CallHistoryResponse {
  results: CallHistoryResult[];
  total: number;
}

export interface MagnusUser {
  username: string;
  magnusId?: string | number;
  credit: string;
  firstname: string;
  lastname: string;
  email?: string;
}

export interface MagnusLoginResponse extends MagnusUser {
  sessionId: string;
}

export interface Agent {
  id: string;
  name: string;
  username: string;
  password: string;
  caller_id: string;
  in_queue?: boolean;
  status?: "online" | "offline" | "unknown";
  account_id?: string;
}

export interface QueueConfig {
  account_id?: string;
  strategy: string;
  agent_timeout: number;
  max_wait: number;
  moh_file: string;
}

export interface QueueSettingsResponse {
  config: QueueConfig;
  agents: Pick<Agent, "id" | "name" | "username" | "in_queue">[];
  queue_name: string;
}

export interface QueueMonitorCaller {
  position: number;
  callerid: string;
  channel: string;
  wait: number;
}

export interface QueueMonitorAgent {
  name: string;
  username: string;
  location: string;
  status: "free" | "in-call" | "busy" | "offline" | "ringing" | "unknown";
  statusNum: string;
  callsTaken: number;
  lastCall: string;
  paused: boolean;
}

export interface QueueMonitorResponse {
  queue: string;
  agents: QueueMonitorAgent[];
  callers: QueueMonitorCaller[];
}

export interface ToastMessage {
  id: string;
  message: string;
  tone: ToastTone;
}

export interface EventFeedEntry {
  id: string;
  message: string;
  time: number;
  tone: FeedTone;
}

export interface DtmfFeedEntry {
  id: string;
  phone: string;
  digits: string;
  time: number;
}

export interface CampaignFormState {
  name: string;
  audioType: AudioType;
  audioFile: string;
  ttsText: string;
  ttsLanguage: string;
  ttsVoiceType: "female" | "male";
  dtmfDigits: number;
  concurrentCalls: number;
  retryAttempts: number;
  callTimeout: number;
  transferOnDtmf: boolean;
  transferDest: string;
}

export interface ContactListFormState {
  list_name: string;
  description: string;
}

export interface AgentFormState {
  name: string;
  password: string;
  caller_id: string;
}

export interface SipFormState {
  name: string;
  channel_type: "SIP" | "PJSIP";
  domain: string;
  username: string;
  password: string;
  caller_id: string;
  port: number;
}

export interface QueueFormState {
  strategy: string;
  agent_timeout: number;
  max_wait: number;
  moh_file: string;
}
