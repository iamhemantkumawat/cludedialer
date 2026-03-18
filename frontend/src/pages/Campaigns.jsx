import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createCampaign,
  deleteCampaign,
  generateTTS,
  getAudioFiles,
  getCampaigns,
  uploadAudio,
} from '../api';
import StatusBadge from '../components/StatusBadge';
import socket from '../socket';

/* ── Voice options ─────────────────────────────────────────────────────────── */
const VOICES = [
  { value: 'en',    label: '🇺🇸 English (US) Female' },
  { value: 'en-gb', label: '🇬🇧 English (UK) Female' },
  { value: 'hi',    label: '🇮🇳 Hindi Female' },
  { value: 'es',    label: '🇪🇸 Spanish Female' },
  { value: 'fr',    label: '🇫🇷 French Female' },
  { value: 'ar',    label: '🇸🇦 Arabic Female' },
  { value: 'pt',    label: '🇧🇷 Portuguese Female' },
  { value: 'de',    label: '🇩🇪 German Female' },
];

/* ── Toggle ──────────────────────────────────────────────────────────────── */
function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        checked ? 'bg-red-600' : 'bg-gray-200'
      }`}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`} />
    </button>
  );
}

/* ── Create / Edit Campaign Modal ───────────────────────────────────────── */
function CampaignModal({ open, onClose, onSaved, editData = null }) {
  const isEdit = !!editData;

  const blank = {
    name: '',
    tts_text: '',
    tts_lang: 'en',
    dtmf_digits: 1,
    dtmf_enabled: true,
    concurrent_calls: 5,
    max_duration: 60,
    retry_attempts: 3,
    retry_delay: 300,
  };

  const [form,         setForm]         = useState(blank);
  const [voiceSource,  setVoiceSource]  = useState('tts');   // 'tts' | 'upload'
  const [audioFile,    setAudioFile]    = useState(null);
  const [selectedAudio,setSelectedAudio]= useState(null);    // { fileId, asteriskPath }
  const [ttsPreviewUrl,setTtsPreviewUrl]= useState('');
  const [loading,      setLoading]      = useState(false);
  const [ttsLoading,   setTtsLoading]   = useState(false);
  const [uploadLoading,setUploadLoading]= useState(false);
  const [error,        setError]        = useState('');

  /* seed form when editing */
  useEffect(() => {
    if (!open) return;
    getAudioFiles().catch(() => {});

    if (isEdit && editData) {
      setForm({
        name:            editData.name            || '',
        tts_text:        editData.tts_text         || '',
        tts_lang:        editData.tts_lang         || 'en',
        dtmf_digits:     editData.dtmf_digits      ?? 1,
        dtmf_enabled:    editData.dtmf_enabled     ?? true,
        concurrent_calls:editData.concurrent_calls ?? 5,
        max_duration:    editData.max_duration     ?? 60,
        retry_attempts:  editData.retry_attempts   ?? 3,
        retry_delay:     editData.retry_delay      ?? 300,
      });
      setVoiceSource(editData.audio_type === 'upload' ? 'upload' : 'tts');
      const af = editData.audio_asset_id || editData.audio_file;
      if (af) setSelectedAudio({ fileId: af, asteriskPath: af });
    } else {
      setForm(blank);
      setVoiceSource('tts');
      setAudioFile(null);
      setSelectedAudio(null);
      setTtsPreviewUrl('');
      setError('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleGenerateTtsPreview = async () => {
    if (!form.tts_text.trim()) return;
    setTtsLoading(true);
    setError('');
    try {
      const result = await generateTTS({ text: form.tts_text, lang: form.tts_lang });
      setSelectedAudio({ fileId: result.fileId, asteriskPath: result.asteriskPath });
      setTtsPreviewUrl(`/api/audio/${result.fileId}/play`);
    } catch (e) {
      setError(`TTS failed: ${e.response?.data?.error || e.message}`);
    } finally {
      setTtsLoading(false);
    }
  };

  const handleUploadAudio = async () => {
    if (!audioFile) return;
    setUploadLoading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('audio', audioFile);
      const result = await uploadAudio(fd);
      setSelectedAudio({ fileId: result.fileId, asteriskPath: result.asteriskPath });
      setAudioFile(null);
    } catch (e) {
      setError(`Upload failed: ${e.response?.data?.error || e.message}`);
    } finally {
      setUploadLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (voiceSource === 'tts' && !form.tts_text.trim()) return setError('Enter a TTS message');
    if (voiceSource === 'upload' && !selectedAudio) return setError('Upload an audio file first');

    setLoading(true);

    // Auto-generate TTS if user didn't press "Generate Preview"
    let audio = selectedAudio;
    if (voiceSource === 'tts' && !audio) {
      try {
        setTtsLoading(true);
        const result = await generateTTS({ text: form.tts_text, lang: form.tts_lang });
        audio = { fileId: result.fileId, asteriskPath: result.asteriskPath };
        setSelectedAudio(audio);
        setTtsPreviewUrl(`/api/audio/${result.fileId}/play`);
      } catch (e) {
        setLoading(false);
        setTtsLoading(false);
        return setError(`TTS generation failed: ${e.response?.data?.error || e.message}`);
      } finally {
        setTtsLoading(false);
      }
    }

    try {
      const payload = {
        ...form,
        audio_file:  audio?.fileId || '',
        audio_type:  voiceSource,
        numbers:     [],   // contacts come from Contact Lists at run time
      };
      const result = await createCampaign(payload);
      onSaved(result.id);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      {/* modal box */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edit Campaign' : 'Create New Campaign'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* body */}
        <form onSubmit={handleSubmit} className="px-6 pb-6 pt-5 space-y-5">

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          {/* Campaign Name */}
          <div>
            <label className="label">Campaign Name</label>
            <input
              className="input"
              placeholder="Enter campaign name"
              required
              value={form.name}
              onChange={e => set('name', e.target.value)}
            />
          </div>

          {/* Voice Source tabs */}
          <div>
            <label className="label">Voice Source</label>
            <div className="flex rounded-xl border border-gray-200 overflow-hidden">
              {[
                { key: 'tts',    label: 'TTS' },
                { key: 'upload', label: 'Upload Audio' },
              ].map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => { setVoiceSource(tab.key); setSelectedAudio(null); setTtsPreviewUrl(''); }}
                  className={`flex-1 py-2.5 text-sm font-medium transition ${
                    voiceSource === tab.key
                      ? 'bg-gray-900 text-white'
                      : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* TTS panel */}
          {voiceSource === 'tts' && (
            <div className="space-y-3">
              <div>
                <label className="label">TTS Message</label>
                <textarea
                  rows={3}
                  className="input resize-none"
                  placeholder="Type what should be spoken in the call..."
                  value={form.tts_text}
                  onChange={e => set('tts_text', e.target.value)}
                />
              </div>

              <div>
                <label className="label">Voice (Accent + Style)</label>
                <select className="input" value={form.tts_lang} onChange={e => set('tts_lang', e.target.value)}>
                  {VOICES.map(v => (
                    <option key={v.value} value={v.value}>{v.label}</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                disabled={!form.tts_text.trim() || ttsLoading}
                onClick={handleGenerateTtsPreview}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40 transition"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                </svg>
                {ttsLoading ? 'Generating…' : 'Generate TTS Preview'}
              </button>

              {ttsPreviewUrl && (
                <audio controls src={ttsPreviewUrl} className="w-full h-9" />
              )}
            </div>
          )}

          {/* Upload panel */}
          {voiceSource === 'upload' && (
            <div className="space-y-3">
              <div>
                <label className="label">Audio File (WAV, MP3, GSM, OGG)</label>
                <input
                  type="file"
                  accept=".wav,.mp3,.gsm,.ogg"
                  className="input text-gray-500"
                  onChange={e => setAudioFile(e.target.files?.[0] || null)}
                />
              </div>
              <button
                type="button"
                disabled={!audioFile || uploadLoading}
                onClick={handleUploadAudio}
                className="btn-primary text-sm"
              >
                {uploadLoading ? 'Uploading…' : 'Upload Audio'}
              </button>
            </div>
          )}

          {selectedAudio && (
            <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Audio ready: <span className="font-medium truncate">{selectedAudio.fileId}</span>
            </div>
          )}

          {/* Concurrency + Duration + Retry */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Concurrency (1-10)</label>
              <input type="number" min="1" max="10" className="input" value={form.concurrent_calls}
                onChange={e => set('concurrent_calls', Number(e.target.value))} />
              <p className="text-[10px] text-gray-400 mt-1">Default is 5. Max allowed is 10.</p>
            </div>
            <div>
              <label className="label">Max Duration (s)</label>
              <input type="number" min="10" max="600" className="input" value={form.max_duration}
                onChange={e => set('max_duration', Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Retry Attempts</label>
              <input type="number" min="0" max="10" className="input" value={form.retry_attempts}
                onChange={e => set('retry_attempts', Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Retry Delay (s)</label>
              <input type="number" min="0" max="3600" className="input" value={form.retry_delay}
                onChange={e => set('retry_delay', Number(e.target.value))} />
            </div>
          </div>

          {/* DTMF */}
          <div className="rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-800">Enable DTMF Detection</div>
                <div className="text-xs text-gray-500 mt-0.5">Detect keypad presses from recipients</div>
              </div>
              <Toggle checked={form.dtmf_enabled} onChange={v => set('dtmf_enabled', v)} />
            </div>

            {form.dtmf_enabled && (
              <div>
                <label className="label">Digits To Capture</label>
                <input
                  type="number"
                  min="1"
                  max="6"
                  className="input"
                  value={form.dtmf_digits}
                  onChange={e => set('dtmf_digits', Number(e.target.value))}
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Use <code className="font-mono">1</code> for single key, or set <code className="font-mono">3</code>–<code className="font-mono">6</code> to capture OTP-style multi-digit input.
                </p>
              </div>
            )}
          </div>

          {/* footer buttons */}
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={
                loading || !form.name.trim() ||
                (voiceSource === 'tts' && !form.tts_text.trim()) ||
                (voiceSource === 'upload' && !selectedAudio)
              }
              className="btn-primary flex-1"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {isEdit ? 'Saving…' : 'Creating…'}
                </span>
              ) : ttsLoading ? 'Generating TTS…' : isEdit ? 'Save Changes' : 'Create Campaign'}
            </button>
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main Campaigns page ────────────────────────────────────────────────── */
export default function Campaigns() {
  const [campaigns,   setCampaigns]  = useState([]);
  const [loading,     setLoading]    = useState(true);
  const [modalOpen,   setModalOpen]  = useState(false);
  const [editTarget,  setEditTarget] = useState(null);   // campaign object or null
  const [busyDelete,  setBusyDelete] = useState('');

  const load = () =>
    getCampaigns()
      .then(data => setCampaigns(data || []))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    const reload = () => load();
    socket.on('campaign:update', reload);
    socket.on('campaign:stats',  reload);
    return () => {
      socket.off('campaign:update', reload);
      socket.off('campaign:stats',  reload);
    };
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this campaign and all its results?')) return;
    setBusyDelete(id);
    try {
      await deleteCampaign(id);
      await load();
    } finally {
      setBusyDelete('');
    }
  };

  const handleSaved = async () => {
    setModalOpen(false);
    setEditTarget(null);
    await load();
  };

  const openCreate = () => { setEditTarget(null); setModalOpen(true); };
  const openEdit   = (c)  => { setEditTarget(c);   setModalOpen(true); };

  const activeCampaigns = campaigns.filter(c => c.status === 'running').length;
  const totalCalls      = campaigns.reduce((s, c) => s + Number(c.dialed        || 0), 0);
  const dtmfResponses   = campaigns.reduce((s, c) => s + Number(c.dtmf_responses || 0), 0);

  return (
    <div className="p-6 space-y-5">

      <CampaignModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditTarget(null); }}
        onSaved={handleSaved}
        editData={editTarget}
      />

      {/* page header */}
      <div className="page-header items-start gap-4">
        <div>
          <h1 className="page-title">Campaigns</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your autodialer campaigns</p>
        </div>
        <button onClick={openCreate} className="btn-primary shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Create Campaign
        </button>
      </div>

      {/* stat cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="stat-card">
          <div className="stat-icon bg-green-50 text-green-600">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </div>
          <div>
            <div className="text-sm text-gray-500">Active Campaigns</div>
            <div className="text-3xl font-bold text-gray-800">{activeCampaigns}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon bg-blue-50 text-blue-600">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.72a16 16 0 0 0 6.29 6.29l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </div>
          <div>
            <div className="text-sm text-gray-500">Total Calls</div>
            <div className="text-3xl font-bold text-gray-800">{totalCalls}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon bg-purple-50 text-purple-600">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
              <line x1="12" y1="18" x2="12.01" y2="18"/>
            </svg>
          </div>
          <div>
            <div className="text-sm text-gray-500">DTMF Responses</div>
            <div className="text-3xl font-bold text-gray-800">{dtmfResponses}</div>
          </div>
        </div>
      </div>

      {/* campaigns table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-black/[0.07]">
          <h2 className="text-base font-semibold text-gray-800">All Campaigns</h2>
          <p className="text-sm text-gray-500 mt-0.5">{campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''} available</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="border-b border-black/[0.07]">
                <th className="table-header pl-5">Campaign Name</th>
                <th className="table-header">Caller ID</th>
                <th className="table-header">SIP Account</th>
                <th className="table-header">Audio</th>
                <th className="table-header text-center">Total Calls</th>
                <th className="table-header text-center">DTMF</th>
                <th className="table-header pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-gray-400">
                    <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    Loading campaigns...
                  </td>
                </tr>
              ) : campaigns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3 text-2xl">📭</div>
                    <div className="text-gray-700 font-semibold mb-1">No campaigns yet</div>
                    <div className="text-sm text-gray-400">Click "+ Create Campaign" to get started.</div>
                  </td>
                </tr>
              ) : (
                campaigns.map(campaign => {
                  const audioId = campaign.audio_file || campaign.audio_asset_id || '';
                  const previewUrl = audioId ? `/api/audio/${audioId}/play` : '';
                  const audioLabel = campaign.audio_type === 'tts'
                    ? (campaign.tts_text ? campaign.tts_text.slice(0, 40) + (campaign.tts_text.length > 40 ? '…' : '') : 'Generated TTS')
                    : (campaign.audio_filename || 'Uploaded audio');

                  return (
                    <tr key={campaign.id} className="table-row align-top">
                      <td className="table-cell pl-5">
                        <Link
                          to={`/campaigns/${campaign.id}`}
                          className="font-semibold text-gray-800 hover:text-red-600 transition"
                        >
                          {campaign.name}
                        </Link>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {new Date(campaign.created_at).toLocaleDateString()} · {campaign.concurrent_calls} concurrent
                        </div>
                      </td>

                      <td className="table-cell">
                        <span className="text-sm text-gray-700">{campaign.caller_id || campaign.sip_username || '—'}</span>
                      </td>

                      <td className="table-cell">
                        <div className="text-sm text-gray-700">{campaign.sip_username || '—'}</div>
                        <div className="text-xs text-gray-400">{campaign.sip_domain || ''}</div>
                      </td>

                      <td className="table-cell max-w-[260px]">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                              campaign.audio_type === 'tts' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
                            }`}>
                              {campaign.audio_type === 'tts' ? 'TTS' : 'Upload'}
                            </span>
                            <span className="text-xs text-gray-500 truncate">{audioLabel}</span>
                          </div>
                          {previewUrl ? (
                            <audio controls preload="none" className="h-9 w-full max-w-[240px]">
                              <source src={previewUrl} />
                            </audio>
                          ) : (
                            <span className="text-xs text-gray-300">No preview</span>
                          )}
                        </div>
                      </td>

                      <td className="table-cell text-center font-semibold text-gray-700">{campaign.dialed ?? 0}</td>
                      <td className="table-cell text-center font-semibold text-gray-700">{campaign.dtmf_responses ?? 0}</td>

                      <td className="table-cell pr-5">
                        <div className="flex items-center justify-end gap-2">
                          {/* Edit */}
                          <button
                            onClick={() => openEdit(campaign)}
                            title="Edit campaign"
                            className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 flex items-center justify-center text-gray-500 hover:text-blue-600 transition"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleDelete(campaign.id)}
                            disabled={busyDelete === campaign.id}
                            title="Delete campaign"
                            className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-red-50 border border-gray-200 hover:border-red-200 flex items-center justify-center text-gray-500 hover:text-red-500 transition"
                          >
                            {busyDelete === campaign.id ? (
                              <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                <path d="M10 11v6"/><path d="M14 11v6"/>
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                              </svg>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
