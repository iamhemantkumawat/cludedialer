import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCampaignHistory } from '../api';
import StatusBadge from '../components/StatusBadge';

function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString();
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

export default function CampaignHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCampaignHistory()
      .then((rows) => setHistory(rows || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Campaign History</h1>
          <p className="text-sm text-[#64748B] mt-1">Review previous campaign runs, call totals, and DTMF activity.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="stat-card">
          <div className="stat-icon bg-blue-50 text-blue-600">#</div>
          <div>
            <div className="text-sm text-[#64748B]">Run Records</div>
            <div className="text-3xl font-bold text-[#1A1B2E]">{history.length}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-green-50 text-green-600">✓</div>
          <div>
            <div className="text-sm text-[#64748B]">Answered Calls</div>
            <div className="text-3xl font-bold text-[#1A1B2E]">
              {history.reduce((sum, row) => sum + Number(row.answered_calls || 0), 0)}
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-purple-50 text-purple-600">*</div>
          <div>
            <div className="text-sm text-[#64748B]">DTMF Responses</div>
            <div className="text-3xl font-bold text-[#1A1B2E]">
              {history.reduce((sum, row) => sum + Number(row.dtmf_responses || 0), 0)}
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-orange-50 text-orange-600">!</div>
          <div>
            <div className="text-sm text-[#64748B]">Failed Calls</div>
            <div className="text-3xl font-bold text-[#1A1B2E]">
              {history.reduce((sum, row) => sum + Number(row.failed_calls || 0), 0)}
            </div>
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-black/[0.07]">
          <h2 className="text-lg font-semibold text-[#1A1B2E]">Past Runs</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="border-b border-black/[0.07]">
                <th className="table-header pl-5">Campaign</th>
                <th className="table-header">Run</th>
                <th className="table-header">Started</th>
                <th className="table-header">Finished</th>
                <th className="table-header text-center">Calls</th>
                <th className="table-header text-center">Answered</th>
                <th className="table-header text-center">DTMF</th>
                <th className="table-header text-center">Failed</th>
                <th className="table-header">Status</th>
                <th className="table-header pr-5 text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-[#64748B]">
                    <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    Loading campaign history...
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4 text-3xl">🕘</div>
                    <div className="text-[#1A1B2E] font-semibold mb-1">No campaign history yet</div>
                    <div className="text-sm text-[#64748B]">Run a campaign once and it will show up here.</div>
                  </td>
                </tr>
              ) : (
                history.map((row) => (
                  <tr key={row.id} className="table-row">
                    <td className="table-cell pl-5">
                      <div className="space-y-1">
                        <div className="font-semibold text-[#1A1B2E]">{row.campaign_name}</div>
                        <div className="text-xs text-[#64748B]">
                          {row.sip_username ? `${row.sip_username}@${row.sip_domain}` : 'No SIP account'}
                        </div>
                      </div>
                    </td>
                    <td className="table-cell">
                      <div className="text-sm font-semibold text-[#1A1B2E]">Run #{row.run_number}</div>
                      <div className="text-xs text-[#64748B]">
                        Duration {formatDuration(row.total_duration_ms || row.total_bill_duration_ms)}
                      </div>
                    </td>
                    <td className="table-cell text-sm text-[#64748B]">{formatDateTime(row.started_at || row.created_at)}</td>
                    <td className="table-cell text-sm text-[#64748B]">{formatDateTime(row.finished_at)}</td>
                    <td className="table-cell text-center font-semibold text-[#1A1B2E]">{row.total_calls}</td>
                    <td className="table-cell text-center font-semibold text-[#1A1B2E]">{row.answered_calls}</td>
                    <td className="table-cell text-center font-semibold text-[#1A1B2E]">{row.dtmf_responses}</td>
                    <td className="table-cell text-center font-semibold text-[#1A1B2E]">
                      {Number(row.failed_calls || 0) + Number(row.no_dtmf_calls || 0)}
                    </td>
                    <td className="table-cell"><StatusBadge status={row.status} /></td>
                    <td className="table-cell pr-5 text-right">
                      <Link to={`/campaigns/${row.campaign_id}`} className="btn-ghost text-xs py-1.5 px-3">
                        View Campaign
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
