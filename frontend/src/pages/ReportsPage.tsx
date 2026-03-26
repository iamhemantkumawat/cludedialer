import { useEffect, useState } from "react";
import { requestJson } from "../app/api";
import { useDialer } from "../app/context";
import { formatDuration, formatTimestamp, percentage } from "../app/utils";
import type { CallStatus } from "../app/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlowSummary {
  id: string;
  name: string;
  flow_type: "campaign" | "ivr";
  status: string;
  created_at: string;
  contact_total: number;
  contact_pending: number;
  contact_answered: number;
  contact_busy: number;
  contact_no_answer: number;
  contact_failed: number;
  dtmf_count: number;
  avg_duration: number;
  total_duration: number;
}

interface DtmfRow {
  dtmf: string;
  count: number;
}

interface RecentCall {
  id: string;
  phone_number: string;
  status: CallStatus;
  dtmf: string | null;
  duration: number;
  caller_id: string | null;
  cause_txt: string | null;
  called_at: string;
}

interface FlowDetail {
  flow: FlowSummary;
  contacts: {
    total: number;
    pending: number;
    calling: number;
    answered: number;
    busy: number;
    no_answer: number;
    failed: number;
  };
  dtmf: DtmfRow[];
  duration: { avg: number; total: number; max: number };
  recentCalls: RecentCall[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: string) {
  if (status === "running") return "c-green";
  if (status === "paused") return "c-yellow";
  if (status === "completed") return "c-blue";
  if (status === "stopped") return "c-red";
  return "c-dim";
}

function answerRateBar(answered: number, total: number) {
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  return (
    <div className="report-bar-wrap">
      <div className="report-bar">
        <div className="report-bar__fill report-bar__fill--green" style={{ width: `${pct}%` }} />
      </div>
      <span className="report-bar-label">{pct}%</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ReportsPage() {
  const { notify } = useDialer();
  const [summaries, setSummaries] = useState<FlowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<FlowDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"" | "campaign" | "ivr">("");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    requestJson<FlowSummary[]>("/api/reports/summary")
      .then((data) => {
        if (!cancelled) setSummaries(data);
      })
      .catch((err) => {
        if (!cancelled) notify(err instanceof Error ? err.message : "Failed to load reports", "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [nonce]);

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    let cancelled = false;
    setDetailLoading(true);
    requestJson<FlowDetail>(`/api/reports/${selected}`)
      .then((data) => { if (!cancelled) setDetail(data); })
      .catch((err) => { if (!cancelled) notify(err instanceof Error ? err.message : "Failed to load detail", "error"); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);

  const filtered = summaries.filter((s) => !typeFilter || s.flow_type === typeFilter);

  return (
    <section className="section active">
      <div className="page-header">
        <div className="page-title">Campaign Reports</div>
        <div className="header-actions">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "" | "campaign" | "ivr")}
            style={{ width: 140 }}
          >
            <option value="">All Flows</option>
            <option value="campaign">Campaigns only</option>
            <option value="ivr">IVR only</option>
          </select>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            title="Refresh"
            onClick={() => { setNonce((n) => n + 1); setDetail(null); setSelected(null); }}
          >
            ↻
          </button>
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="table-empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="table-empty">No campaigns found. Run a campaign first.</div>
        ) : (
          <div className="reports-layout">
            {/* ── Left: campaign list ── */}
            <div className="reports-list">
              {filtered.map((s) => {
                const dialed = s.contact_total - s.contact_pending;
                const pct = s.contact_total > 0 ? Math.round((s.contact_answered / s.contact_total) * 100) : 0;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`report-card${selected === s.id ? " report-card--active" : ""}`}
                    onClick={() => setSelected(s.id === selected ? null : s.id)}
                  >
                    <div className="report-card__top">
                      <div className="report-card__name">{s.name}</div>
                      <span className={`badge badge-sm ${s.flow_type === "ivr" ? "badge-blue" : "badge-purple"}`}>
                        {s.flow_type.toUpperCase()}
                      </span>
                    </div>
                    <div className="report-card__status">
                      <span className={`report-status-dot report-status-dot--${s.status}`} />
                      <span className={`report-card__status-text ${statusColor(s.status)}`}>{s.status}</span>
                      <span className="c-dim report-card__date">{formatTimestamp(s.created_at).slice(0, 10)}</span>
                    </div>
                    <div className="report-card__mini-stats">
                      <span className="c-green">✓ {s.contact_answered}</span>
                      <span className="c-dim">/ {s.contact_total} total</span>
                      {s.dtmf_count > 0 && <span className="c-blue">· {s.dtmf_count} DTMF</span>}
                    </div>
                    {s.contact_total > 0 && (
                      <div className="report-mini-bar">
                        <div
                          className="report-mini-bar__fill"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Right: detail panel ── */}
            <div className="reports-detail">
              {!selected ? (
                <div className="reports-detail__empty">
                  <div className="reports-detail__empty-icon">📊</div>
                  <div>Select a campaign to view its report</div>
                </div>
              ) : detailLoading ? (
                <div className="reports-detail__empty">Loading…</div>
              ) : detail ? (
                <DetailPanel detail={detail} />
              ) : null}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ detail }: { detail: FlowDetail }) {
  const { flow, contacts, dtmf, duration, recentCalls } = detail;
  const dialed = contacts.total - contacts.pending - contacts.calling;
  const answerRate = percentage(contacts.answered, dialed || contacts.total);
  const failedTotal = contacts.busy + contacts.no_answer + contacts.failed;

  return (
    <div className="report-detail">
      <div className="report-detail__header">
        <div>
          <div className="report-detail__title">{flow.name}</div>
          <div className="report-detail__sub">
            <span className={`report-status-dot report-status-dot--${flow.status}`} />
            <span className={statusColor(flow.status)}>{flow.status}</span>
            <span className="c-dim"> · {flow.flow_type.toUpperCase()} · Created {formatTimestamp(flow.created_at).slice(0, 10)}</span>
          </div>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid-4 mb-16">
        <div className="stat-card">
          <div className="stat-label">Total Numbers</div>
          <div className="stat-val">{contacts.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Dialed</div>
          <div className="stat-val c-blue">{dialed}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Answered</div>
          <div className="stat-val c-green">{contacts.answered}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Answer Rate</div>
          <div className="stat-val c-green">{answerRate}%</div>
        </div>
      </div>

      <div className="grid-4 mb-16">
        <div className="stat-card">
          <div className="stat-label">No Answer</div>
          <div className="stat-val c-yellow">{contacts.no_answer}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Busy</div>
          <div className="stat-val c-yellow">{contacts.busy}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Failed</div>
          <div className="stat-val c-red">{contacts.failed}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Remaining</div>
          <div className="stat-val c-dim">{contacts.pending + contacts.calling}</div>
        </div>
      </div>

      {/* ── Call duration + DTMF row ── */}
      <div className="report-two-col mb-16">
        <div className="stat-card">
          <div className="stat-label">Avg Call Duration</div>
          <div className="stat-val c-blue">{formatDuration(duration.avg)}</div>
          <div className="c-dim" style={{ fontSize: "0.78rem", marginTop: 4 }}>
            Total: {formatDuration(duration.total)} · Max: {formatDuration(duration.max)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">DTMF / Callbacks</div>
          <div className="stat-val c-blue">{dtmf.reduce((s, r) => s + Number(r.count), 0)}</div>
          <div className="c-dim" style={{ fontSize: "0.78rem", marginTop: 4 }}>
            {dtmf.length > 0
              ? dtmf.map((r) => `Key ${r.dtmf}: ${r.count}`).join(" · ")
              : "No DTMF presses recorded"}
          </div>
        </div>
      </div>

      {/* ── Visual bar ── */}
      {contacts.total > 0 && (
        <div className="report-stacked-bar mb-16">
          {contacts.answered > 0 && (
            <div
              className="report-stacked-bar__seg report-stacked-bar__seg--green"
              style={{ width: `${percentage(contacts.answered, contacts.total)}%` }}
              title={`Answered: ${contacts.answered}`}
            />
          )}
          {contacts.busy > 0 && (
            <div
              className="report-stacked-bar__seg report-stacked-bar__seg--yellow"
              style={{ width: `${percentage(contacts.busy, contacts.total)}%` }}
              title={`Busy: ${contacts.busy}`}
            />
          )}
          {contacts.no_answer > 0 && (
            <div
              className="report-stacked-bar__seg report-stacked-bar__seg--orange"
              style={{ width: `${percentage(contacts.no_answer, contacts.total)}%` }}
              title={`No Answer: ${contacts.no_answer}`}
            />
          )}
          {contacts.failed > 0 && (
            <div
              className="report-stacked-bar__seg report-stacked-bar__seg--red"
              style={{ width: `${percentage(contacts.failed, contacts.total)}%` }}
              title={`Failed: ${contacts.failed}`}
            />
          )}
        </div>
      )}
      <div className="report-bar-legend mb-16">
        <span className="report-legend-dot report-legend-dot--green" /> Answered ({contacts.answered})
        <span className="report-legend-dot report-legend-dot--yellow" /> Busy ({contacts.busy})
        <span className="report-legend-dot report-legend-dot--orange" /> No Answer ({contacts.no_answer})
        <span className="report-legend-dot report-legend-dot--red" /> Failed ({contacts.failed})
        {(contacts.pending + contacts.calling) > 0 && (
          <><span className="report-legend-dot report-legend-dot--grey" /> Remaining ({contacts.pending + contacts.calling})</>
        )}
      </div>

      {/* ── DTMF breakdown table ── */}
      {dtmf.length > 0 && (
        <>
          <div className="report-section-title">DTMF Key Presses / Callbacks</div>
          <div className="table-wrap mb-16">
            <table>
              <thead>
                <tr>
                  <th>Key Pressed</th>
                  <th>Count</th>
                  <th>% of Answered</th>
                </tr>
              </thead>
              <tbody>
                {dtmf.map((row) => (
                  <tr key={row.dtmf}>
                    <td><strong className="c-blue">Key {row.dtmf}</strong></td>
                    <td>{row.count}</td>
                    <td>{contacts.answered > 0 ? `${Math.round((row.count / contacts.answered) * 100)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Recent calls table ── */}
      {recentCalls.length > 0 && (
        <>
          <div className="report-section-title">Recent Calls (last {recentCalls.length})</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>DTMF</th>
                  <th>Duration</th>
                  <th>Cause</th>
                </tr>
              </thead>
              <tbody>
                {recentCalls.map((call) => (
                  <tr key={call.id}>
                    <td className="mono">{formatTimestamp(call.called_at)}</td>
                    <td className="mono">{call.phone_number}</td>
                    <td><span className={`badge badge-${call.status}`}>{call.status}</span></td>
                    <td>
                      {call.dtmf && call.dtmf !== "NONE"
                        ? <strong className="c-blue">Key {call.dtmf}</strong>
                        : "—"}
                    </td>
                    <td>{call.duration > 0 ? formatDuration(call.duration) : "—"}</td>
                    <td className="c-dim">{call.cause_txt || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
