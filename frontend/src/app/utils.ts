import type {
  AudioFile,
  Campaign,
  CallStatus,
  EventFeedEntry,
  FeedTone,
  IvrDefinition,
  IvrNode,
  IvrRoute,
} from "./types";

export const FAILED_GROUP_STATUSES: CallStatus[] = [
  "failed",
  "cancelled",
  "rejected",
  "not-found",
  "network-error",
  "congestion",
];

export const TTS_LANGUAGE_GROUPS = [
  {
    label: "English",
    options: [
      { value: "en-US", label: "🇺🇸 English (US)" },
      { value: "en-GB", label: "🇬🇧 English (UK)" },
      { value: "en-IN", label: "🇮🇳 English (India)" },
      { value: "en-AU", label: "🇦🇺 English (Australia)" },
    ],
  },
  {
    label: "South Asian",
    options: [{ value: "hi-IN", label: "🇮🇳 Hindi" }],
  },
  {
    label: "Europe",
    options: [
      { value: "it-IT", label: "🇮🇹 Italian" },
      { value: "tr-TR", label: "🇹🇷 Turkish" },
      { value: "es-ES", label: "🇪🇸 Spanish" },
      { value: "de-DE", label: "🇩🇪 German" },
      { value: "pt-BR", label: "🇧🇷 Portuguese (Brazil)" },
      { value: "pt-PT", label: "🇵🇹 Portuguese (Portugal)" },
    ],
  },
];

export const TTS_VOICE_TYPE_OPTIONS = [
  { value: "female", label: "Female Preset" },
  { value: "male", label: "Male Preset" },
] as const;

export const IVR_ACTION_OPTIONS = [
  { value: "none", label: "No action" },
  { value: "node", label: "Play another menu" },
  { value: "queue", label: "Transfer to queue" },
  { value: "agent", label: "Transfer to agent" },
  { value: "hangup", label: "Hang up" },
] as const;

export const IVR_DIGIT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "default"] as const;

export const QUEUE_STRATEGIES = [
  { value: "ringall", label: "Ring All (recommended)" },
  { value: "leastrecent", label: "Least Recent" },
  { value: "fewestcalls", label: "Fewest Calls" },
  { value: "rrmemory", label: "Round Robin" },
  { value: "random", label: "Random" },
];

export const HISTORY_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "answered", label: "Answered" },
  { value: "no-answer", label: "No Answer" },
  { value: "busy", label: "Busy" },
  { value: "cancelled", label: "Cancelled" },
  { value: "rejected", label: "Rejected" },
  { value: "not-found", label: "Not Found" },
  { value: "failed", label: "Failed" },
];

export function audioFileName(file: AudioFile | string | null | undefined): string {
  if (!file) return "";
  if (typeof file === "string") return file;
  return file.name;
}

export function audioUrl(fileName: string) {
  return `/audio/${encodeURIComponent(fileName)}`;
}

export function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatTimestamp(raw: string | null | undefined) {
  if (!raw) return "—";
  const date = new Date(raw);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatMoney(raw: string | number | null | undefined) {
  const amount = Number.parseFloat(String(raw ?? 0));
  return `$${Number.isNaN(amount) ? "0.0000" : amount.toFixed(4)}`;
}

export function campaignAudioLabel(campaign: Campaign) {
  if (campaign.audio_type === "tts") {
    const preview = campaign.tts_text || "";
    return preview ? `TTS: "${preview.slice(0, 34)}${preview.length > 34 ? "…" : ""}"` : "TTS";
  }
  return campaign.audio_file || "No audio";
}

export function createDefaultIvrRoute(): IvrRoute {
  return { type: "none", target: "" };
}

export function createDefaultIvrNode(index = 0): IvrNode {
  return {
    id: `node_${index + 1}`,
    name: `Menu ${index + 1}`,
    audio_type: "none",
    audio_file: "",
    tts_text: "",
    tts_language: "en-US",
    tts_voice_type: "female",
    wait_seconds: 6,
    routes: Object.fromEntries(IVR_DIGIT_KEYS.map((key) => [key, createDefaultIvrRoute()])),
  };
}

export function parseIvrDefinition(raw: unknown): IvrDefinition {
  const parsed =
    typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw) as Partial<IvrDefinition>;
          } catch {
            return {};
          }
        })()
      : raw && typeof raw === "object"
        ? (raw as Partial<IvrDefinition>)
        : {};

  const sourceNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  const nodes = sourceNodes.length
    ? sourceNodes.map((node, index) => {
        const fallback = createDefaultIvrNode(index);
        const routes = Object.fromEntries(
          IVR_DIGIT_KEYS.map((key) => {
            const route = node?.routes?.[key];
            return [
              key,
              {
                type: ["none", "node", "queue", "agent", "hangup"].includes(String(route?.type || ""))
                  ? String(route?.type) as IvrRoute["type"]
                  : "none",
                target: String(route?.target || ""),
              },
            ];
          }),
        );
        const ttsVoiceType: IvrNode["tts_voice_type"] =
          String(node?.tts_voice_type || fallback.tts_voice_type) === "male" ? "male" : "female";

        return {
          ...fallback,
          id: String(node?.id || fallback.id),
          name: String(node?.name || fallback.name),
          audio_type: ["none", "upload", "tts"].includes(String(node?.audio_type || ""))
            ? String(node?.audio_type) as IvrNode["audio_type"]
            : "none",
          audio_file: String(node?.audio_file || ""),
          tts_text: String(node?.tts_text || ""),
          tts_language: String(node?.tts_language || fallback.tts_language),
          tts_voice_type: ttsVoiceType,
          wait_seconds: Math.max(1, Math.min(30, Number(node?.wait_seconds) || fallback.wait_seconds)),
          routes,
        };
      })
    : [createDefaultIvrNode(0)];

  const rootCandidate = String(parsed.root_node_id || nodes[0]?.id || "");
  return {
    root_node_id: nodes.some((node) => node.id === rootCandidate) ? rootCandidate : nodes[0].id,
    nodes,
  };
}

export function ivrNodePromptLabel(node: IvrNode) {
  if (node.audio_type === "upload") return node.audio_file || "Uploaded audio";
  if (node.audio_type === "tts") {
    const preview = node.tts_text || "";
    return preview ? `TTS: "${preview.slice(0, 34)}${preview.length > 34 ? "…" : ""}"` : "TTS";
  }
  return "No prompt";
}

export function historyTone(status: string): FeedTone {
  if (status === "answered") return "green";
  if (status === "busy" || status === "ringing") return "amber";
  if (status === "failed" || status === "rejected" || status === "network-error") return "red";
  if (status === "calling") return "blue";
  return "default";
}

export function createFeedEntry(message: string, tone: FeedTone = "default"): EventFeedEntry {
  return {
    id: crypto.randomUUID(),
    message,
    time: Date.now(),
    tone,
  };
}

export function fmtWait(seconds: number) {
  if (!seconds) return "0s";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function percentage(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}
