import { useEffect, useState, useCallback } from 'react';
import { getCallLogs } from '../api';
import StatusBadge from '../components/StatusBadge';

const STATUSES = ['All', 'answered', 'noanswer', 'failed', 'busy', 'calling', 'pending'];

export default function CallLogs() {
  const [logs,    setLogs]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [status,  setStatus]  = useState('All');
  const [page,    setPage]    = useState(1);
  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCallLogs({
        q:      search,
        status: status === 'All' ? '' : status,
        page,
        limit,
      });
      setLogs(data.results || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error('Failed to load call logs', e);
    } finally {
      setLoading(false);
    }
  }, [search, status, page]);

  useEffect(() => { load(); }, [load]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [search, status]);

  const totalPages = Math.ceil(total / limit);

  const formatDuration = (secs) => {
    if (!secs && secs !== 0) return '—';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const formatDate = (dt) => {
    if (!dt) return '—';
    const d = new Date(dt);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Call Logs / CDRs</h1>
          <p className="text-sm text-[#64748B] mt-0.5">
            {total.toLocaleString()} total records
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost">
          {loading ? (
            <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          )}
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-52">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            className="input pl-9"
            placeholder="Search by number or campaign…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Status filter */}
        <select
          className="input w-44"
          value={status}
          onChange={e => setStatus(e.target.value)}
        >
          {STATUSES.map(s => (
            <option key={s} value={s}>
              {s === 'All' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-black/[0.07]">
                <th className="table-header pl-5">Date / Time</th>
                <th className="table-header">Phone Number</th>
                <th className="table-header">Campaign</th>
                <th className="table-header text-center">DTMF Key</th>
                <th className="table-header">Status</th>
                <th className="table-header pr-5">Duration</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-[#64748B]">
                    <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    Loading call logs…
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-3">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B8BAA" strokeWidth="1.5"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                    </div>
                    <div className="text-white font-medium mb-1">No call logs found</div>
                    <div className="text-sm text-[#64748B]">Run a campaign to see call records here</div>
                  </td>
                </tr>
              ) : (
                logs.map((log, i) => (
                  <tr key={log.id || i} className="table-row">
                    <td className="table-cell pl-5 text-[#64748B] text-xs whitespace-nowrap">
                      {formatDate(log.called_at)}
                    </td>
                    <td className="table-cell font-mono text-sm">
                      {log.phone_number}
                    </td>
                    <td className="table-cell text-[#64748B] max-w-[180px] truncate">
                      {log.campaign_name || log.campaign_id || '—'}
                    </td>
                    <td className="table-cell text-center">
                      {log.dtmf ? (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-600/20 text-blue-300 font-bold font-mono text-sm border border-blue-500/30">
                          {log.dtmf}
                        </span>
                      ) : (
                        <span className="text-[#64748B]">—</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <StatusBadge status={log.status} />
                    </td>
                    <td className="table-cell pr-5 text-[#64748B]">
                      {formatDuration(log.duration)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-black/[0.07]">
            <span className="text-xs text-[#64748B]">
              Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-ghost text-xs py-1.5 px-3 disabled:opacity-30"
              >
                Previous
              </button>
              <span className="px-3 py-1.5 text-xs text-white bg-white/5 rounded-lg border border-black/[0.07]">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-ghost text-xs py-1.5 px-3 disabled:opacity-30"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
