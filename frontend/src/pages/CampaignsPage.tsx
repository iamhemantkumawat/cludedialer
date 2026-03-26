import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { jsonRequest, requestJson } from "../app/api";
import { useDialer } from "../app/context";
import type { Campaign, CampaignFormState } from "../app/types";
import { TTS_LANGUAGE_GROUPS, TTS_VOICE_TYPE_OPTIONS, campaignAudioLabel } from "../app/utils";
import { AudioPreview } from "../components/AudioPreview";
import { Modal } from "../components/Modal";
import { TtsPreviewButton } from "../components/TtsPreviewButton";

const DEFAULT_FORM: CampaignFormState = {
  name: "",
  audioType: "none",
  audioFile: "",
  ttsText: "",
  ttsLanguage: "en-US",
  ttsVoiceType: "female",
  dtmfDigits: 1,
  concurrentCalls: 2,
  retryAttempts: 0,
  callTimeout: 30,
  transferOnDtmf: false,
  transferDest: "",
};

export function CampaignsPage() {
  const navigate = useNavigate();
  const {
    campaigns,
    audioFiles,
    sipAccounts,
    agents,
    queueName,
    refreshCampaigns,
    refreshAudioFiles,
    refreshSipAccounts,
    refreshAgentsData,
    notify,
  } = useDialer();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [form, setForm] = useState<CampaignFormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);

  useEffect(() => {
    void Promise.allSettled([refreshCampaigns(), refreshAudioFiles(), refreshSipAccounts()]);
  }, []);

  function openModal(campaign?: Campaign) {
    setEditingCampaign(campaign || null);
    setForm(
      campaign
        ? {
            name: campaign.name,
            audioType: campaign.audio_type || "none",
            audioFile: campaign.audio_file || "",
            ttsText: campaign.tts_text || "",
            ttsLanguage: campaign.tts_language || "en-US",
            ttsVoiceType: campaign.tts_voice_type === "male" ? "male" : "female",
            dtmfDigits: Number(campaign.dtmf_digits) || 1,
            concurrentCalls: Number(campaign.concurrent_calls) || 2,
            retryAttempts: Number(campaign.retry_attempts) || 0,
            callTimeout: Number(campaign.call_timeout) || 30,
            transferOnDtmf: Boolean(campaign.transfer_on_dtmf),
            transferDest: campaign.transfer_dest || "",
          }
        : DEFAULT_FORM,
    );
    setModalOpen(true);
    void Promise.allSettled([refreshAudioFiles(), refreshSipAccounts(), refreshAgentsData()]);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name.trim()) {
      notify("Campaign name is required", "error");
      return;
    }

    if (!editingCampaign && !sipAccounts.length) {
      notify("Add at least one SIP account before creating a campaign", "error");
      return;
    }

    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        audio_type: form.audioType,
        audio_file: form.audioType === "upload" ? form.audioFile || null : null,
        tts_text: form.audioType === "tts" ? form.ttsText.trim() : "",
        tts_language: form.audioType === "tts" ? form.ttsLanguage : "en-US",
        tts_voice_type: form.audioType === "tts" ? form.ttsVoiceType : "female",
        dtmf_digits: form.dtmfDigits,
        concurrent_calls: form.concurrentCalls,
        retry_attempts: form.retryAttempts,
        call_timeout: form.callTimeout,
        transfer_on_dtmf: form.transferOnDtmf ? 1 : 0,
        transfer_dest: form.transferOnDtmf ? form.transferDest : "",
        ...(editingCampaign ? {} : { sip_account_id: sipAccounts[0]?.id }),
      };

      await jsonRequest(
        editingCampaign ? `/api/campaigns/${editingCampaign.id}` : "/api/campaigns",
        editingCampaign ? "PUT" : "POST",
        body,
      );

      await refreshCampaigns();
      notify(editingCampaign ? "Campaign updated" : "Campaign created", "success");
      setModalOpen(false);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to save campaign", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(campaign: Campaign) {
    if (!window.confirm(`Delete campaign "${campaign.name}"?`)) return;
    try {
      await jsonRequest(`/api/campaigns/${campaign.id}`, "DELETE");
      await refreshCampaigns();
      notify("Campaign deleted", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to delete campaign", "error");
    }
  }

  async function handleAudioUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingAudio(true);
    try {
      const formData = new FormData();
      formData.append("audio", file);
      const response = await requestJson<{ filename: string }>("/api/audio/upload", {
        method: "POST",
        body: formData,
      });
      await refreshAudioFiles();
      setForm((current) => ({ ...current, audioType: "upload", audioFile: response.filename }));
      notify("Audio uploaded", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to upload audio", "error");
    } finally {
      setUploadingAudio(false);
      event.target.value = "";
    }
  }

  const transferQueueName = queueName || "agent-queue";

  return (
    <section className="section active">
      <div className="page-header">
        <div className="page-title">Campaigns</div>
        <button className="btn btn-primary" type="button" onClick={() => openModal()}>
          + New Campaign
        </button>
      </div>

      <div className="page-body">
        <div className="campaign-cards">
          {campaigns.length ? (
            campaigns.map((campaign) => (
              <article className="camp-card" key={campaign.id}>
                <div className="camp-card__header">
                  <div className="camp-card-name">{campaign.name}</div>
                  <span className={`badge badge-${campaign.status}`}>{campaign.status}</span>
                </div>

                <div className="camp-card-meta">
                  <span className="meta-chip">🎵 {campaignAudioLabel(campaign)}</span>
                  <span className="meta-chip">🎹 {campaign.dtmf_digits} digit(s)</span>
                  <span className="meta-chip">⚡ {campaign.concurrent_calls} concurrent</span>
                  <span className="meta-chip">🔄 {campaign.retry_attempts} retries</span>
                  <span className="meta-chip">⏱ {campaign.call_timeout}s</span>
                </div>

                <div className="camp-card__actions">
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => openModal(campaign)}>
                    Edit
                  </button>
                  <button className="btn btn-danger btn-sm" type="button" onClick={() => void handleDelete(campaign)}>
                    Delete
                  </button>
                  <button
                    className="btn btn-blue btn-sm camp-card__run"
                    type="button"
                    onClick={() => navigate(`/run?campaignId=${campaign.id}`)}
                  >
                    ▶ Run
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="empty">
              <div className="empty-icon">📋</div>
              <div className="empty-title">No campaigns yet</div>
              <div>Create your first campaign above</div>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={modalOpen}
        title={editingCampaign ? "Edit Campaign" : "New Campaign"}
        maxWidth={660}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button className="btn btn-ghost" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="campaign-form" disabled={saving}>
              {saving ? "Saving…" : "Save Campaign"}
            </button>
          </>
        }
      >
        <form id="campaign-form" onSubmit={handleSave}>
          <div className="form-group">
            <label htmlFor="campaign-name">Campaign Name *</label>
            <input
              id="campaign-name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="e.g. Q1 Outreach"
              required
            />
          </div>

          <div className="form-group">
            <label>Audio / Message</label>
            <div className="radio-group mb-12">
              {[
                { value: "none", label: "No Audio" },
                { value: "upload", label: "Upload Audio" },
                { value: "tts", label: "TTS Text" },
              ].map((option) => (
                <label key={option.value}>
                  <input
                    type="radio"
                    name="campaign-audio-type"
                    value={option.value}
                    checked={form.audioType === option.value}
                    onChange={() =>
                      setForm((current) => ({ ...current, audioType: option.value as CampaignFormState["audioType"] }))
                    }
                  />
                  {option.label}
                </label>
              ))}
            </div>

            {form.audioType === "upload" ? (
              <div className="stack-12">
                <div className="form-group">
                  <label htmlFor="campaign-audio-file">Audio File</label>
                  <select
                    id="campaign-audio-file"
                    value={form.audioFile}
                    onChange={(event) => setForm((current) => ({ ...current, audioFile: event.target.value }))}
                  >
                    <option value="">-- No audio --</option>
                    {audioFiles.map((file) => (
                      <option key={file.name} value={file.name}>
                        {file.name}
                      </option>
                    ))}
                  </select>
                </div>

                <label className={`dropzone${uploadingAudio ? " drag" : ""}`}>
                  <input type="file" accept=".wav,.mp3,.gsm,.ulaw,.alaw,.ogg" onChange={handleAudioUpload} />
                  <div className="dropzone-icon">🎵</div>
                  <div>{uploadingAudio ? "Uploading audio…" : "Upload new audio file"}</div>
                  <div className="dropzone-hint">WAV, MP3, GSM, ULAW, OGG</div>
                </label>

                <AudioPreview fileName={form.audioFile} />
              </div>
            ) : null}

            {form.audioType === "tts" ? (
              <div className="stack-12">
                <div className="form-group">
                  <label htmlFor="campaign-tts">TTS Text</label>
                  <textarea
                    id="campaign-tts"
                    value={form.ttsText}
                    onChange={(event) => setForm((current) => ({ ...current, ttsText: event.target.value }))}
                    placeholder="Enter the text to be spoken to the caller…"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="campaign-tts-language">Language / Voice</label>
                  <select
                    id="campaign-tts-language"
                    value={form.ttsLanguage}
                    onChange={(event) => setForm((current) => ({ ...current, ttsLanguage: event.target.value }))}
                  >
                    {TTS_LANGUAGE_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="campaign-tts-voice-type">Voice Preset</label>
                  <select
                    id="campaign-tts-voice-type"
                    value={form.ttsVoiceType}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        ttsVoiceType: event.target.value === "male" ? "male" : "female",
                      }))
                    }
                  >
                    {TTS_VOICE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div className="form-hint">
                    Male and female are preset accent/timbre mappings built with gTTS language + TLD combinations, not separate voice models.
                  </div>
                </div>

                <div className="flex-center">
                  <TtsPreviewButton text={form.ttsText} language={form.ttsLanguage} />
                </div>
              </div>
            ) : null}
          </div>

          <div className="form-group">
            <label htmlFor="campaign-dtmf">DTMF Keys to Capture</label>
            <select
              id="campaign-dtmf"
              value={form.dtmfDigits}
              onChange={(event) =>
                setForm((current) => ({ ...current, dtmfDigits: Number.parseInt(event.target.value, 10) || 0 }))
              }
            >
              <option value={0}>0 — No DTMF capture</option>
              <option value={1}>1 — Single digit (0–9, *, #)</option>
              <option value={2}>2 — Two digits</option>
              <option value={3}>3 — Three digits</option>
              <option value={4}>4 — Four digits</option>
            </select>
            <div className="form-hint">How many keypad digits to wait for after audio plays.</div>
          </div>

          <div className="form-row-3">
            <div className="form-group">
              <label htmlFor="campaign-concurrent">Concurrent Calls</label>
              <input
                id="campaign-concurrent"
                type="number"
                min={1}
                max={100}
                value={form.concurrentCalls}
                onChange={(event) =>
                  setForm((current) => ({ ...current, concurrentCalls: Number.parseInt(event.target.value, 10) || 1 }))
                }
              />
            </div>
            <div className="form-group">
              <label htmlFor="campaign-retry">Retry Attempts</label>
              <input
                id="campaign-retry"
                type="number"
                min={0}
                max={10}
                value={form.retryAttempts}
                onChange={(event) =>
                  setForm((current) => ({ ...current, retryAttempts: Number.parseInt(event.target.value, 10) || 0 }))
                }
              />
              <div className="form-hint">0 = no retry</div>
            </div>
            <div className="form-group">
              <label htmlFor="campaign-timeout">Ring Timeout (sec)</label>
              <input
                id="campaign-timeout"
                type="number"
                min={10}
                max={300}
                value={form.callTimeout}
                onChange={(event) =>
                  setForm((current) => ({ ...current, callTimeout: Number.parseInt(event.target.value, 10) || 30 }))
                }
              />
            </div>
          </div>

          <div className="form-callout">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.transferOnDtmf}
                onChange={(event) =>
                  setForm((current) => ({ ...current, transferOnDtmf: event.target.checked }))
                }
              />
              <span>Transfer call to agent on DTMF press</span>
            </label>
            <div className="form-hint">
              When a contact presses any key, bridge the call to your SIP account or queue instead of hanging up.
            </div>

            {form.transferOnDtmf ? (
              <div className="form-group form-group--tight">
                <label htmlFor="campaign-transfer-destination">Transfer to Agent</label>
                <select
                  id="campaign-transfer-destination"
                  value={form.transferDest}
                  onChange={(event) => setForm((current) => ({ ...current, transferDest: event.target.value }))}
                >
                  <option value="">-- Select destination --</option>
                  <option value={transferQueueName}>
                    Agent Queue — {transferQueueName} (ring available agents)
                  </option>
                  {agents.length ? (
                    <optgroup label="Individual Agent">
                      {agents.map((agent) => (
                        <option key={agent.id} value={`SIP/${agent.username}`}>
                          {agent.name} (SIP/{agent.username})
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </div>
            ) : null}
          </div>
        </form>
      </Modal>
    </section>
  );
}
