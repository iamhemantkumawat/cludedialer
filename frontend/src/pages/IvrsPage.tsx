import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { jsonRequest, requestJson } from "../app/api";
import { useDialer } from "../app/context";
import type { Campaign, IvrDefinition, IvrFormState, IvrNode, IvrRoute } from "../app/types";
import {
  IVR_ACTION_OPTIONS,
  IVR_DIGIT_KEYS,
  TTS_LANGUAGE_GROUPS,
  TTS_VOICE_TYPE_OPTIONS,
  createDefaultIvrNode,
  ivrNodePromptLabel,
  parseIvrDefinition,
} from "../app/utils";
import { AudioPreview } from "../components/AudioPreview";
import { Modal } from "../components/Modal";
import { TtsPreviewButton } from "../components/TtsPreviewButton";

const KEY_LABEL: Record<string, string> = {
  "1": "1", "2": "2", "3": "3", "4": "4", "5": "5",
  "6": "6", "7": "7", "8": "8", "9": "9", "0": "0",
  default: "★",
};

function makeNode(index: number): IvrNode {
  const base = createDefaultIvrNode(index);
  return { ...base, id: `menu_${crypto.randomUUID().slice(0, 8)}`, name: `Menu ${index + 1}` };
}

function makeDefaultForm(defaultSipId = ""): IvrFormState {
  const firstNode = makeNode(0);
  return {
    name: "",
    sip_account_id: defaultSipId,
    concurrent_calls: 2,
    call_timeout: 30,
    retry_attempts: 0,
    ivr_definition: { root_node_id: firstNode.id, nodes: [firstNode] },
  };
}

export function IvrsPage() {
  const navigate = useNavigate();
  const { ivrs, audioFiles, sipAccounts, agents, queueName, refreshIvrs, refreshAudioFiles, refreshSipAccounts, refreshAgentsData, notify } = useDialer();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIvr, setEditingIvr] = useState<Campaign | null>(null);
  const [form, setForm] = useState<IvrFormState>(() => makeDefaultForm());
  const [saving, setSaving] = useState(false);
  const [uploadingNodeId, setUploadingNodeId] = useState("");

  useEffect(() => { void Promise.allSettled([refreshIvrs(), refreshAudioFiles(), refreshSipAccounts(), refreshAgentsData()]); }, []);

  function openModal(ivr?: Campaign) {
    setEditingIvr(ivr || null);
    if (ivr) {
      setForm({
        name: ivr.name,
        sip_account_id: ivr.sip_account_id || "",
        concurrent_calls: Number(ivr.concurrent_calls) || 2,
        call_timeout: Number(ivr.call_timeout) || 30,
        retry_attempts: Number(ivr.retry_attempts) || 0,
        ivr_definition: parseIvrDefinition(ivr.ivr_definition),
      });
    } else {
      setForm(makeDefaultForm(sipAccounts[0]?.id || ""));
    }
    setModalOpen(true);
    void Promise.allSettled([refreshAudioFiles(), refreshSipAccounts(), refreshAgentsData()]);
  }

  function setDefinition(updater: (d: IvrDefinition) => IvrDefinition) {
    setForm((c) => ({ ...c, ivr_definition: updater(c.ivr_definition) }));
  }

  function updateNode(nodeId: string, updater: (n: IvrNode) => IvrNode) {
    setDefinition((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === nodeId ? updater(n) : n)) }));
  }

  function updateRoute(nodeId: string, key: string, updater: (r: IvrRoute) => IvrRoute) {
    updateNode(nodeId, (n) => ({ ...n, routes: { ...n.routes, [key]: updater(n.routes[key]) } }));
  }

  function addNode() {
    setDefinition((d) => {
      const next = makeNode(d.nodes.length);
      return { ...d, nodes: [...d.nodes, next] };
    });
  }

  function removeNode(nodeId: string) {
    setDefinition((d) => {
      if (d.nodes.length <= 1) return d;
      const next = d.nodes.filter((n) => n.id !== nodeId);
      const nextRoot = d.root_node_id === nodeId ? next[0].id : d.root_node_id;
      return {
        root_node_id: nextRoot,
        nodes: next.map((n) => ({
          ...n,
          routes: Object.fromEntries(
            IVR_DIGIT_KEYS.map((k) => {
              const r = n.routes[k];
              return [k, r.type === "node" && r.target === nodeId ? { type: "none", target: "" } : r];
            }),
          ),
        })),
      };
    });
  }

  async function handleSave(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!form.name.trim()) { notify("IVR name is required", "error"); return; }
    if (!form.sip_account_id) { notify("Select a SIP account", "error"); return; }
    setSaving(true);
    try {
      await jsonRequest(
        editingIvr ? `/api/ivrs/${editingIvr.id}` : "/api/ivrs",
        editingIvr ? "PUT" : "POST",
        { name: form.name.trim(), sip_account_id: form.sip_account_id, concurrent_calls: form.concurrent_calls, call_timeout: form.call_timeout, retry_attempts: form.retry_attempts, ivr_definition: form.ivr_definition },
      );
      await refreshIvrs();
      notify(editingIvr ? "IVR updated" : "IVR created", "success");
      setModalOpen(false);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to save IVR", "error");
    } finally { setSaving(false); }
  }

  async function handleDelete(ivr: Campaign) {
    if (!window.confirm(`Delete IVR "${ivr.name}"?`)) return;
    try {
      await jsonRequest(`/api/ivrs/${ivr.id}`, "DELETE");
      await refreshIvrs();
      notify("IVR deleted", "success");
    } catch (err) { notify(err instanceof Error ? err.message : "Failed to delete IVR", "error"); }
  }

  async function handleAudioUpload(nodeId: string, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingNodeId(nodeId);
    try {
      const fd = new FormData();
      fd.append("audio", file);
      const resp = await requestJson<{ filename: string }>("/api/audio/upload", { method: "POST", body: fd });
      await refreshAudioFiles();
      updateNode(nodeId, (n) => ({ ...n, audio_type: "upload", audio_file: resp.filename }));
      notify("Audio uploaded", "success");
    } catch (err) { notify(err instanceof Error ? err.message : "Upload failed", "error"); }
    finally { setUploadingNodeId(""); e.target.value = ""; }
  }

  const nodeOptions = useMemo(
    () => form.ivr_definition.nodes.map((n) => ({ value: n.id, label: n.name || n.id })),
    [form.ivr_definition.nodes],
  );

  return (
    <section className="section active">
      <div className="page-header">
        <div>
          <div className="page-title">IVR Flows</div>
          <div className="contacts-page-subtitle">Build interactive voice menus — play prompts, capture key presses, transfer to agents or queue.</div>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => openModal()}>+ New IVR</button>
      </div>

      <div className="page-body">
        <div className="campaign-cards">
          {ivrs.length ? ivrs.map((ivr) => {
            const def = parseIvrDefinition(ivr.ivr_definition);
            const root = def.nodes.find((n) => n.id === def.root_node_id) || def.nodes[0];
            const configuredKeys = root ? IVR_DIGIT_KEYS.filter((k) => root.routes[k]?.type !== "none") : [];
            return (
              <article className="camp-card" key={ivr.id}>
                <div className="camp-card__header">
                  <div>
                    <div className="camp-card-name">{ivr.name}</div>
                    <div className="c-dim" style={{ fontSize: 12, marginTop: 2 }}>
                      {def.nodes.length} menu{def.nodes.length !== 1 ? "s" : ""} · starts at {root?.name || "Menu 1"}
                    </div>
                  </div>
                  <span className={`badge badge-${ivr.status}`}>{ivr.status}</span>
                </div>

                <div className="camp-card-meta">
                  <span className="meta-chip">🔊 {root ? ivrNodePromptLabel(root) : "No prompt"}</span>
                  <span className="meta-chip">⚡ {ivr.concurrent_calls} concurrent</span>
                  <span className="meta-chip">⏱ {ivr.call_timeout}s timeout</span>
                  {configuredKeys.length > 0 && (
                    <span className="meta-chip">🎹 Keys: {configuredKeys.map((k) => k === "default" ? "★" : k).join(", ")}</span>
                  )}
                </div>

                <div className="camp-card__actions">
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => openModal(ivr)}>Edit</button>
                  <button className="btn btn-danger btn-sm" type="button" onClick={() => void handleDelete(ivr)}>Delete</button>
                  <button className="btn btn-blue btn-sm camp-card__run" type="button" onClick={() => navigate(`/run?flowId=${ivr.id}`)}>▶ Run</button>
                </div>
              </article>
            );
          }) : (
            <div className="empty">
              <div className="empty-icon">📞</div>
              <div className="empty-title">No IVRs yet</div>
              <div>Create an IVR to guide callers with menus and key presses.</div>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={modalOpen}
        title={editingIvr ? `Edit IVR — ${editingIvr.name}` : "Create IVR"}
        maxWidth={780}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button className="btn btn-ghost" type="button" onClick={() => setModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" type="submit" form="ivr-form" disabled={saving}>{saving ? "Saving…" : "Save IVR"}</button>
          </>
        }
      >
        <form id="ivr-form" onSubmit={handleSave}>
          {/* ── Basic settings ── */}
          <div className="ivr-settings-bar">
            <div className="form-group ivr-settings-bar__name">
              <label htmlFor="ivr-name">IVR Name *</label>
              <input id="ivr-name" value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} placeholder="e.g. Language Selection" required />
            </div>
            <div className="form-group">
              <label htmlFor="ivr-sip">SIP Account *</label>
              <select id="ivr-sip" value={form.sip_account_id} onChange={(e) => setForm((c) => ({ ...c, sip_account_id: e.target.value }))} required>
                <option value="">-- choose --</option>
                {sipAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.domain}</option>)}
              </select>
            </div>
          </div>

          <div className="ivr-settings-bar ivr-settings-bar--sm">
            <div className="form-group">
              <label htmlFor="ivr-concurrent">Concurrent Calls</label>
              <input id="ivr-concurrent" type="number" min={1} max={50} value={form.concurrent_calls} onChange={(e) => setForm((c) => ({ ...c, concurrent_calls: Number(e.target.value) || 1 }))} />
            </div>
            <div className="form-group">
              <label htmlFor="ivr-timeout">Call Timeout (s)</label>
              <input id="ivr-timeout" type="number" min={10} max={180} value={form.call_timeout} onChange={(e) => setForm((c) => ({ ...c, call_timeout: Number(e.target.value) || 30 }))} />
            </div>
            <div className="form-group">
              <label htmlFor="ivr-retries">Retries</label>
              <input id="ivr-retries" type="number" min={0} max={10} value={form.retry_attempts} onChange={(e) => setForm((c) => ({ ...c, retry_attempts: Number(e.target.value) || 0 }))} />
            </div>
          </div>

          <div className="ivr-divider" />

          {/* ── Menu nodes ── */}
          <div className="stack-12">
            {form.ivr_definition.nodes.map((node, index) => {
              const isRoot = form.ivr_definition.root_node_id === node.id;
              return (
                <div className={`ivr-node${isRoot ? " ivr-node--root" : ""}`} key={node.id}>
                  {/* Node header */}
                  <div className="ivr-node__head">
                    <div className="ivr-node__head-left">
                      <span className="ivr-step-badge">{isRoot ? "START" : `${index + 1}`}</span>
                      <input
                        className="ivr-node-name-input"
                        value={node.name}
                        onChange={(e) => updateNode(node.id, (n) => ({ ...n, name: e.target.value }))}
                        placeholder={`Menu ${index + 1}`}
                      />
                    </div>
                    <div className="ivr-node__head-right">
                      {!isRoot && (
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => setDefinition((d) => ({ ...d, root_node_id: node.id }))}>
                          Set as Start
                        </button>
                      )}
                      <button className="btn btn-danger btn-sm" type="button" disabled={form.ivr_definition.nodes.length <= 1} onClick={() => removeNode(node.id)}>
                        Remove
                      </button>
                    </div>
                  </div>

                  {/* Audio / prompt */}
                  <div className="ivr-node__body">
                    <div className="ivr-section-label">Prompt Audio</div>

                    <div className="radio-group mb-12">
                      {[{ value: "none", label: "No Prompt" }, { value: "upload", label: "Upload Audio" }, { value: "tts", label: "TTS Text" }].map((opt) => (
                        <label key={opt.value}>
                          <input type="radio" name={`audio-type-${node.id}`} value={opt.value} checked={node.audio_type === opt.value}
                            onChange={() => updateNode(node.id, (n) => ({ ...n, audio_type: opt.value as IvrNode["audio_type"] }))} />
                          {opt.label}
                        </label>
                      ))}
                    </div>

                    {node.audio_type === "upload" && (
                      <div className="stack-8">
                        <select value={node.audio_file} onChange={(e) => updateNode(node.id, (n) => ({ ...n, audio_file: e.target.value }))}>
                          <option value="">-- choose file --</option>
                          {audioFiles.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
                        </select>
                        <label className={`dropzone${uploadingNodeId === node.id ? " drag" : ""}`} style={{ padding: "12px 16px" }}>
                          <input type="file" accept=".wav,.mp3,.gsm,.ulaw,.alaw,.ogg" onChange={(e) => void handleAudioUpload(node.id, e)} />
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span>🎵</span>
                            <span>{uploadingNodeId === node.id ? "Uploading…" : "Upload new audio"}</span>
                            <span className="c-dim" style={{ fontSize: 11 }}>WAV / MP3 / GSM</span>
                          </div>
                        </label>
                        <AudioPreview fileName={node.audio_file} />
                      </div>
                    )}

                    {node.audio_type === "tts" && (
                      <div className="stack-8">
                        <textarea value={node.tts_text} onChange={(e) => updateNode(node.id, (n) => ({ ...n, tts_text: e.target.value }))}
                          placeholder="Press 1 for Hindi. Press 2 for English." rows={2} />
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <select value={node.tts_language} style={{ flex: 1, minWidth: 140 }}
                            onChange={(e) => updateNode(node.id, (n) => ({ ...n, tts_language: e.target.value }))}>
                            {TTS_LANGUAGE_GROUPS.map((g) => (
                              <optgroup key={g.label} label={g.label}>
                                {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </optgroup>
                            ))}
                          </select>
                          <select value={node.tts_voice_type} style={{ width: 140 }}
                            onChange={(e) => updateNode(node.id, (n) => ({ ...n, tts_voice_type: e.target.value === "male" ? "male" : "female" }))}>
                            {TTS_VOICE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <TtsPreviewButton text={node.tts_text} language={node.tts_language} />
                        </div>
                      </div>
                    )}

                    {/* Wait time */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                      <span className="c-dim" style={{ fontSize: 13 }}>Wait for key press:</span>
                      <input type="number" min={1} max={30} value={node.wait_seconds} style={{ width: 64 }}
                        onChange={(e) => updateNode(node.id, (n) => ({ ...n, wait_seconds: Math.max(1, Math.min(30, Number(e.target.value) || 1)) }))} />
                      <span className="c-dim" style={{ fontSize: 13 }}>seconds</span>
                    </div>

                    {/* ── DTMF key actions ── */}
                    <div className="ivr-dtmf-section">
                      <div className="ivr-section-label" style={{ marginBottom: 8 }}>
                        Key Actions
                        <span className="c-dim" style={{ fontWeight: 400, fontSize: 12, marginLeft: 8 }}>
                          — what happens when caller presses each key
                        </span>
                      </div>

                      <div className="ivr-key-table">
                        {IVR_DIGIT_KEYS.map((key) => {
                          const route = node.routes[key];
                          const active = route.type !== "none";
                          return (
                            <div className={`ivr-key-row${active ? " ivr-key-row--active" : ""}`} key={`${node.id}-${key}`}>
                              <span className={`ivr-key-badge${active ? " ivr-key-badge--active" : ""}`}>
                                {KEY_LABEL[key]}
                                {key === "default" && <span className="ivr-key-sublabel">default</span>}
                              </span>

                              <select
                                className="ivr-key-action-select"
                                value={route.type}
                                onChange={(e) => updateRoute(node.id, key, () => ({ type: e.target.value as IvrRoute["type"], target: "" }))}
                              >
                                {IVR_ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>

                              {route.type === "node" && (
                                <select className="ivr-key-target-select" value={route.target}
                                  onChange={(e) => updateRoute(node.id, key, (r) => ({ ...r, target: e.target.value }))}>
                                  <option value="">-- choose menu --</option>
                                  {nodeOptions.filter((o) => o.value !== node.id).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                              )}

                              {route.type === "agent" && (
                                <select className="ivr-key-target-select" value={route.target}
                                  onChange={(e) => updateRoute(node.id, key, (r) => ({ ...r, target: e.target.value }))}>
                                  <option value="">-- choose agent --</option>
                                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.username})</option>)}
                                </select>
                              )}

                              {route.type === "queue" && (
                                <span className="ivr-key-info">→ queue: {queueName || "agent-queue"}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <button className="btn btn-ghost" type="button" style={{ alignSelf: "flex-start" }} onClick={addNode}>
              + Add Menu Layer
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
