import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  createCampaign,
  deleteCampaign,
  generateTTS,
  getAudioFiles,
  getCampaigns,
  getSipAccounts,
  pauseCampaign,
  startCampaign,
  stopCampaign,
  uploadAudio,
} from '../api';
import StatusBadge from '../components/StatusBadge';
import socket from '../socket';

function CampaignComposer({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    sip_account_id: '',
    dtmf_digits: 1,
    concurrent_calls: 2,
  });
  const [audioMode, setAudioMode] = useState('upload');
  const [ttsText, setTtsText] = useState('');
  const [ttsLang, setTtsLang] = useState('en');
  const [audioFile, setAudioFile] = useState(null);
  const [selectedAudio, setSelectedAudio] = useState(null);
  const [numbersRaw, setNumbersRaw] = useState('');
  const [sipAccounts, setSipAccounts] = useState([]);
  const [audioFiles, setAudioFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ttsLoading, setTtsLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    getSipAccounts().then(setSipAccounts).catch(() => {});
    getAudioFiles().then(setAudioFiles).catch(() => {});
  }, [open]);

  const parseNumbers = (text) =>
    String(text || '')
      .split(/[\n,;]+/)
      .map((value) => value.replace(/[^+0-9]/g, '').trim())
      .filter((value) => value.length >= 5);

  const handleCsvFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      setNumbersRaw(parseNumbers(loadEvent.target?.result || '').join('\n'));
    };
    reader.readAsText(file);
  };

  const handleGenerateTts = async () => {
    if (!ttsText.trim()) {
      return;
    }

    setTtsLoading(true);
    setError('');

    try {
      const result = await generateTTS({ text: ttsText, lang: ttsLang });
      setSelectedAudio({ fileId: result.fileId, asteriskPath: result.asteriskPath });
      setAudioFiles((current) => [
        { filename: result.filename, fileId: result.fileId, asteriskPath: result.asteriskPath },
        ...current,
      ]);
    } catch (requestError) {
      setError(`TTS failed: ${requestError.response?.data?.error || requestError.message}`);
    } finally {
      setTtsLoading(false);
    }
  };

  const handleUploadAudio = async () => {
    if (!audioFile) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('audio', audioFile);
      const result = await uploadAudio(formData);
      setSelectedAudio({ fileId: result.fileId, asteriskPath: result.asteriskPath });
      setAudioFiles((current) => [
        { filename: result.filename, fileId: result.fileId, asteriskPath: result.asteriskPath },
        ...current,
      ]);
      setAudioFile(null);
    } catch (requestError) {
      setError(`Upload failed: ${requestError.response?.data?.error || requestError.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const numbers = parseNumbers(numbersRaw);
    if (numbers.length === 0) {
      setError('Add at least one phone number');
      return;
    }

    if (!form.sip_account_id) {
      setError('Select a SIP account');
      return;
    }

    if (!selectedAudio) {
      setError('Select or generate audio first');
      return;
    }

    setLoading(true);

    try {
      const result = await createCampaign({
        ...form,
        audio_file: selectedAudio.fileId,
        audio_type: audioMode,
        tts_text: ttsText,
        numbers,
      });

      setForm({
        name: '',
        sip_account_id: '',
        dtmf_digits: 1,
        concurrent_calls: 2,
      });
      setAudioMode('upload');
      setTtsText('');
      setTtsLang('en');
      setNumbersRaw('');
      setSelectedAudio(null);
      onCreated(result.id);
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return null;
  }

  const numbers = parseNumbers(numbersRaw);

  return (
    <div className="card space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#1A1B2E]">Create Campaign</h2>
          <p className="text-sm text-[#64748B] mt-1">Build a new campaign without leaving the campaign list.</p>
        </div>
        <button onClick={onClose} className="btn-ghost text-sm">Close</button>
      </div>

      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[1.05fr_1fr]">
          <div className="space-y-5">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#1A1B2E]">
                <span className="w-6 h-6 rounded-lg bg-red-50 text-red-600 flex items-center justify-center text-xs">1</span>
                Campaign Setup
              </div>

              <div>
                <label className="label">Campaign Name</label>
                <input
                  className="input"
                  placeholder="e.g. April Promotion Wave 1"
                  required
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
              </div>

              <div>
                <label className="label">SIP Account</label>
                <select
                  className="input"
                  required
                  value={form.sip_account_id}
                  onChange={(event) => setForm((current) => ({ ...current, sip_account_id: event.target.value }))}
                >
                  <option value="">-- Select SIP Account --</option>
                  {sipAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.username}@{account.domain})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Concurrent Calls</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    className="input"
                    value={form.concurrent_calls}
                    onChange={(event) => setForm((current) => ({ ...current, concurrent_calls: Number(event.target.value) }))}
                  />
                </div>
                <div>
                  <label className="label">DTMF Digits</label>
                  <input
                    type="number"
                    min="1"
                    max="4"
                    className="input"
                    value={form.dtmf_digits}
                    onChange={(event) => setForm((current) => ({ ...current, dtmf_digits: Number(event.target.value) }))}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#1A1B2E]">
                <span className="w-6 h-6 rounded-lg bg-red-50 text-red-600 flex items-center justify-center text-xs">2</span>
                Audio
              </div>

              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
                {[
                  { key: 'upload', label: 'Upload' },
                  { key: 'tts', label: 'TTS' },
                  { key: 'existing', label: 'Existing' },
                ].map((mode) => (
                  <button
                    key={mode.key}
                    type="button"
                    onClick={() => setAudioMode(mode.key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                      audioMode === mode.key ? 'bg-red-600 text-white shadow-sm' : 'text-[#64748B] hover:text-[#1A1B2E]'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              {audioMode === 'upload' && (
                <div className="space-y-3">
                  <input
                    type="file"
                    accept=".wav,.mp3,.gsm,.ogg"
                    className="input text-[#64748B]"
                    onChange={(event) => setAudioFile(event.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    disabled={!audioFile || loading}
                    onClick={handleUploadAudio}
                    className="btn-primary text-sm"
                  >
                    {loading ? 'Uploading...' : 'Upload Audio'}
                  </button>
                </div>
              )}

              {audioMode === 'tts' && (
                <div className="space-y-3">
                  <textarea
                    rows={4}
                    className="input resize-none"
                    placeholder="Hello! Press 1 to speak to an agent, press 2 to unsubscribe."
                    value={ttsText}
                    onChange={(event) => setTtsText(event.target.value)}
                  />
                  <div className="flex gap-2 items-center">
                    <select className="input max-w-[140px]" value={ttsLang} onChange={(event) => setTtsLang(event.target.value)}>
                      <option value="en">English</option>
                      <option value="hi">Hindi</option>
                      <option value="es">Spanish</option>
                      <option value="fr">French</option>
                      <option value="ar">Arabic</option>
                    </select>
                    <button
                      type="button"
                      disabled={!ttsText.trim() || ttsLoading}
                      onClick={handleGenerateTts}
                      className="btn-primary text-sm"
                    >
                      {ttsLoading ? 'Generating...' : 'Generate TTS'}
                    </button>
                  </div>
                </div>
              )}

              {audioMode === 'existing' && (
                <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                  {audioFiles.length === 0 ? (
                    <div className="text-sm text-[#64748B]">No audio files yet. Upload or generate one first.</div>
                  ) : (
                    audioFiles.map((file) => (
                      <label
                        key={file.fileId}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition ${
                          selectedAudio?.fileId === file.fileId
                            ? 'border-red-200 bg-red-50'
                            : 'border-gray-200 hover:border-red-200 hover:bg-red-50/50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="campaign-audio"
                          className="accent-red-600"
                          checked={selectedAudio?.fileId === file.fileId}
                          onChange={() => setSelectedAudio({ fileId: file.fileId, asteriskPath: file.asteriskPath })}
                        />
                        <span className="text-sm text-[#1A1B2E] flex-1 truncate">{file.filename}</span>
                        <span className="text-xs text-[#64748B]">{file.size ? `${Math.round(file.size / 1024)} KB` : ''}</span>
                      </label>
                    ))
                  )}
                </div>
              )}

              {selectedAudio && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                  Ready audio: <span className="font-medium">{selectedAudio.fileId}</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#1A1B2E]">
              <span className="w-6 h-6 rounded-lg bg-red-50 text-red-600 flex items-center justify-center text-xs">3</span>
              Numbers
            </div>

            <div>
              <label className="label">Upload CSV / TXT</label>
              <input type="file" accept=".csv,.txt" className="input text-[#64748B]" onChange={handleCsvFile} />
            </div>

            <div>
              <label className="label">Paste Numbers</label>
              <textarea
                rows={14}
                className="input resize-none font-mono text-xs"
                placeholder={'+919876543210\n+918800001234\n919988229920'}
                value={numbersRaw}
                onChange={(event) => setNumbersRaw(event.target.value)}
              />
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="text-xs uppercase tracking-wider text-[#64748B] mb-1">Detected Numbers</div>
              <div className="text-2xl font-bold text-[#1A1B2E]">{numbers.length}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={loading || !form.sip_account_id || numbers.length === 0 || !selectedAudio}
            className="btn-primary"
          >
            {loading ? 'Creating...' : 'Create Campaign'}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
        </div>
      </form>
    </div>
  );
}

export default function Campaigns({ initialCreateOpen = false }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(initialCreateOpen || location.pathname === '/new');
  const [busyAction, setBusyAction] = useState('');

  const load = () =>
    getCampaigns()
      .then((data) => setCampaigns(data || []))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();

    const reload = () => load();
    socket.on('campaign:update', reload);
    socket.on('campaign:stats', reload);

    return () => {
      socket.off('campaign:update', reload);
      socket.off('campaign:stats', reload);
    };
  }, []);

  useEffect(() => {
    if (location.pathname === '/new') {
      setCreateOpen(true);
    }
  }, [location.pathname]);

  const handleAction = async (action, id) => {
    const actions = { start: startCampaign, pause: pauseCampaign, stop: stopCampaign };
    setBusyAction(`${action}:${id}`);
    try {
      await actions[action](id);
      await load();
    } finally {
      setBusyAction('');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this campaign and all results?')) {
      return;
    }

    setBusyAction(`delete:${id}`);
    try {
      await deleteCampaign(id);
      await load();
    } finally {
      setBusyAction('');
    }
  };

  const handleCreated = async (campaignId) => {
    setCreateOpen(false);
    await load();
    navigate(`/campaigns/${campaignId}`);
  };

  const closeComposer = () => {
    if (location.pathname === '/new') {
      navigate('/campaigns');
      return;
    }

    setCreateOpen(false);
  };

  const openComposer = () => {
    setCreateOpen(true);
  };

  const activeCampaigns = campaigns.filter((campaign) => campaign.status === 'running').length;
  const totalCalls = campaigns.reduce((sum, campaign) => sum + Number(campaign.dialed || 0), 0);
  const dtmfResponses = campaigns.reduce((sum, campaign) => sum + Number(campaign.dtmf_responses || 0), 0);

  return (
    <div className="p-6 space-y-5">
      <div className="page-header items-start gap-4">
        <div>
          <h1 className="page-title">Campaigns</h1>
          <p className="text-sm text-[#64748B] mt-1">Manage all available campaigns and create new ones from one place.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link to="/run" className="btn-secondary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="9" />
              <polygon points="10 8 17 12 10 16 10 8" />
            </svg>
            Run Campaign
          </Link>
          <button onClick={openComposer} className="btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create Campaign
          </button>
        </div>
      </div>

      <CampaignComposer open={createOpen} onClose={closeComposer} onCreated={handleCreated} />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="stat-card">
          <div className="stat-icon bg-green-50 text-green-600">▶</div>
          <div>
            <div className="text-sm text-[#64748B]">Active Campaigns</div>
            <div className="text-3xl font-bold text-[#1A1B2E]">{activeCampaigns}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon bg-blue-50 text-blue-600">☎</div>
          <div>
            <div className="text-sm text-[#64748B]">Total Calls</div>
            <div className="text-3xl font-bold text-[#1A1B2E]">{totalCalls}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon bg-purple-50 text-purple-600">#</div>
          <div>
            <div className="text-sm text-[#64748B]">DTMF Responses</div>
            <div className="text-3xl font-bold text-[#1A1B2E]">{dtmfResponses}</div>
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-black/[0.07] flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#1A1B2E]">All Campaigns</h2>
            <p className="text-sm text-[#64748B] mt-0.5">{campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''} available</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px]">
            <thead>
              <tr className="border-b border-black/[0.07]">
                <th className="table-header pl-5">Campaign Name</th>
                <th className="table-header">SIP Account</th>
                <th className="table-header">Audio</th>
                <th className="table-header text-center">Total Calls</th>
                <th className="table-header text-center">DTMF</th>
                <th className="table-header">Status</th>
                <th className="table-header pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-[#64748B]">
                    <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    Loading campaigns...
                  </td>
                </tr>
              ) : campaigns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4 text-3xl">📭</div>
                    <div className="text-[#1A1B2E] font-semibold mb-1">No campaigns yet</div>
                    <div className="text-sm text-[#64748B]">Create your first campaign to start dialing.</div>
                  </td>
                </tr>
              ) : (
                campaigns.map((campaign) => {
                  const canStart = ['pending', 'paused', 'stopped'].includes(campaign.status);
                  const canPause = campaign.status === 'running';
                  const canStop = campaign.status === 'running' || campaign.status === 'paused';
                  const previewUrl = campaign.audio_asset_id ? `/api/audio/${campaign.audio_asset_id}/play` : '';
                  const audioLabel = campaign.audio_type === 'tts' ? (campaign.tts_text || 'Generated TTS') : (campaign.audio_filename || 'Uploaded audio');

                  return (
                    <tr key={campaign.id} className="table-row align-top">
                      <td className="table-cell pl-5">
                        <div className="space-y-1">
                          <Link to={`/campaigns/${campaign.id}`} className="font-semibold text-[#1A1B2E] hover:text-red-600 transition">
                            {campaign.name}
                          </Link>
                          <div className="text-xs text-[#64748B]">
                            {campaign.total_numbers} numbers · {campaign.concurrent_calls} concurrent · {new Date(campaign.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </td>

                      <td className="table-cell">
                        <div className="text-sm text-[#1A1B2E]">{campaign.sip_username || 'No SIP'}</div>
                        <div className="text-xs text-[#64748B]">{campaign.sip_domain || 'Not configured'}</div>
                      </td>

                      <td className="table-cell">
                        <div className="space-y-2 max-w-[320px]">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                              campaign.audio_type === 'tts'
                                ? 'bg-purple-50 text-purple-700'
                                : 'bg-blue-50 text-blue-700'
                            }`}>
                              {campaign.audio_type === 'tts' ? 'TTS' : 'Upload'}
                            </span>
                            <span className="text-xs text-[#64748B] truncate">{audioLabel}</span>
                          </div>
                          {previewUrl ? (
                            <audio controls preload="none" className="h-10 w-full max-w-[280px]">
                              <source src={previewUrl} />
                            </audio>
                          ) : (
                            <div className="text-xs text-[#94A3B8]">No preview available</div>
                          )}
                        </div>
                      </td>

                      <td className="table-cell text-center text-[#1A1B2E] font-semibold">{campaign.dialed}</td>
                      <td className="table-cell text-center text-[#1A1B2E] font-semibold">{campaign.dtmf_responses}</td>
                      <td className="table-cell"><StatusBadge status={campaign.status} /></td>

                      <td className="table-cell pr-5">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {canStart && (
                            <button
                              onClick={() => handleAction('start', campaign.id)}
                              disabled={busyAction === `start:${campaign.id}`}
                              className="btn-success text-xs py-1.5 px-3"
                            >
                              Start
                            </button>
                          )}
                          {canPause && (
                            <button
                              onClick={() => handleAction('pause', campaign.id)}
                              disabled={busyAction === `pause:${campaign.id}`}
                              className="btn-warning text-xs py-1.5 px-3"
                            >
                              Pause
                            </button>
                          )}
                          {canStop && (
                            <button
                              onClick={() => handleAction('stop', campaign.id)}
                              disabled={busyAction === `stop:${campaign.id}`}
                              className="btn-danger text-xs py-1.5 px-3"
                            >
                              Stop
                            </button>
                          )}

                          <Link to={`/campaigns/${campaign.id}`} className="btn-ghost text-xs py-1.5 px-3">
                            View
                          </Link>

                          <button
                            onClick={() => handleDelete(campaign.id)}
                            disabled={busyAction === `delete:${campaign.id}`}
                            className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-red-50 border border-gray-200 flex items-center justify-center text-[#64748B] hover:text-red-500 transition"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </svg>
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
