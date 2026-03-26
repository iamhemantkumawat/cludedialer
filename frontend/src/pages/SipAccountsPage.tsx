import { useEffect, useState } from "react";
import { jsonRequest } from "../app/api";
import { useDialer } from "../app/context";
import type { SipAccount, SipFormState } from "../app/types";
import { Modal } from "../components/Modal";

const DEFAULT_FORM: SipFormState = {
  name: "",
  channel_type: "SIP",
  domain: "",
  username: "",
  password: "",
  caller_id: "",
  port: 5060,
};

export function SipAccountsPage() {
  const { sipAccounts, refreshSipAccounts, syncMagnusSipAccounts, notify } = useDialer();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SipAccount | null>(null);
  const [form, setForm] = useState<SipFormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // On page load: silently sync Magnus accounts, then show results
  useEffect(() => {
    setSyncing(true);
    syncMagnusSipAccounts()
      .catch(() => refreshSipAccounts())
      .finally(() => setSyncing(false));
  }, []);

  function openModal(account?: SipAccount) {
    setEditing(account || null);
    setForm(
      account
        ? { name: account.name, channel_type: account.channel_type, domain: account.domain, username: account.username, password: account.password, caller_id: account.caller_id, port: account.port || 5060 }
        : DEFAULT_FORM,
    );
    setModalOpen(true);
  }

  async function handleSave(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!form.name.trim()) { notify("Name is required", "error"); return; }
    if (!form.domain.trim()) { notify("Domain/server is required", "error"); return; }
    if (!form.password.trim()) { notify("Password is required for external accounts", "error"); return; }
    setSaving(true);
    try {
      const path = editing ? `/api/sip/${editing.id}` : "/api/sip";
      const method = editing ? "PUT" : "POST";
      await jsonRequest(path, method, form);
      await refreshSipAccounts();
      notify(editing ? "Account updated" : "External account added", "success");
      setModalOpen(false);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to save account", "error");
    } finally { setSaving(false); }
  }

  async function handleDelete(account: SipAccount) {
    if (!window.confirm(`Delete "${account.name}"?`)) return;
    try {
      await jsonRequest(`/api/sip/${account.id}`, "DELETE");
      await refreshSipAccounts();
      notify("Account deleted", "success");
    } catch (err) { notify(err instanceof Error ? err.message : "Failed to delete", "error"); }
  }

  async function handleRefreshMagnus() {
    setSyncing(true);
    try {
      await syncMagnusSipAccounts();
      notify("MagnusBilling accounts refreshed", "success");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Refresh failed", "error");
    } finally { setSyncing(false); }
  }

  const magnusAccounts = sipAccounts.filter((a) => a.source === "magnus");
  const externalAccounts = sipAccounts.filter((a) => a.source !== "magnus");

  return (
    <section className="section active">
      <div className="page-header">
        <div>
          <div className="page-title">SIP Accounts</div>
          <div className="contacts-page-subtitle">
            MagnusBilling accounts are synced automatically. Add external accounts for other SIP servers.
          </div>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => openModal()}>
          + Add External Account
        </button>
      </div>

      <div className="page-body">
        {/* ── MagnusBilling section ── */}
        <div className="sip-section">
          <div className="sip-section__head">
            <div className="sip-section__title">
              <span className="sip-source-badge sip-source-badge--magnus">MagnusBilling</span>
              <span className="c-dim" style={{ fontSize: 13 }}>
                {magnusAccounts.length} account{magnusAccounts.length !== 1 ? "s" : ""}
              </span>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => void handleRefreshMagnus()}
              disabled={syncing}
            >
              {syncing ? "Syncing…" : "↻ Refresh"}
            </button>
          </div>

          {syncing && !magnusAccounts.length ? (
            <div className="sip-syncing-row">
              <span className="c-dim">Syncing from MagnusBilling…</span>
            </div>
          ) : magnusAccounts.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>SIP User</th>
                    <th>Caller ID</th>
                    <th>Channel</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {magnusAccounts.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{a.username || a.domain}</div>
                        <div className="c-dim" style={{ fontSize: 12 }}>{a.name}</div>
                      </td>
                      <td className="mono">{a.caller_id || "—"}</td>
                      <td className="mono c-dim" style={{ fontSize: 12 }}>
                        {a.channel_type}/{a.domain}/&lt;number&gt;
                      </td>
                      <td>
                        <button className="btn btn-danger btn-sm" type="button" onClick={() => void handleDelete(a)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="sip-empty">No SIP accounts found in MagnusBilling for this user.</div>
          )}
        </div>

        {/* ── External accounts section ── */}
        <div className="sip-section">
          <div className="sip-section__head">
            <div className="sip-section__title">
              <span className="sip-source-badge sip-source-badge--external">External</span>
              <span className="c-dim" style={{ fontSize: 13 }}>
                {externalAccounts.length} account{externalAccounts.length !== 1 ? "s" : ""}
              </span>
            </div>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => openModal()}>
              + Add
            </button>
          </div>

          {externalAccounts.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Server / Domain</th>
                    <th>Username</th>
                    <th>Caller ID</th>
                    <th>Channel</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {externalAccounts.map((a) => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600 }}>{a.name}</td>
                      <td className="mono">{a.domain}{a.port && a.port !== 5060 ? `:${a.port}` : ""}</td>
                      <td className="mono">{a.username || "—"}</td>
                      <td className="mono">{a.caller_id || "—"}</td>
                      <td className="mono c-dim" style={{ fontSize: 12 }}>
                        {a.channel_type}/{a.domain}/&lt;number&gt;
                      </td>
                      <td>
                        <div className="flex-center">
                          <button className="btn btn-ghost btn-sm" type="button" onClick={() => openModal(a)}>Edit</button>
                          <button className="btn btn-danger btn-sm" type="button" onClick={() => void handleDelete(a)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="sip-empty">
              No external accounts yet. Use <strong>+ Add External Account</strong> to connect a SIP server from another provider.
            </div>
          )}
        </div>
      </div>

      <Modal
        open={modalOpen}
        title={editing ? "Edit External Account" : "Add External Account"}
        maxWidth={520}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button className="btn btn-ghost" type="button" onClick={() => setModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" type="submit" form="sip-form" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <form id="sip-form" onSubmit={handleSave}>
          <div className="form-group">
            <label htmlFor="sip-name">Account Name *</label>
            <input id="sip-name" value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
              placeholder="e.g. Twilio US" required />
          </div>

          <div className="form-group">
            <label htmlFor="sip-domain">SIP Server / Domain *</label>
            <input id="sip-domain" value={form.domain} onChange={(e) => setForm((c) => ({ ...c, domain: e.target.value }))}
              placeholder="e.g. sip.twilio.com or asterisk-peer-name" required />
            <div className="form-hint">
              {form.channel_type === "SIP"
                ? "Asterisk SIP peer name — channel: SIP/&lt;peer&gt;/&lt;number&gt;"
                : "PJSIP endpoint — channel: PJSIP/&lt;number&gt;@&lt;endpoint&gt;"}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="sip-type">Channel Technology</label>
            <select id="sip-type" value={form.channel_type}
              onChange={(e) => setForm((c) => ({ ...c, channel_type: e.target.value as "SIP" | "PJSIP" }))}>
              <option value="SIP">SIP (chan_sip)</option>
              <option value="PJSIP">PJSIP (chan_pjsip)</option>
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="sip-user">Username *</label>
              <input id="sip-user" value={form.username} onChange={(e) => setForm((c) => ({ ...c, username: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label htmlFor="sip-pass">Password *</label>
              <input id="sip-pass" type="password" value={form.password}
                onChange={(e) => setForm((c) => ({ ...c, password: e.target.value }))} required />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="sip-caller-id">Caller ID</label>
              <input id="sip-caller-id" value={form.caller_id}
                onChange={(e) => setForm((c) => ({ ...c, caller_id: e.target.value }))} placeholder="+14155551234" />
            </div>
            <div className="form-group">
              <label htmlFor="sip-port">Port</label>
              <input id="sip-port" type="number" value={form.port}
                onChange={(e) => setForm((c) => ({ ...c, port: parseInt(e.target.value, 10) || 5060 }))} />
            </div>
          </div>
        </form>
      </Modal>
    </section>
  );
}
