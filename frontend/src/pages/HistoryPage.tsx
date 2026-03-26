import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { requestJson } from "../app/api";
import { useDialer } from "../app/context";
import type { CallHistoryResponse, CallHistoryResult } from "../app/types";
import { FAILED_GROUP_STATUSES, HISTORY_FILTERS, formatDuration, formatTimestamp, percentage } from "../app/utils";

const HISTORY_LIMIT = 50;

export function HistoryPage() {
  const { campaigns, ivrs, refreshCampaigns, refreshIvrs, notify } = useDialer();
  const [searchParams, setSearchParams] = useSearchParams();
  const [flowFilter, setFlowFilter] = useState("");
  const [page, setPage] = useState(1);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [results, setResults] = useState<CallHistoryResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const statusFilter = searchParams.get("status") || "";

  useEffect(() => {
    void Promise.allSettled([refreshCampaigns(), refreshIvrs()]).then((results) => {
      const rejected = results.find((result) => result.status === "rejected");
      if (rejected?.status === "rejected") {
        notify(rejected.reason instanceof Error ? rejected.reason.message : "Failed to load call flows", "error");
      }
    });
  }, []);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, flowFilter]);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setLoading(true);
      try {
        let url = `/api/calls?limit=${HISTORY_LIMIT}&page=${page}`;
        if (flowFilter) {
          url += `&campaign_id=${encodeURIComponent(flowFilter)}`;
        }
        if (statusFilter && statusFilter !== "failed-group") {
          url += `&status=${encodeURIComponent(statusFilter)}`;
        }

        const data = await requestJson<CallHistoryResponse>(url);
        if (cancelled) return;

        const nextResults =
          statusFilter === "failed-group"
            ? data.results.filter((result) => FAILED_GROUP_STATUSES.includes(result.status))
            : data.results;

        setResults(nextResults);
        setTotal(data.total);
      } catch (error) {
        if (cancelled) return;
        notify(error instanceof Error ? error.message : "Failed to load history", "error");
        setResults([]);
        setTotal(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [page, flowFilter, statusFilter, reloadNonce]);

  const answeredRows = results.filter((result) => result.status === "answered");
  const totalDuration = answeredRows.reduce((sum, result) => sum + (Number(result.duration) || 0), 0);
  const answerRate = percentage(answeredRows.length, results.length);
  const averageDuration = answeredRows.length ? Math.round(totalDuration / answeredRows.length) : 0;
  const totalPages = Math.max(1, Math.ceil(total / HISTORY_LIMIT));
  const flows = [...campaigns, ...ivrs].sort((a, b) => a.name.localeCompare(b.name));
  const flowMap = new Map(flows.map((flow) => [flow.id, flow.name]));

  return (
    <section className="section active">
      <div className="page-header">
        <div className="page-title">CDR — Call Detail Records</div>
        <div className="header-actions header-actions--wrap">
          <select
            value={flowFilter}
            onChange={(event) => setFlowFilter(event.target.value)}
            style={{ width: 180 }}
          >
            <option value="">All Flows</option>
            <optgroup label="Campaigns">
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="IVRs">
              {ivrs.map((ivr) => (
                <option key={ivr.id} value={ivr.id}>
                  {ivr.name}
                </option>
              ))}
            </optgroup>
          </select>

          {HISTORY_FILTERS.map((filter) => {
            const active = statusFilter === filter.value || (!statusFilter && filter.value === "");
            return (
              <button
                key={filter.value || "all"}
                className={`btn ${active ? "btn-primary" : "btn-ghost"} btn-sm`}
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  if (filter.value) next.set("status", filter.value);
                  else next.delete("status");
                  setSearchParams(next);
                }}
              >
                {filter.label}
              </button>
            );
          })}

          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => {
              setPage(1);
              setReloadNonce((current) => current + 1);
            }}
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </div>

      <div className="page-body">
        <div className="grid-4 mb-16">
          <div className="stat-card">
            <div className="stat-label">Total Calls</div>
            <div className="stat-val">{total}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Answered</div>
            <div className="stat-val c-green">
              {answeredRows.length}
              {results.length < total ? "+" : ""}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Answer Rate</div>
            <div className="stat-val c-blue">{answerRate}%</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Avg Duration</div>
            <div className="stat-val c-yellow">{formatDuration(averageDuration)}</div>
          </div>
        </div>

        <div className="table-wrap mb-12">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Phone Number</th>
                <th>Caller ID</th>
                <th>Flow</th>
                <th>Status</th>
                <th>SIP Cause</th>
                <th>DTMF</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="table-empty">
                    Loading…
                  </td>
                </tr>
              ) : results.length ? (
                results.map((result) => {
                  const duration = Number(result.duration) || 0;
                  return (
                    <tr key={result.id}>
                      <td className="mono">{formatTimestamp(result.called_at)}</td>
                      <td className="mono history-phone">{result.phone_number}</td>
                      <td className="c-dim">{result.caller_id || "—"}</td>
                      <td>{flowMap.get(result.campaign_id) || result.campaign_id.slice(0, 8)}</td>
                      <td>
                        <span className={`badge badge-${result.status}`}>{result.status}</span>
                      </td>
                      <td>{result.cause_txt ? <span className="c-dim">{result.cause_txt}</span> : "—"}</td>
                      <td>{result.dtmf && result.dtmf !== "NONE" ? <strong className="c-blue">{result.dtmf}</strong> : "—"}</td>
                      <td>{duration > 0 || result.status === "answered" ? formatDuration(duration) : "—"}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="table-empty">
                    No records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex-center pager-row">
          <button className="btn btn-ghost btn-sm" type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
            ← Prev
          </button>
          <span className="c-dim">
            Page {page} / {totalPages} ({total} total)
          </span>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            Next →
          </button>
        </div>
      </div>
    </section>
  );
}
