import { useEffect, useState } from 'react';
import { getSipAccounts, createSipAccount, deleteSipAccount, getSipLiveStatus, testCall } from '../api';

const EMPTY_FORM = { name: '', username: '', password: '', domain: '', port: 5060, caller_id: '' };

export default function SipSettings() {
  const [accounts,      setAccounts]      = useState([]);
  const [form,          setForm]          = useState(EMPTY_FORM);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState('');
  const [success,       setSuccess]       = useState('');
  const [sipStatus,     setSipStatus]     = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [testPhone,     setTestPhone]     = useState('');
  const [testSipId,     setTestSipId]     = useState('');
  const [testLoading,   setTestLoading]   = useState(false);
  const [testResult,    setTestResult]    = useState(null);

  const load = () => getSipAccounts().then(a => {
    setAccounts(a);
    if (a.length > 0 && !testSipId) setTestSipId(a[0].id);
  });

  useEffect(() => { load(); checkSipStatus(); }, []);

  const checkSipStatus = async () => {
    setStatusLoading(true);
    try {
      const s = await getSipLiveStatus();
      setSipStatus(s);
    } catch { setSipStatus(null); }
    finally { setStatusLoading(false); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    try {
      await createSipAccount(form);
      setForm(EMPTY_FORM);
      setSuccess('SIP account saved. Asterisk SIP config reloaded. Wait 5–10s then check status.');
      await load();
      setTimeout(checkSipStatus, 6000);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this SIP account?')) return;
    await deleteSipAccount(id);
    await load();
    checkSipStatus();
  };

  const handleTestCall = async () => {
    if (!testPhone || !testSipId) return;
    setTestLoading(true); setTestResult(null);
    try {
      const r = await testCall({ phone_number: testPhone, sip_account_id: testSipId });
      setTestResult(r);
    } catch (err) {
      setTestResult({ success: false, error: err.response?.data?.error || err.message });
    } finally { setTestLoading(false); }
  };

  return (
    <div className="p-6 space-y-5 max-w-2xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">SIP Accounts</h1>
          <p className="text-sm text-[#64748B] mt-0.5">Configure SIP trunks for outbound dialing</p>
        </div>
      </div>

      {/* SIP Status Banner */}
      <div className={`flex items-center justify-between rounded-xl px-4 py-3.5 border ${
        sipStatus === null   ? 'bg-white/5 border-black/[0.07]' :
        sipStatus.registered ? 'bg-green-500/10 border-green-500/20' :
                               'bg-red-500/10 border-red-500/20'
      }`}>
        <div className="flex items-center gap-3">
          {sipStatus === null ? (
            <span className="w-3 h-3 rounded-full bg-gray-500" />
          ) : sipStatus.registered ? (
            <span className="w-3 h-3 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)] animate-pulse" />
          ) : (
            <span className="w-3 h-3 rounded-full bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse" />
          )}
          <div>
            <div className="text-sm font-semibold text-white">
              {sipStatus === null
                ? 'Checking SIP status…'
                : sipStatus.registered
                  ? 'SIP Registered — Ready to dial'
                  : 'SIP NOT Registered — Calls will fail'}
            </div>
            {sipStatus?.registry && (
              <div className="text-xs text-[#64748B] mt-0.5 font-mono">{sipStatus.registry.trim()}</div>
            )}
          </div>
        </div>
        <button onClick={checkSipStatus} disabled={statusLoading} className="btn-ghost text-xs py-1.5">
          {statusLoading
            ? <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            : 'Refresh'}
        </button>
      </div>

      {error   && <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>{error}</div>}
      {success && <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>{success}</div>}

      {/* Add Account Form */}
      <form onSubmit={handleSave} className="card space-y-4">
        <h2 className="font-semibold text-white text-sm">Add / Update SIP Account</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Display Name</label>
            <input className="input" placeholder="My Trunk"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">SIP Username *</label>
            <input className="input" placeholder="hemantpc" required
              value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
          </div>
          <div>
            <label className="label">Password *</label>
            <input type="password" className="input" placeholder="••••••••" required
              value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          <div>
            <label className="label">SIP Domain *</label>
            <input className="input" placeholder="sip.cyberxcalls.com" required
              value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} />
          </div>
          <div>
            <label className="label">Port</label>
            <input type="number" className="input" value={form.port}
              onChange={e => setForm(f => ({ ...f, port: +e.target.value }))} />
          </div>
          <div>
            <label className="label">
              Caller ID Number
              <span className="text-[#64748B] font-normal ml-1 normal-case">(optional)</span>
            </label>
            <input className="input" placeholder="e.g. 919988229920"
              value={form.caller_id} onChange={e => setForm(f => ({ ...f, caller_id: e.target.value }))} />
          </div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5 text-xs text-orange-300">
          <strong>Caller ID tip:</strong> Some SIP providers reject calls if the CallerID does not match a valid number.
          Set it to your registered DID number or leave blank to use the SIP username.
        </div>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving & Reloading SIP…' : 'Save SIP Account'}
        </button>
      </form>

      {/* Configured Accounts */}
      <div className="card">
        <h2 className="font-semibold text-white text-sm mb-4">
          Configured Accounts
          <span className="ml-2 text-[#64748B] font-normal">({accounts.length})</span>
        </h2>
        {accounts.length === 0 ? (
          <p className="text-[#64748B] text-sm py-4 text-center">No accounts yet. Add one above.</p>
        ) : (
          <div className="divide-y divide-black/[0.05]">
            {accounts.map(a => (
              <div key={a.id} className="py-3.5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">{a.name || a.username}</div>
                  <div className="text-xs text-[#64748B] mt-0.5">
                    {a.username}@{a.domain}:{a.port}
                    {a.caller_id ? ` · CallerID: ${a.caller_id}` : ' · CallerID: (using username)'}
                  </div>
                </div>
                <button onClick={() => handleDelete(a.id)} className="btn-ghost text-xs py-1.5 text-red-400 hover:text-red-300">
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Test Call */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-white text-sm">Test Single Call</h2>
        <p className="text-xs text-[#64748B]">
          Send a single test call to verify your SIP account is working. The call goes through Asterisk → SIP provider → destination.
        </p>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="label">Phone Number (E.164)</label>
            <input className="input font-mono" placeholder="+919988229920"
              value={testPhone} onChange={e => setTestPhone(e.target.value)} />
          </div>
          <div className="w-44">
            <label className="label">SIP Account</label>
            <select className="input" value={testSipId} onChange={e => setTestSipId(e.target.value)}>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.username}</option>
              ))}
            </select>
          </div>
        </div>
        <button onClick={handleTestCall}
          disabled={!testPhone || !testSipId || testLoading || accounts.length === 0}
          className="btn-primary">
          {testLoading ? 'Dialing…' : 'Test Call Now'}
        </button>

        {testResult && (
          <div className={`rounded-xl p-4 text-sm font-mono border ${
            testResult.success
              ? 'bg-green-500/10 border-green-500/20 text-green-300'
              : 'bg-red-500/10 border-red-500/20 text-red-300'
          }`}>
            <div className="font-bold mb-2">
              {testResult.success ? 'Call originated — check your phone!' : 'Call failed'}
            </div>
            <div className="text-xs space-y-0.5 text-opacity-80">
              <div>SIP Registered: {testResult.isRegistered ? 'Yes' : 'No'}</div>
              {testResult.error && <div className="text-red-400 mt-1">Error: {testResult.error}</div>}
              {testResult.actionId && <div>ActionID: {testResult.actionId}</div>}
            </div>
            {testResult.registry && (
              <pre className="mt-2 text-xs text-[#64748B] whitespace-pre-wrap">{testResult.registry}</pre>
            )}
          </div>
        )}
      </div>

      {/* Troubleshooting */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 space-y-2 text-xs text-blue-300">
        <p className="font-semibold text-blue-200">Troubleshooting 403 Forbidden</p>
        <p>If calls fail with <strong>403 Forbidden</strong>, try these fixes in order:</p>
        <ol className="list-decimal list-inside space-y-1 text-blue-300/80 ml-1">
          <li>Set a <strong>Caller ID Number</strong> — use your registered DID (e.g. 919988229920)</li>
          <li>Try number with <strong>+</strong> prefix: <code className="bg-white/10 px-1 rounded">+919988229920</code></li>
          <li>Try number without country code: <code className="bg-white/10 px-1 rounded">9988229920</code></li>
          <li>Check with CyberX Calls if outbound calls are enabled on your account</li>
          <li>Verify the SIP status above shows <strong>Registered</strong></li>
        </ol>
      </div>
    </div>
  );
}
