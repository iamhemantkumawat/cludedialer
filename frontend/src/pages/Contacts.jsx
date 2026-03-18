import { useEffect, useState, useCallback, useRef } from 'react';
import {
  getContactLists, createContactList, renameContactList, deleteContactList,
  getContacts, addContact, deleteContact, importContacts, cleanupContacts,
} from '../api';

/* ── Status badge ──────────────────────────────────────────────────────── */
function ContactBadge({ status }) {
  const map = {
    pending: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    called:  'bg-green-500/20 text-green-400 border-green-500/30',
    failed:  'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${map[status] || map.pending}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        status === 'called' ? 'bg-green-400' : status === 'failed' ? 'bg-red-400' : 'bg-blue-400'
      }`} />
      {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending'}
    </span>
  );
}

/* ── Modal wrapper ─────────────────────────────────────────────────────── */
function Modal({ show, onClose, title, children }) {
  if (!show) return null;
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-h-[90vh] flex flex-col">
        <div className="modal-header">
          <h3 className="font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-[#64748B] hover:text-white transition">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

const STATUS_FILTERS = ['All', 'pending', 'called', 'failed'];
const CLEANUP_MODES = [
  { key: 'clear_all',      label: 'Clear All Contacts'    },
  { key: 'replace_from_text', label: 'Clear All + Paste New' },
  { key: 'clear_answered', label: 'Clear Answered Only'   },
  { key: 'clear_dtmf',     label: 'Clear DTMF Only'       },
];

const SIP_ACCOUNT_ID = 'default'; // Use 'default' for now; can be dynamic later

export default function Contacts() {
  /* ── State ── */
  const [lists,       setLists]       = useState([]);
  const [activeList,  setActiveList]  = useState(null);   // full list object
  const [contacts,    setContacts]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [statusFilter,setStatusFilter]= useState('All');

  // Modals
  const [showPaste,      setShowPaste]      = useState(false);
  const [showUpload,     setShowUpload]     = useState(false);
  const [showAdd,        setShowAdd]        = useState(false);
  const [showRename,     setShowRename]     = useState(false);
  const [showCleanup,    setShowCleanup]    = useState(false);

  // Form state
  const [pasteText,      setPasteText]      = useState('');
  const [addForm,        setAddForm]        = useState({ phone_number: '', contact_name: '' });
  const [renameValue,    setRenameValue]    = useState('');
  const [newListName,    setNewListName]    = useState('');
  const [showNewList,    setShowNewList]    = useState(false);
  const [cleanupMode,    setCleanupMode]    = useState('clear_all');
  const [cleanupText,    setCleanupText]    = useState('');
  const [submitting,     setSubmitting]     = useState(false);
  const [error,          setError]          = useState('');

  const fileInputRef = useRef(null);

  /* ── Load lists ── */
  const loadLists = useCallback(async () => {
    try {
      const data = await getContactLists(SIP_ACCOUNT_ID);
      setLists(data);
      const defaultList = data.find(l => String(l.list_name || '').toLowerCase() === 'default') || data[0] || null;

      if (!activeList) {
        setActiveList(defaultList);
        return;
      }

      const refreshed = data.find(l => l.id === activeList.id);
      setActiveList(refreshed || defaultList);
    } catch (e) {
      console.error('Failed to load contact lists', e);
    }
  }, [activeList]);

  /* ── Load contacts ── */
  const loadContacts = useCallback(async () => {
    if (!activeList) return;
    setLoading(true);
    try {
      const data = await getContacts({
        list_id: activeList.id,
        q:       search,
        status:  statusFilter === 'All' ? '' : statusFilter,
      });
      setContacts(data);
    } catch (e) {
      console.error('Failed to load contacts', e);
    } finally {
      setLoading(false);
    }
  }, [activeList, search, statusFilter]);

  useEffect(() => { loadLists(); }, []);
  useEffect(() => { loadContacts(); }, [loadContacts]);

  /* ── Stats from contacts ── */
  const total   = contacts.length;
  const pending = contacts.filter(c => c.status === 'pending').length;
  const called  = contacts.filter(c => c.status === 'called').length;

  /* ── Actions ── */
  const handleAddContact = async (e) => {
    e.preventDefault();
    if (!addForm.phone_number.trim()) return;
    setSubmitting(true); setError('');
    try {
      await addContact({
        ...addForm,
        sip_account_id:   SIP_ACCOUNT_ID,
        contact_list_id:  activeList?.id,
      });
      setAddForm({ phone_number: '', contact_name: '' });
      setShowAdd(false);
      loadContacts();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setSubmitting(false); }
  };

  const handlePasteImport = async () => {
    if (!pasteText.trim()) return;
    setSubmitting(true); setError('');
    try {
      await importContacts({
        sip_account_id:  SIP_ACCOUNT_ID,
        contact_list_id: activeList?.id,
        text:            pasteText,
      });
      setPasteText('');
      setShowPaste(false);
      loadContacts();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setSubmitting(false); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSubmitting(true); setError('');
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        await importContacts({
          sip_account_id:  SIP_ACCOUNT_ID,
          contact_list_id: activeList?.id,
          text:            ev.target.result,
          filename:        file.name,
        });
        setShowUpload(false);
        loadContacts();
      } catch (e) {
        setError(e.response?.data?.error || e.message);
      } finally {
        setSubmitting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleDeleteContact = async (id) => {
    await deleteContact(id);
    loadContacts();
  };

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    setSubmitting(true);
    try {
      await createContactList({ sip_account_id: SIP_ACCOUNT_ID, list_name: newListName });
      setNewListName('');
      setShowNewList(false);
      await loadLists();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setSubmitting(false); }
  };

  const handleRenameList = async () => {
    if (!renameValue.trim() || !activeList) return;
    setSubmitting(true);
    try {
      await renameContactList(activeList.id, renameValue);
      setShowRename(false);
      await loadLists();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setSubmitting(false); }
  };

  const handleDeleteList = async () => {
    if (!activeList || activeList.list_name === 'Default') return;
    if (!confirm(`Delete list "${activeList.list_name}"? Contacts will be moved to Default.`)) return;
    setSubmitting(true);
    try {
      await deleteContactList(activeList.id);
      setActiveList(null);
      await loadLists();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setSubmitting(false); }
  };

  const handleCleanup = async () => {
    if (!activeList) return;
    setSubmitting(true); setError('');
    try {
      await cleanupContacts({
        mode:            cleanupMode,
        contact_list_id: activeList.id,
        text:            cleanupMode === 'replace_from_text' ? cleanupText : undefined,
      });
      setShowCleanup(false);
      setCleanupText('');
      loadContacts();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setSubmitting(false); }
  };

  const isDefault = activeList?.list_name === 'Default';

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="text-sm text-[#64748B] mt-0.5">Manage contact lists for your campaigns</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowPaste(true)} className="btn-secondary text-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
            Paste Numbers
          </button>
          <button onClick={() => setShowUpload(true)} className="btn-secondary text-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload CSV/TXT
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Contact
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-200">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Contact List card */}
        <div className="card">
          <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-2">Contact List</div>
          <div className="flex items-center gap-2 mb-2">
            <select
              className="input text-sm py-1.5 flex-1"
              value={activeList?.id || ''}
              onChange={e => {
                const l = lists.find(l => String(l.id) === e.target.value);
                if (l) setActiveList(l);
              }}
            >
              {lists.map(l => (
                <option key={l.id} value={l.id}>{l.list_name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {/* New list */}
            {showNewList ? (
              <div className="flex gap-1 w-full mt-1">
                <input
                  className="input text-xs py-1 flex-1"
                  placeholder="List name"
                  value={newListName}
                  onChange={e => setNewListName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateList()}
                  autoFocus
                />
                <button onClick={handleCreateList} disabled={submitting} className="btn-primary text-xs py-1 px-2">+</button>
                <button onClick={() => setShowNewList(false)} className="btn-ghost text-xs py-1 px-2">✕</button>
              </div>
            ) : (
              <button onClick={() => setShowNewList(true)} className="btn-ghost text-xs py-1 px-2">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                New
              </button>
            )}
            {!isDefault && activeList && (
              <>
                <button onClick={() => { setRenameValue(activeList.list_name); setShowRename(true); }} className="btn-ghost text-xs py-1 px-2">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Rename
                </button>
                <button onClick={handleDeleteList} className="btn-ghost text-xs py-1 px-2 text-red-400 hover:text-red-300">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                  Delete
                </button>
              </>
            )}
          </div>
        </div>

        {/* Total */}
        <div className="stat-card">
          <div className="stat-icon bg-blue-500/10">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{total}</div>
            <div className="text-xs text-[#64748B] mt-0.5">Total Contacts</div>
          </div>
        </div>

        {/* Pending */}
        <div className="stat-card">
          <div className="stat-icon bg-amber-500/10">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{pending}</div>
            <div className="text-xs text-[#64748B] mt-0.5">Pending</div>
          </div>
        </div>

        {/* Called */}
        <div className="stat-card">
          <div className="stat-icon bg-green-500/10">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="1.8"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{called}</div>
            <div className="text-xs text-[#64748B] mt-0.5">Called</div>
          </div>
        </div>
      </div>

      {/* Filters + Cleanup */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-52">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            className="input pl-9"
            placeholder="Search number or name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Status filter */}
        <select className="input w-44" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          {STATUS_FILTERS.map(s => (
            <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>

        {/* Cleanup */}
        <button onClick={() => setShowCleanup(true)} className="btn-secondary text-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          Cleanup
        </button>
      </div>

      {/* Contacts Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-black/[0.07]">
                <th className="table-header pl-5">Phone Number</th>
                <th className="table-header">Name</th>
                <th className="table-header">Status</th>
                <th className="table-header text-center">Attempts</th>
                <th className="table-header">Last Result</th>
                <th className="table-header pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center text-[#64748B]">
                    <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    Loading contacts…
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-3">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B8BAA" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    </div>
                    <div className="text-white font-medium mb-1">No contacts found</div>
                    <div className="text-sm text-[#64748B]">Paste numbers, upload a CSV, or add one manually</div>
                  </td>
                </tr>
              ) : (
                contacts.map(c => (
                  <tr key={c.id} className="table-row">
                    <td className="table-cell pl-5 font-mono">{c.phone_number}</td>
                    <td className="table-cell text-[#64748B]">{c.contact_name || '—'}</td>
                    <td className="table-cell"><ContactBadge status={c.status} /></td>
                    <td className="table-cell text-center text-[#64748B]">{c.attempts}</td>
                    <td className="table-cell text-[#64748B] text-xs">{c.last_result || '—'}</td>
                    <td className="table-cell pr-5 text-right">
                      <button
                        onClick={() => handleDeleteContact(c.id)}
                        className="w-7 h-7 rounded-lg hover:bg-red-500/20 flex items-center justify-center text-[#64748B] hover:text-red-400 transition ml-auto"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {contacts.length > 0 && (
          <div className="px-5 py-2.5 border-t border-black/[0.07] text-xs text-[#64748B]">
            {contacts.length} contact{contacts.length !== 1 ? 's' : ''} shown
          </div>
        )}
      </div>

      {/* ── Paste Numbers Modal ── */}
      <Modal show={showPaste} onClose={() => setShowPaste(false)} title="Paste Phone Numbers">
        <div className="space-y-4">
          <p className="text-sm text-[#64748B]">Paste phone numbers — one per line, or comma-separated. Duplicates are automatically skipped.</p>
          <textarea
            rows={10}
            className="input font-mono text-xs resize-none"
            placeholder={"+919876543210\n+918800001234\n919988229920"}
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
          />
          <div className="text-xs text-[#64748B]">
            {pasteText.split('\n').filter(l => l.replace(/[^0-9+]/g, '').length >= 5).length} valid numbers detected
          </div>
          <div className="flex gap-2">
            <button onClick={handlePasteImport} disabled={submitting || !pasteText.trim()} className="btn-primary flex-1">
              {submitting ? 'Importing…' : 'Import Numbers'}
            </button>
            <button onClick={() => setShowPaste(false)} className="btn-ghost">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* ── Upload CSV Modal ── */}
      <Modal show={showUpload} onClose={() => setShowUpload(false)} title="Upload CSV / TXT">
        <div className="space-y-4">
          <p className="text-sm text-[#64748B]">
            Upload a CSV or TXT file. Supported formats:<br />
            &bull; One number per line<br />
            &bull; CSV: <code className="bg-white/10 px-1 rounded text-xs">number,name</code> or just numbers<br />
            &bull; Duplicates are automatically skipped
          </p>
          <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed border-black/[0.07] rounded-xl p-8 cursor-pointer hover:border-red-500/40 hover:bg-red-500/5 transition ${submitting ? 'opacity-50 cursor-wait' : ''}`}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={handleFileUpload}
              disabled={submitting}
            />
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
              {submitting ? (
                <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8B8BAA" strokeWidth="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              )}
            </div>
            <div className="text-center">
              <div className="text-sm text-white">{submitting ? 'Importing…' : 'Click to select CSV or TXT file'}</div>
              <div className="text-xs text-[#64748B] mt-0.5">.csv, .txt</div>
            </div>
          </label>
          <button onClick={() => setShowUpload(false)} className="btn-ghost w-full">Cancel</button>
        </div>
      </Modal>

      {/* ── Add Contact Modal ── */}
      <Modal show={showAdd} onClose={() => setShowAdd(false)} title="Add Contact">
        <form onSubmit={handleAddContact} className="space-y-4">
          <div>
            <label className="label">Phone Number *</label>
            <input className="input font-mono" placeholder="+919876543210" required
              value={addForm.phone_number}
              onChange={e => setAddForm(f => ({ ...f, phone_number: e.target.value }))} />
          </div>
          <div>
            <label className="label">Name (optional)</label>
            <input className="input" placeholder="John Doe"
              value={addForm.contact_name}
              onChange={e => setAddForm(f => ({ ...f, contact_name: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={submitting || !addForm.phone_number.trim()} className="btn-primary flex-1">
              {submitting ? 'Adding…' : 'Add Contact'}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="btn-ghost">Cancel</button>
          </div>
        </form>
      </Modal>

      {/* ── Rename List Modal ── */}
      <Modal show={showRename} onClose={() => setShowRename(false)} title="Rename List">
        <div className="space-y-4">
          <div>
            <label className="label">New List Name</label>
            <input className="input" placeholder="My Contacts"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRenameList()}
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleRenameList} disabled={submitting || !renameValue.trim()} className="btn-primary flex-1">
              {submitting ? 'Saving…' : 'Rename'}
            </button>
            <button onClick={() => setShowRename(false)} className="btn-ghost">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* ── Cleanup Modal ── */}
      <Modal show={showCleanup} onClose={() => setShowCleanup(false)} title="Cleanup Contacts">
        <div className="space-y-4">
          <p className="text-sm text-[#64748B]">Choose a cleanup action for the current list: <strong className="text-white">{activeList?.list_name}</strong></p>
          <div className="space-y-2">
            {CLEANUP_MODES.map(m => (
              <label key={m.key} className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition border ${
                cleanupMode === m.key
                  ? 'bg-red-500/10 border-red-500/30 text-white'
                  : 'bg-white/5 border-black/[0.07] text-[#64748B] hover:text-white hover:bg-white/10'
              }`}>
                <input type="radio" name="cleanupMode" checked={cleanupMode === m.key}
                  onChange={() => setCleanupMode(m.key)} className="accent-red-500" />
                {m.label}
              </label>
            ))}
          </div>

          {cleanupMode === 'replace_from_text' && (
            <div>
              <label className="label">Paste New Numbers</label>
              <textarea rows={6} className="input font-mono text-xs resize-none"
                placeholder="+919876543210&#10;+918800001234"
                value={cleanupText}
                onChange={e => setCleanupText(e.target.value)}
              />
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleCleanup} disabled={submitting} className="btn-danger flex-1">
              {submitting ? 'Processing…' : 'Confirm Cleanup'}
            </button>
            <button onClick={() => setShowCleanup(false)} className="btn-ghost">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
