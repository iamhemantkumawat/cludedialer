import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getCampaign, getCampaignResults, getCampaignDtmfSummary,
  startCampaign, pauseCampaign, stopCampaign, deleteCampaign
} from '../api';
import StatusBadge from '../components/StatusBadge';
import socket from '../socket';

const DTMF_COLORS = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500',
  'bg-amber-500', 'bg-red-500',  'bg-pink-500',
  'bg-cyan-500',  'bg-orange-500',
];

export default function CampaignDetail() {
  const { id } = useParams();
  const nav     = useNavigate();

  const [campaign,    setCampaign]    = useState(null);
  const [results,     setResults]     = useState([]);
  const [dtmfSummary, setDtmfSummary] = useState([]);
  const [liveCalls,   setLiveCalls]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const liveRef = useRef([]);

  const loadAll = async () => {
    const [c, r, d] = await Promise.all([
      getCampaign(id),
      getCampaignResults(id),
      getCampaignDtmfSummary(id),
    ]);
    setCampaign(c);
    setResults(r);
    setDtmfSummary(d);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();

    const onUpdate    = (data) => { if (data.id === id) loadAll(); };
    const onStats     = (data) => { if (data.id === id) loadAll(); };
    const onCallStart = ({ campaignId, phoneNumber }) => {
      if (campaignId !== id) return;
      liveRef.current = [...liveRef.current, phoneNumber].slice(-20);
      setLiveCalls([...liveRef.current]);
    };
    const onCallHangup = ({ campaignId, phoneNumber }) => {
      if (campaignId !== id) return;
      liveRef.current = liveRef.current.filter(n => n !== phoneNumber);
      setLiveCalls([...liveRef.current]);
    };
    const onCallResult = ({ campaignId }) => {
      if (campaignId !== id) return;
      loadAll();
    };

    socket.on('campaign:update', onUpdate);
    socket.on('campaign:stats',  onStats);
    socket.on('call:started',    onCallStart);
    socket.on('call:hangup',     onCallHangup);
    socket.on('call:result',     onCallResult);

    return () => {
      socket.off('campaign:update', onUpdate);
      socket.off('campaign:stats',  onStats);
      socket.off('call:started',    onCallStart);
      socket.off('call:hangup',     onCallHangup);
      socket.off('call:result',     onCallResult);
    };
  }, [id]);

  const handleAction = async (action) => {
    const fns = { start: startCampaign, pause: pauseCampaign, stop: stopCampaign };
    await fns[action](id);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this campaign and all results?')) return;
    await deleteCampaign(id);
    nav('/campaigns');
  };

  const exportCSV = () => {
    const rows = [['Phone Number', 'DTMF Key', 'Status', 'Called At']];
    results.forEach(r => rows.push([r.phone_number, r.dtmf || '', r.status, r.called_at]));
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `campaign-${id}-results.csv`;
    a.click();
  };

  if (loading) return (
    <div className="p-6 flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!campaign) return <div className="p-6 text-red-400">Campaign not found</div>;

  const stats = campaign.stats || {};
  const dialedTotal = (stats.answered || 0) + (stats.no_dtmf || 0) + (stats.busy || 0) + (stats.noanswer || 0) + (stats.failed || 0);
  const pct = campaign.total_numbers > 0 ? Math.round((dialedTotal / campaign.total_numbers) * 100) : 0;
  const canStart = ['pending', 'paused', 'stopped'].includes(campaign.status);
  const canPause = campaign.status === 'running';
  const canStop  = campaign.status === 'running' || campaign.status === 'paused';
  const totalDtmfPressed = dtmfSummary.reduce((s, d) => s + d.count, 0);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <button onClick={() => nav('/campaigns')} className="text-[#64748B] hover:text-white transition">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <h1 className="text-xl font-bold text-white">{campaign.name}</h1>
            <StatusBadge status={campaign.status} />
          </div>
          <p className="text-sm text-[#64748B] ml-8">
            {campaign.sip_username}@{campaign.sip_domain} &middot; {campaign.total_numbers} numbers &middot; {campaign.concurrent_calls} concurrent
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canStart && <button onClick={() => handleAction('start')} className="btn-success">▶ Start</button>}
          {canPause && <button onClick={() => handleAction('pause')} className="btn-warning">⏸ Pause</button>}
          {canStop  && <button onClick={() => handleAction('stop')}  className="btn-danger">⏹ Stop</button>}
          <button onClick={exportCSV} className="btn-ghost">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            CSV
          </button>
          <button onClick={handleDelete} className="btn-ghost text-red-400 hover:text-red-300">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            Delete
          </button>
        </div>
      </div>

      {/* Progress card */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-white">Overall Progress</span>
          <span className="text-sm font-bold text-[#64748B]">{pct}%</span>
        </div>
        <div className="w-full bg-white/5 rounded-full h-3 mb-5">
          <div
            className={`h-3 rounded-full transition-all duration-500 ${
              campaign.status === 'completed' ? 'bg-green-500' : 'bg-red-500'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { label: 'Total',     value: campaign.total_numbers,                     color: 'text-white',       bg: 'bg-white/5'        },
            { label: 'Pending',   value: stats.pending  || 0,                        color: 'text-blue-400',    bg: 'bg-blue-500/10'    },
            { label: 'Calling',   value: stats.calling  || 0,                        color: 'text-purple-400',  bg: 'bg-purple-500/10'  },
            { label: 'Answered',  value: stats.answered || 0,                        color: 'text-green-400',   bg: 'bg-green-500/10'   },
            { label: 'No Answer', value: stats.noanswer || 0,                        color: 'text-orange-400',  bg: 'bg-orange-500/10'  },
            { label: 'Failed',    value: (stats.failed||0) + (stats.busy||0),        color: 'text-red-400',     bg: 'bg-red-500/10'     },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl py-3 px-2 text-center`}>
              <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-[#64748B] mt-0.5 uppercase tracking-wide">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* DTMF Summary + Live Calls */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-white text-sm">DTMF Key Summary</h2>
          {dtmfSummary.length === 0 ? (
            <p className="text-[#64748B] text-sm py-2">No DTMF data yet</p>
          ) : (
            <div className="space-y-3">
              {dtmfSummary.map((d, i) => {
                const p = totalDtmfPressed > 0 ? Math.round((d.count / totalDtmfPressed) * 100) : 0;
                return (
                  <div key={d.dtmf}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-xs font-bold text-blue-300">
                          {d.dtmf}
                        </span>
                        <span className="text-sm text-white">Key [{d.dtmf}]</span>
                      </div>
                      <span className="text-xs text-[#64748B]">{d.count} ({p}%)</span>
                    </div>
                    <div className="w-full bg-white/5 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${DTMF_COLORS[i % DTMF_COLORS.length]}`}
                        style={{ width: `${p}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Live calls */}
          {campaign.status === 'running' && (
            <div className="pt-4 border-t border-black/[0.07]">
              <h3 className="text-xs font-semibold text-[#64748B] mb-3 uppercase tracking-wider">
                Live Active Calls ({liveCalls.length})
              </h3>
              {liveCalls.length === 0 ? (
                <p className="text-xs text-[#64748B]">Waiting for calls…</p>
              ) : (
                <div className="space-y-1.5">
                  {liveCalls.map(num => (
                    <div key={num} className="flex items-center gap-2 text-xs">
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
                      <span className="font-mono text-gray-300">{num}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Results Table */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white text-sm">Call Results ({results.length})</h2>
          </div>
          {results.length === 0 ? (
            <p className="text-[#64748B] text-sm py-8 text-center">No results yet. Start the campaign to begin dialing.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-black/[0.07]">
                    <th className="table-header">Phone Number</th>
                    <th className="table-header">Status</th>
                    <th className="table-header text-center">DTMF Key</th>
                    <th className="table-header">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {results.slice(0, 200).map(r => (
                    <tr key={r.id} className="table-row">
                      <td className="table-cell font-mono text-[#1A1B2E]">{r.phone_number}</td>
                      <td className="table-cell"><StatusBadge status={r.status} /></td>
                      <td className="table-cell text-center">
                        {r.dtmf ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-600/20 text-blue-300 font-bold font-mono text-sm border border-blue-500/30">
                            {r.dtmf}
                          </span>
                        ) : (
                          <span className="text-[#64748B]">—</span>
                        )}
                      </td>
                      <td className="table-cell text-xs text-[#64748B]">
                        {new Date(r.called_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
