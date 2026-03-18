import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCampaigns, getSipAccounts } from '../api';

export default function Dashboard() {
  const nav = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [sip, setSip] = useState([]);

  useEffect(() => {
    getCampaigns().then(r => setCampaigns(r || [])).catch(() => {});
    getSipAccounts().then(r => setSip(r || [])).catch(() => {});
  }, []);

  const total   = campaigns.length;
  const running = campaigns.filter(c => c.status === 'running').length;
  const done    = campaigns.filter(c => c.status === 'completed').length;
  const sipOk   = sip.filter(s => s.is_active).length;

  const stats = [
    { label: 'Total Campaigns', value: total,   icon: '📋', color: 'bg-blue-50 text-blue-600',   border: 'border-blue-100' },
    { label: 'Running',         value: running, icon: '▶️',  color: 'bg-red-50 text-red-600',     border: 'border-red-100'  },
    { label: 'Completed',       value: done,    icon: '✅',  color: 'bg-green-50 text-green-600', border: 'border-green-100'},
    { label: 'SIP Accounts',    value: sipOk,   icon: '📞',  color: 'bg-purple-50 text-purple-600', border: 'border-purple-100'},
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1A1B2E]">Dashboard</h1>
        <p className="text-sm text-[#64748B] mt-0.5">Overview of your autodialer activity</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className={`card flex items-center gap-4 border ${s.border}`}>
            <div className={`stat-icon ${s.color} text-2xl`}>{s.icon}</div>
            <div>
              <div className="text-2xl font-bold text-[#1A1B2E]">{s.value}</div>
              <div className="text-xs text-[#64748B] mt-0.5">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button onClick={() => nav('/new')}
          className="card hover:shadow-card-hover transition-shadow text-left group">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mb-3 group-hover:bg-red-100 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E53935" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
          </div>
          <div className="font-semibold text-[#1A1B2E]">New Campaign</div>
          <div className="text-xs text-[#64748B] mt-1">Create and configure a campaign</div>
        </button>

        <button onClick={() => nav('/run')}
          className="card hover:shadow-card-hover transition-shadow text-left group">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center mb-3 group-hover:bg-green-100 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>
            </svg>
          </div>
          <div className="font-semibold text-[#1A1B2E]">Run Campaign</div>
          <div className="text-xs text-[#64748B] mt-1">Launch and monitor live dialing</div>
        </button>

        <button onClick={() => nav('/contacts')}
          className="card hover:shadow-card-hover transition-shadow text-left group">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-3 group-hover:bg-blue-100 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            </svg>
          </div>
          <div className="font-semibold text-[#1A1B2E]">Manage Contacts</div>
          <div className="text-xs text-[#64748B] mt-1">Import and organize phone lists</div>
        </button>
      </div>

      {/* Recent campaigns */}
      {campaigns.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[#1A1B2E]">Recent Campaigns</h2>
            <button onClick={() => nav('/campaigns')} className="text-xs text-red-600 hover:text-red-700 font-medium">
              View all →
            </button>
          </div>
          <div className="space-y-2">
            {campaigns.slice(0, 5).map(c => (
              <div key={c.id}
                onClick={() => nav(`/campaigns/${c.id}`)}
                className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                <span className="font-medium text-sm text-[#1A1B2E]">{c.name}</span>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                  c.status === 'running'   ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                  c.status === 'completed' ? 'bg-green-50 text-green-700 border border-green-200' :
                  c.status === 'paused'    ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                  'bg-gray-100 text-gray-600 border border-gray-200'
                }`}>{c.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
