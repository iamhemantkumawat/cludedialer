import { useEffect, useState, useRef, useCallback } from 'react';
import { getCampaigns, getContactLists, getContacts, getSipAccounts, startCampaign, stopCampaign, getCampaignResults, getCampaignDtmfSummary } from '../api';
import StatusBadge from '../components/StatusBadge';
import socket from '../socket';

/* ── helpers ── */
function formatDuration(sec) {
  if (!sec || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function StatCard({ label, value, sub, color = 'red', icon }) {
  const colors = {
    red:    'bg-red-50 border-red-100 text-red-600',
    green:  'bg-green-50 border-green-100 text-green-600',
    blue:   'bg-blue-50 border-blue-100 text-blue-600',
    purple: 'bg-purple-50 border-purple-100 text-purple-600',
    orange: 'bg-orange-50 border-orange-100 text-orange-600',
    gray:   'bg-gray-50 border-gray-200 text-gray-500',
  };
  return (
    <div className={`card border flex items-center gap-4 ${colors[color]}`}>
      {icon && (
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${colors[color]}`}>
          {icon}
        </div>
      )}
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs font-medium mt-0.5 opacity-80">{label}</div>
        {sub && <div className="text-[10px] opacity-60 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function LogLine({ level, ts, msg }) {
  const col = level === 'success' ? 'text-emerald-700' :
              level === 'warning' ? 'text-amber-700' :
              level === 'error'   ? 'text-red-600'   : 'text-gray-700';
  return (
    <div className="flex items-start gap-2 text-xs font-mono py-0.5">
      <span className="text-gray-400 shrink-0 w-16">{ts || '--:--:--'}</span>
      <span className="text-red-500 shrink-0">dialer</span>
      <span className={`break-words ${col}`}>{msg}</span>
    </div>
  );
}

export default function RunCampaign() {
  const [campaigns,        setCampaigns]        = useState([]);
  const [contactLists,     setContactLists]     = useState([]);
  const [sipAccounts,      setSipAccounts]      = useState([]);
  const [contacts,         setContacts]         = useState([]);
  const [activeCampaign,   setActiveCampaign]   = useState(null);
  const [selectedCampId,   setSelectedCampId]   = useState('');
  const [selectedListId,   setSelectedListId]   = useState('');
  const [selectedSipId,    setSelectedSipId]    = useState('');
  const [results,          setResults]          = useState([]);
  const [dtmfSummary,      setDtmfSummary]      = useState([]);
  const [liveCalls,        setLiveCalls]        = useState([]);
  const [logs,             setLogs]             = useState([]);
  const [launching,        setLaunching]        = useState(false);
  const [stopping,         setStopping]         = useState(false);
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState('');
  const [success,          setSuccess]          = useState('');
  const [loadingContacts,  setLoadingContacts]  = useState(false);
  const logEndRef = useRef(null);
  const liveRef   = useRef([]);

  /* ── Load base data ── */
  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      const [camps, lists, sips] = await Promise.all([getCampaigns(), getContactLists("default"), getSipAccounts()]);
      setCampaigns(camps || []);
      const listArr = Array.isArray(lists) ? lists : [];
      setContactLists(listArr);
      const sipArr = Array.isArray(sips) ? sips : [];
      setSipAccounts(sipArr);
      if (camps?.length) setSelectedCampId(prev => prev || String(camps[0].id));
      if (listArr.length) setSelectedListId(prev => prev || String(listArr[0].id));
      if (sipArr.length) setSelectedSipId(prev => prev || String((sipArr.find(s => s.is_active) || sipArr[0]).id));
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadBase(); }, [loadBase]);

  /* ── Load contacts preview when list changes ── */
  useEffect(() => {
    if (!selectedListId) { setContacts([]); return; }
    setLoadingContacts(true);
    getContacts({ list_id: selectedListId })
      .then(r => setContacts(Array.isArray(r) ? r : []))
      .catch(() => setContacts([]))
      .finally(() => setLoadingContacts(false));
  }, [selectedListId]);

  /* ── Track active campaign ── */
  const selectedCampaign = campaigns.find(c => String(c.id) === selectedCampId) || null;
  const selectedList     = contactLists.find(l => String(l.id) === selectedListId) || null;

  /* ── Load campaign results/stats if running ── */
  const loadCampaignData = useCallback(async (id) => {
    try {
      const [r, d, c] = await Promise.all([
        getCampaignResults(id),
        getCampaignDtmfSummary(id),
        getCampaigns(),
      ]);
      setResults(r || []);
      setDtmfSummary(d || []);
      const updated = (c || []).find(x => String(x.id) === String(id));
      if (updated) setActiveCampaign(updated);
    } catch { /* ignore */ }
  }, []);

  /* ── Socket events ── */
  useEffect(() => {
    const onUpdate = (data) => {
      if (activeCampaign && String(data.id) === String(activeCampaign.id)) {
        loadCampaignData(activeCampaign.id);
      }
    };
    const onCallStart = ({ campaignId, phoneNumber }) => {
      if (!activeCampaign || String(campaignId) !== String(activeCampaign.id)) return;
      liveRef.current = [...liveRef.current.filter(n => n !== phoneNumber), phoneNumber].slice(-20);
      setLiveCalls([...liveRef.current]);
      addLog('info', `Calling ${phoneNumber}`);
    };
    const onCallHangup = ({ campaignId, phoneNumber }) => {
      if (!activeCampaign || String(campaignId) !== String(activeCampaign.id)) return;
      liveRef.current = liveRef.current.filter(n => n !== phoneNumber);
      setLiveCalls([...liveRef.current]);
      addLog('info', `Call ended for ${phoneNumber}`);
    };
    const onCallResult = ({ campaignId, phoneNumber, dtmf, status }) => {
      if (!activeCampaign || String(campaignId) !== String(activeCampaign.id)) return;
      if (dtmf) addLog('success', `Got DTMF key '${dtmf}' from ${phoneNumber}`);
      loadCampaignData(activeCampaign.id);
    };

    socket.on('campaign:update',  onUpdate);
    socket.on('campaign:stats',   onUpdate);
    socket.on('call:started',     onCallStart);
    socket.on('call:hangup',      onCallHangup);
    socket.on('call:result',      onCallResult);
    return () => {
      socket.off('campaign:update',  onUpdate);
      socket.off('campaign:stats',   onUpdate);
      socket.off('call:started',     onCallStart);
      socket.off('call:hangup',      onCallHangup);
      socket.off('call:result',      onCallResult);
    };
  }, [activeCampaign, loadCampaignData]);

  /* ── Polling when running ── */
  useEffect(() => {
    if (!activeCampaign || activeCampaign.status !== 'running') return;
    const iv = setInterval(() => loadCampaignData(activeCampaign.id), 3000);
    return () => clearInterval(iv);
  }, [activeCampaign, loadCampaignData]);

  /* ── Auto-scroll logs ── */
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  function addLog(level, msg) {
    const ts = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-200), { id: Date.now() + Math.random(), level, ts, msg }]);
  }

  /* ── Run campaign ── */
  const handleRun = async () => {
    if (!selectedCampId) return setError('Please select a campaign.');
    setLaunching(true); setError(''); setSuccess('');
    try {
      await startCampaign(selectedCampId, selectedListId || null, selectedSipId || null);
      const updated = campaigns.find(c => String(c.id) === selectedCampId);
      if (updated) setActiveCampaign({ ...updated, status: 'running' });
      liveRef.current = [];
      setLiveCalls([]);
      setLogs([]);
      addLog('success', 'Campaign started');
      addLog('info', `Connecting to SIP: ${selectedCampaign?.sip_username}@${selectedCampaign?.sip_domain}`);
      addLog('info', `Dialing ${selectedCampaign?.total_numbers} numbers (${selectedCampaign?.concurrent_calls} concurrent)`);
      setSuccess('Campaign launched!');
      await loadCampaignData(selectedCampId);
      await loadBase();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Launch failed');
    } finally { setLaunching(false); }
  };

  /* ── Stop campaign ── */
  const handleStop = async () => {
    if (!activeCampaign) return;
    setStopping(true); setError('');
    try {
      await stopCampaign(activeCampaign.id);
      addLog('warning', 'Stop signal sent — finishing active calls…');
      setSuccess('Stop signal sent.');
      await loadCampaignData(activeCampaign.id);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally { setStopping(false); }
  };

  /* ── Derived stats ── */
  const camp    = activeCampaign || selectedCampaign;
  const stats   = camp?.stats || {};
  const total   = camp?.total_numbers || 0;
  const dialed  = (stats.answered || 0) + (stats.no_dtmf || 0) + (stats.noanswer || 0) + (stats.failed || 0) + (stats.busy || 0);
  const pct     = total > 0 ? Math.round((dialed / total) * 100) : 0;
  const dtmfHit = dtmfSummary.reduce((s, d) => s + d.count, 0);
  const isRun   = camp?.status === 'running';

  const listStats = selectedList || {};

  return (
    <div className="p-6 space-y-5">

      {/* ── Page header ── */}
      <div>
        <h1 className="text-xl font-bold text-[#1A1B2E]">Run Campaign</h1>
        <p className="text-sm text-[#64748B] mt-0.5">Select a campaign and contact list, then launch the dialer</p>
      </div>

      {error   && <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
      {success && <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">{success}</div>}

      {/* ── Controls card ── */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-[#1A1B2E] text-sm flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-red-50 flex items-center justify-center text-red-600">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </span>
          Run Campaign Controls
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left: Campaign selector */}
          <div className="space-y-3">
            <div>
              <label className="label">Choose Campaign</label>
              <select className="input" value={selectedCampId}
                onChange={e => setSelectedCampId(e.target.value)} disabled={loading || isRun}>
                <option value="">-- Select campaign --</option>
                {campaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">SIP Account (Caller)</label>
              <select className="input" value={selectedSipId}
                onChange={e => setSelectedSipId(e.target.value)} disabled={loading || isRun}>
                <option value="">-- Select SIP account --</option>
                {sipAccounts.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.caller_id ? `${s.caller_id} (${s.username})` : s.username} — {s.domain}
                  </option>
                ))}
              </select>
            </div>

            {selectedCampaign && (
              <div className="bg-gray-50 border border-black/[0.06] rounded-lg px-3.5 py-3 space-y-2">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div><span className="text-[#64748B]">Concurrent: </span><span className="font-medium text-[#1A1B2E]">{selectedCampaign.concurrent_calls}</span></div>
                  <div><span className="text-[#64748B]">DTMF: </span><span className="font-medium text-[#1A1B2E]">{selectedCampaign.dtmf_digits} key(s)</span></div>
                </div>
                {selectedCampaign.tts_text && (
                  <div className="border-t border-black/[0.06] pt-2">
                    <p className="text-[10px] uppercase tracking-wider text-[#64748B] mb-1">TTS Message</p>
                    <p className="text-xs text-[#1A1B2E] leading-relaxed line-clamp-2">{selectedCampaign.tts_text}</p>
                  </div>
                )}
                {(selectedCampaign.audio_file || selectedCampaign.audio_asset_id) && (
                  <div className="border-t border-black/[0.06] pt-2">
                    <p className="text-[10px] uppercase tracking-wider text-[#64748B] mb-1">Audio Preview</p>
                    <audio
                      controls
                      preload="none"
                      className="w-full h-8"
                      src={`/api/audio/${selectedCampaign.audio_file || selectedCampaign.audio_asset_id}/play`}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-1">
              <button onClick={handleRun}
                disabled={launching || !selectedCampId || isRun}
                className="btn-success flex items-center gap-2">
                {launching
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Launching…</>
                  : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run Campaign</>}
              </button>
              <button onClick={handleStop}
                disabled={stopping || !activeCampaign || !isRun}
                className="btn-danger flex items-center gap-2">
                {stopping
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>}
                Stop Run
              </button>
            </div>
          </div>

          {/* Right: Contact list selector */}
          <div className="space-y-3">
            <div>
              <label className="label">Select Contact List</label>
              <select className="input" value={selectedListId}
                onChange={e => setSelectedListId(e.target.value)} disabled={loading}>
                <option value="">-- Select contact list --</option>
                {contactLists.map(l => (
                  <option key={l.id} value={l.id}>{l.list_name} ({l.contact_count || 0})</option>
                ))}
              </select>
              {selectedList && (
                <div className="flex gap-4 mt-1.5 text-xs text-[#64748B]">
                  <span>Total: <b className="text-[#1A1B2E]">{contacts.length}</b></span>
                  <span>Pending: <b className="text-blue-600">{contacts.filter(c => c.status === 'pending').length}</b></span>
                  <span>Called: <b className="text-green-600">{contacts.filter(c => c.status !== 'pending').length}</b></span>
                </div>
              )}
            </div>

            {/* Numbers preview */}
            <div className="bg-gray-50 border border-black/[0.06] rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-black/[0.05] text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
                Numbers Preview
              </div>
              <div className="h-28 overflow-y-auto px-3 py-2 space-y-1">
                {loadingContacts ? (
                  <p className="text-xs text-[#64748B]">Loading…</p>
                ) : contacts.length > 0 ? contacts.slice(0, 10).map(c => (
                  <p key={c.id} className="text-xs font-mono text-[#1A1B2E]">{c.phone_number}</p>
                )) : (
                  <p className="text-xs text-[#64748B]">No numbers in selected list.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Live Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Run State"  value={camp?.status || 'idle'}     color={isRun ? 'green' : 'gray'} icon="⚡" />
        <StatCard label="Progress"   value={`${pct}%`}                  sub={`${dialed} / ${total}`} color="blue" icon="📊" />
        <StatCard label="Live Calls" value={liveCalls.length}            sub={`${stats.calling || 0} active`} color="orange" icon="📞" />
        <StatCard label="DTMF Hits"  value={dtmfHit}                    color="purple" icon="🔑" />
      </div>

      {/* ── Progress bar ── */}
      {camp && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[#1A1B2E]">Overall Progress — {camp.name}</span>
            <StatusBadge status={camp.status} />
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5 mb-4">
            <div className={`h-2.5 rounded-full transition-all duration-500 ${
              camp.status === 'completed' ? 'bg-green-500' : 'bg-red-500'}`}
              style={{ width: `${pct}%` }} />
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[
              { label: 'Total',     value: total,                color: 'text-[#1A1B2E] bg-gray-50 border-gray-200' },
              { label: 'Pending',   value: stats.pending  || 0, color: 'text-blue-700 bg-blue-50 border-blue-200' },
              { label: 'Calling',   value: stats.calling  || 0, color: 'text-purple-700 bg-purple-50 border-purple-200' },
              { label: 'Answered',  value: stats.answered || 0, color: 'text-green-700 bg-green-50 border-green-200' },
              { label: 'No Answer', value: stats.noanswer || 0, color: 'text-orange-700 bg-orange-50 border-orange-200' },
              { label: 'Failed',    value: (stats.failed||0)+(stats.busy||0), color: 'text-red-700 bg-red-50 border-red-200' },
            ].map(s => (
              <div key={s.label} className={`border rounded-xl py-2.5 px-2 text-center ${s.color}`}>
                <div className="text-lg font-bold">{s.value}</div>
                <div className="text-[10px] uppercase tracking-wide opacity-70 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Live Calls Table ── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-[#1A1B2E] text-sm flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isRun ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
            Live Calls ({liveCalls.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-black/[0.06]">
                <th className="table-header">Number</th>
                <th className="table-header">Status</th>
                <th className="table-header">Duration</th>
                <th className="table-header">DTMF</th>
              </tr>
            </thead>
            <tbody>
              {liveCalls.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-sm text-[#64748B]">
                    {isRun ? 'Waiting for calls to connect…' : 'No active calls — start a campaign to see live calls here'}
                  </td>
                </tr>
              ) : liveCalls.map(num => (
                <tr key={num} className="table-row">
                  <td className="table-cell font-mono">{num}</td>
                  <td className="table-cell">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Up
                    </span>
                  </td>
                  <td className="table-cell text-[#64748B]">—</td>
                  <td className="table-cell text-[#64748B]">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Bottom 2-col ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* Live Logs */}
        <div className="card">
          <h2 className="font-semibold text-[#1A1B2E] text-sm mb-3 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2">
              <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
            </svg>
            Live Logs
          </h2>
          <div className="h-72 overflow-y-auto bg-gray-50 border border-gray-200 rounded-xl p-3">
            {logs.length === 0 ? (
              <p className="text-xs font-mono text-gray-400 italic">Waiting for campaign activity…</p>
            ) : logs.map(l => (
              <LogLine key={l.id} level={l.level} ts={l.ts} msg={l.msg} />
            ))}
            <div ref={logEndRef} />
          </div>
        </div>

        {/* DTMF Results */}
        <div className="card">
          <h2 className="font-semibold text-[#1A1B2E] text-sm mb-3 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2">
              <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
              <line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
            </svg>
            DTMF Results ({dtmfHit})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-black/[0.06]">
                  <th className="table-header">Number</th>
                  <th className="table-header">DTMF Key</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Time</th>
                </tr>
              </thead>
              <tbody>
                {results.filter(r => r.dtmf).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-sm text-[#64748B]">
                      No DTMF results yet
                    </td>
                  </tr>
                ) : results.filter(r => r.dtmf).map(r => (
                  <tr key={r.id} className="table-row">
                    <td className="table-cell font-mono text-sm">{r.phone_number}</td>
                    <td className="table-cell">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-purple-50 border border-purple-200 text-purple-700 font-bold text-sm">
                        {r.dtmf}
                      </span>
                    </td>
                    <td className="table-cell"><StatusBadge status={r.status} /></td>
                    <td className="table-cell text-xs text-[#64748B]">
                      {new Date(r.called_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* DTMF Key Summary */}
          {dtmfSummary.length > 0 && (
            <div className="mt-4 pt-4 border-t border-black/[0.06] space-y-2.5">
              <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Key Summary</p>
              {dtmfSummary.map((d, i) => {
                const p = dtmfHit > 0 ? Math.round((d.count / dtmfHit) * 100) : 0;
                const colors = ['bg-blue-500','bg-green-500','bg-purple-500','bg-amber-500','bg-red-500','bg-cyan-500'];
                return (
                  <div key={d.dtmf}>
                    <div className="flex items-center justify-between mb-1 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center font-bold text-blue-700 text-[11px]">{d.dtmf}</span>
                        <span className="text-[#1A1B2E]">Key [{d.dtmf}]</span>
                      </div>
                      <span className="text-[#64748B]">{d.count} ({p}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${colors[i % colors.length]}`} style={{ width: `${p}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
