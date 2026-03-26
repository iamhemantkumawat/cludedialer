import { useEffect, useMemo, useState } from "react";
import { Loader2, Upload, Volume2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/react-app/components/ui/dialog";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/react-app/components/ui/select";
import { Switch } from "@/react-app/components/ui/switch";
import { Textarea } from "@/react-app/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/react-app/components/ui/tabs";
import {
  webappApi,
  type CampaignAudioSource,
  type TtsVoiceOption,
} from "@/react-app/lib/api";

interface CreateCampaignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CampaignFormData) => void;
  callerIds: CallerIdOption[];
  mode?: "create" | "edit";
  title?: string;
  submitLabel?: string;
  initialData?: Partial<CampaignFormData>;
  existingAudioPreviewUrl?: string | null;
}

export interface CampaignFormData {
  name: string;
  callerId: string;
  audioSource: CampaignAudioSource;
  ttsText: string;
  ttsVoice: string;
  voiceMessage: File | null;
  concurrency: number;
  maxCallDuration: number;
  retryAttempts: number;
  retryDelay: number;
  dtmfMaxDigits: number;
  enableDtmf: boolean;
  enableRecording: boolean;
}

interface CallerIdOption {
  id: number;
  number: string;
  label: string;
  verified: boolean;
  isActive: boolean;
  sipUsername?: string;
}

const FALLBACK_TTS_VOICES: TtsVoiceOption[] = [
  { id: "en_us_female", label: "🇺🇸 English (US) Female", lang: "en", accent: "com" },
  { id: "en_us_male", label: "🇺🇸 English (US) Male", lang: "en", accent: "us" },
  { id: "en_uk_female", label: "🇬🇧 English (UK) Female", lang: "en", accent: "co.uk" },
  { id: "en_uk_male", label: "🇬🇧 English (UK) Male", lang: "en", accent: "co.uk" },
  { id: "en_in_female", label: "🇮🇳 English (India) Female", lang: "en", accent: "co.in" },
  { id: "hi_in_female", label: "🇮🇳 Hindi (India) Female", lang: "hi", accent: "co.in" },
  { id: "en_au_female", label: "🇦🇺 English (Australia) Female", lang: "en", accent: "com.au" },
  { id: "en_au_male", label: "🇦🇺 English (Australia) Male", lang: "en", accent: "com.au" },
  { id: "it_it_female", label: "🇮🇹 Italian Female", lang: "it", accent: "it" },
  { id: "it_it_male", label: "🇮🇹 Italian Male", lang: "it", accent: "it" },
  { id: "tr_tr_female", label: "🇹🇷 Turkish Female", lang: "tr", accent: "com.tr" },
  { id: "tr_tr_male", label: "🇹🇷 Turkish Male", lang: "tr", accent: "com.tr" },
  { id: "es_es_female", label: "🇪🇸 Spanish Female", lang: "es", accent: "es" },
  { id: "es_es_male", label: "🇪🇸 Spanish Male", lang: "es", accent: "es" },
  { id: "de_de_female", label: "🇩🇪 German Female", lang: "de", accent: "de" },
  { id: "de_de_male", label: "🇩🇪 German Male", lang: "de", accent: "de" },
  { id: "pt_br_female", label: "🇧🇷 Portuguese (Brazil) Female", lang: "pt", accent: "com.br" },
  { id: "pt_br_male", label: "🇧🇷 Portuguese (Brazil) Male", lang: "pt", accent: "com.br" },
  { id: "pt_pt_female", label: "🇵🇹 Portuguese (Portugal) Female", lang: "pt", accent: "pt" },
  { id: "pt_pt_male", label: "🇵🇹 Portuguese (Portugal) Male", lang: "pt", accent: "pt" },
];

function defaultCallerIdFrom(rows: CallerIdOption[]): string {
  return (
    rows.find((row) => row.isActive)?.number ||
    rows.find((row) => row.verified)?.number ||
    rows[0]?.number ||
    ""
  );
}

function defaultVoiceIdFrom(rows: TtsVoiceOption[]): string {
  return rows[0]?.id || "en_us_female";
}

function mergeVoiceOptions(apiVoices?: TtsVoiceOption[]): TtsVoiceOption[] {
  const fromApi = Array.isArray(apiVoices) ? apiVoices : [];
  const byId = new Map<string, TtsVoiceOption>();

  for (const voice of fromApi) {
    if (!voice?.id) continue;
    byId.set(voice.id, voice);
  }

  for (const fallback of FALLBACK_TTS_VOICES) {
    const existing = byId.get(fallback.id);
    if (existing) {
      byId.set(fallback.id, { ...existing, label: fallback.label });
    } else {
      byId.set(fallback.id, fallback);
    }
  }

  const ordered: TtsVoiceOption[] = [];
  const seen = new Set<string>();
  for (const fallback of FALLBACK_TTS_VOICES) {
    const value = byId.get(fallback.id);
    if (!value) continue;
    ordered.push(value);
    seen.add(fallback.id);
  }
  const dedupedByLabel: TtsVoiceOption[] = [];
  const labelSeen = new Set<string>();
  for (const voice of ordered) {
    const key = String(voice.label || voice.id || "").trim().toLowerCase();
    if (!key || labelSeen.has(key)) continue;
    labelSeen.add(key);
    dedupedByLabel.push(voice);
  }

  return dedupedByLabel.length > 0 ? dedupedByLabel : FALLBACK_TTS_VOICES;
}

function toPositiveInt(value: unknown, fallback: number, min: number): number {
  const next = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(next)) return fallback;
  return Math.max(next, min);
}

function buildInitialFormData(
  initialData: Partial<CampaignFormData> | undefined,
  selectableCallerIds: CallerIdOption[],
  ttsVoices: TtsVoiceOption[],
): CampaignFormData {
  const dtmfMaxDigits = Math.max(
    1,
    Math.min(toPositiveInt(initialData?.dtmfMaxDigits, 1, 1), 6),
  );
  return {
    name: initialData?.name || "",
    callerId: initialData?.callerId || defaultCallerIdFrom(selectableCallerIds),
    audioSource: initialData?.audioSource || "tts",
    ttsText: initialData?.ttsText || "",
    ttsVoice: initialData?.ttsVoice || defaultVoiceIdFrom(ttsVoices),
    voiceMessage: null,
    concurrency: Math.max(1, Math.min(toPositiveInt(initialData?.concurrency, 3, 1), 5)),
    maxCallDuration: toPositiveInt(initialData?.maxCallDuration, 60, 10),
    retryAttempts: toPositiveInt(initialData?.retryAttempts, 3, 0),
    retryDelay: toPositiveInt(initialData?.retryDelay, 300, 1),
    dtmfMaxDigits,
    enableDtmf:
      typeof initialData?.enableDtmf === "boolean" ? initialData.enableDtmf : true,
    enableRecording:
      typeof initialData?.enableRecording === "boolean" ? initialData.enableRecording : false,
  };
}

export default function CreateCampaignModal({
  open,
  onOpenChange,
  onSubmit,
  callerIds,
  mode = "create",
  title,
  submitLabel,
  initialData,
  existingAudioPreviewUrl,
}: CreateCampaignModalProps) {
  const selectableCallerIds = useMemo(
    () => callerIds.filter((row) => row.number && row.number !== "Not Set"),
    [callerIds],
  );

  const [ttsVoices, setTtsVoices] = useState<TtsVoiceOption[]>(FALLBACK_TTS_VOICES);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [ttsPreviewUrl, setTtsPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [formData, setFormData] = useState<CampaignFormData>(
    buildInitialFormData(initialData, selectableCallerIds, FALLBACK_TTS_VOICES),
  );

  useEffect(() => {
    if (!open) return;

    if (uploadPreviewUrl) {
      URL.revokeObjectURL(uploadPreviewUrl);
      setUploadPreviewUrl(null);
    }
    if (ttsPreviewUrl) {
      URL.revokeObjectURL(ttsPreviewUrl);
      setTtsPreviewUrl(null);
    }
    setPreviewError(null);
    setFormError(null);
    setPreviewLoading(false);
    setFormData(buildInitialFormData(initialData, selectableCallerIds, ttsVoices));

    const loadTtsVoices = async () => {
      try {
        const response = await webappApi.getTtsVoices();
        const nextVoices = mergeVoiceOptions(response.voices);
        setTtsVoices(nextVoices);
        setFormData((prev) => ({
          ...prev,
          ttsVoice: prev.ttsVoice || defaultVoiceIdFrom(nextVoices),
        }));
      } catch {
        setTtsVoices(FALLBACK_TTS_VOICES);
      }
    };
    void loadTtsVoices();
  }, [open, initialData, selectableCallerIds]);

  useEffect(() => {
    return () => {
      if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
      if (ttsPreviewUrl) URL.revokeObjectURL(ttsPreviewUrl);
    };
  }, [uploadPreviewUrl, ttsPreviewUrl]);

  const replaceUploadPreview = (nextFile: File | null) => {
    if (uploadPreviewUrl) {
      URL.revokeObjectURL(uploadPreviewUrl);
      setUploadPreviewUrl(null);
    }
    if (nextFile) {
      setUploadPreviewUrl(URL.createObjectURL(nextFile));
    }
  };

  const replaceTtsPreview = (blob: Blob | null) => {
    if (ttsPreviewUrl) {
      URL.revokeObjectURL(ttsPreviewUrl);
      setTtsPreviewUrl(null);
    }
    if (blob) {
      setTtsPreviewUrl(URL.createObjectURL(blob));
    }
  };

  const handleModalOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.name.trim()) {
      setFormError("Campaign name is required.");
      return;
    }
    if (!formData.callerId.trim()) {
      setFormError("Caller ID is required.");
      return;
    }
    if (formData.audioSource === "tts" && !formData.ttsText.trim()) {
      setFormError("TTS message text is required.");
      return;
    }
    if (
      formData.audioSource === "upload" &&
      !formData.voiceMessage &&
      !existingAudioPreviewUrl
    ) {
      setFormError("Please upload an audio file.");
      return;
    }
    if (
      !Number.isFinite(formData.concurrency) ||
      formData.concurrency < 1 ||
      formData.concurrency > 5
    ) {
      setFormError("Concurrency must be between 1 and 5.");
      return;
    }
    if (
      !Number.isFinite(formData.dtmfMaxDigits) ||
      formData.dtmfMaxDigits < 1 ||
      formData.dtmfMaxDigits > 6
    ) {
      setFormError("DTMF digits must be between 1 and 6.");
      return;
    }

    onSubmit(formData);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setFormData((prev) => ({
      ...prev,
      audioSource: "upload",
      voiceMessage: file,
    }));
    replaceUploadPreview(file);
  };

  const handleTtsPreview = async () => {
    const text = formData.ttsText.trim();
    if (!text) {
      setPreviewError("Enter TTS text to generate preview.");
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const blob = await webappApi.previewTts(text, formData.ttsVoice);
      replaceTtsPreview(blob);
      setFormData((prev) => ({ ...prev, audioSource: "tts" }));
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Failed to generate preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  const computedTitle = title || (mode === "edit" ? "Edit Campaign" : "Create New Campaign");
  const computedSubmitLabel = submitLabel || (mode === "edit" ? "Save Changes" : "Create Campaign");
  const uploadPlaybackSrc =
    uploadPreviewUrl ||
    (formData.audioSource === "upload" && existingAudioPreviewUrl ? existingAudioPreviewUrl : null);

  return (
    <Dialog open={open} onOpenChange={handleModalOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">{computedTitle}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">Campaign Name</Label>
            <Input
              id="name"
              placeholder="Enter campaign name"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="callerId">Caller ID</Label>
            {selectableCallerIds.length > 0 ? (
              <Select
                value={formData.callerId}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, callerId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select caller ID and SIP user" />
                </SelectTrigger>
                <SelectContent>
                  {selectableCallerIds.map((caller) => (
                    <SelectItem key={caller.id} value={caller.number}>
                      {caller.number} ({caller.label})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="callerId"
                placeholder="Enter caller ID"
                value={formData.callerId}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, callerId: event.target.value }))
                }
              />
            )}
          </div>

          <div className="space-y-3">
            <Label>Voice Source</Label>
            <Tabs
              value={formData.audioSource}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, audioSource: value as CampaignAudioSource }))
              }
              className="w-full"
            >
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="tts">TTS</TabsTrigger>
                <TabsTrigger value="upload">Upload Audio</TabsTrigger>
              </TabsList>

              <TabsContent value="tts" className="space-y-3 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="ttsText">TTS Message</Label>
                  <Textarea
                    id="ttsText"
                    placeholder="Type what should be spoken in the call..."
                    value={formData.ttsText}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, ttsText: event.target.value }))
                    }
                    className="min-h-24"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ttsVoice">Voice (Accent + Style)</Label>
                  <Select
                    value={formData.ttsVoice}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, ttsVoice: value }))
                    }
                  >
                    <SelectTrigger id="ttsVoice">
                      <SelectValue placeholder="Select TTS voice" />
                    </SelectTrigger>
                    <SelectContent>
                      {ttsVoices.map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}>
                          {voice.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleTtsPreview()}
                    disabled={previewLoading || !formData.ttsText.trim()}
                  >
                    {previewLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Volume2 className="h-4 w-4 mr-2" />
                    )}
                    Generate TTS Preview
                  </Button>
                </div>
                {previewError ? (
                  <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                    {previewError}
                  </div>
                ) : null}
                {ttsPreviewUrl ? (
                  <audio controls autoPlay src={ttsPreviewUrl} className="w-full">
                    <track kind="captions" />
                  </audio>
                ) : null}
              </TabsContent>

              <TabsContent value="upload" className="space-y-3 pt-2">
                <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleFileChange}
                    className="hidden"
                    id="voice-upload"
                  />
                  <label htmlFor="voice-upload" className="cursor-pointer">
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {formData.voiceMessage
                        ? formData.voiceMessage.name
                        : mode === "edit" && existingAudioPreviewUrl
                          ? "Current uploaded file (upload new to replace)"
                          : "Click to upload audio file"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">MP3, WAV up to 10MB</p>
                  </label>
                </div>
                {uploadPlaybackSrc ? (
                  <audio controls autoPlay src={uploadPlaybackSrc} className="w-full">
                    <track kind="captions" />
                  </audio>
                ) : null}
              </TabsContent>
            </Tabs>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="concurrency">Concurrency (1-5)</Label>
              <Input
                id="concurrency"
                type="number"
                min="1"
                max="5"
                value={formData.concurrency}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    concurrency: Math.max(
                      1,
                      Math.min(Number.parseInt(e.target.value || "3", 10) || 3, 5),
                    ),
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Default is 3. Max allowed is 5.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxDuration">Max Duration (s)</Label>
              <Input
                id="maxDuration"
                type="number"
                min="10"
                max="300"
                value={formData.maxCallDuration}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    maxCallDuration: Number.parseInt(e.target.value, 10) || 60,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="retryAttempts">Retry Attempts</Label>
              <Input
                id="retryAttempts"
                type="number"
                min="0"
                max="10"
                value={formData.retryAttempts}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    retryAttempts: Number.parseInt(e.target.value, 10) || 0,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="retryDelay">Retry Delay (s)</Label>
              <Input
                id="retryDelay"
                type="number"
                min="60"
                max="3600"
                value={formData.retryDelay}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    retryDelay: Number.parseInt(e.target.value, 10) || 300,
                  }))
                }
              />
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="dtmf" className="text-base">
                  Enable DTMF Detection
                </Label>
                <p className="text-sm text-muted-foreground">Detect keypad presses from recipients</p>
              </div>
              <Switch
                id="dtmf"
                checked={formData.enableDtmf}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, enableDtmf: checked }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dtmfMaxDigits">Digits To Capture</Label>
              <Input
                id="dtmfMaxDigits"
                type="number"
                min="1"
                max="6"
                disabled={!formData.enableDtmf}
                value={formData.dtmfMaxDigits}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    dtmfMaxDigits: Math.max(
                      1,
                      Math.min(Number.parseInt(e.target.value || "1", 10) || 1, 6),
                    ),
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Use `1` for single key, or set `3`, `4`, `5`, `6` to capture OTP-style multi-digit input.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="recording" className="text-base">
                  Enable Call Recording
                </Label>
                <p className="text-sm text-muted-foreground">Record all outbound calls</p>
              </div>
              <Switch
                id="recording"
                checked={formData.enableRecording}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, enableRecording: checked }))
                }
              />
            </div>
          </div>

          {formError ? (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
              {formError}
            </div>
          ) : null}

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => handleModalOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{computedSubmitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
