import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { accountHeaders, jsonRequest, requestJson, withAccountQuery } from "../app/api";
import { useDialer } from "../app/context";
import type { QueueMonitorResponse } from "../app/types";
import { AudioPreview } from "../components/AudioPreview";
import { TtsPreviewButton } from "../components/TtsPreviewButton";
import { fmtWait, formatDuration, ivrNodePromptLabel, parseIvrDefinition } from "../app/utils";

const AGENT_STATUS_LABEL: Record<
  string,
  { label: string; className: string }
> = {
  free: { label: "Free", className: "agent-free" },
  "in-call": { label: "In Call", className: "agent-in-call" },
  ringing: { label: "Ringing", className: "agent-ringing" },
  busy: { label: "Busy", className: "agent-busy" },
  offline: { label: "Offline", className: "agent-offline" },
  paused: { label: "Paused", className: "agent-busy" },
  unknown: { label: "Unknown", className: "agent-offline" },
};

export function RunCampaignPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    user,
    campaigns,
    ivrs,
    contactLists,
    sipAccounts,
    activeCalls,
    eventFeed,
    dtmfFeed,
    refreshCampaigns,
    refreshIvrs,
    refreshContactLists,
    refreshSipAccounts,
    refreshActiveCalls,
    clearEventFeed,
    clearDtmfFeed,
    notify,
    subscription,
  } = useDialer();
  const [selectedListId, setSelectedListId] = useState("");
  const [selectedSipId, setSelectedSipId] = useState("");
  const [monitorRate, setMonitorRate] = useState(5);
  const [queueMonitor, setQueueMonitor] = useState<QueueMonitorResponse | null>(null);
  const [now, setNow] = useState(Date.now());

  const selectedFlowId = searchParams.get("flowId") || searchParams.get("campaignId") || "";
  const flows = [...campaigns, ...ivrs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const selectedFlow = flows.find((flow) => flow.id === selectedFlowId) || null;
  const selectedList = contactLists.find((list) => String(list.id) === selectedListId) || null;

  useEffect(() => {
    void Promise.allSettled([
      refreshCampaigns(),
      refreshIvrs(),
      refreshContactLists(),
      refreshSipAccounts(),
      refreshActiveCalls(),
    ]);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedFlowId && flows.length) {
      const liveFlow = flows.find((flow) => flow.status === "running" || flow.status === "paused");
      if (liveFlow) {
        setSearchParams((current) => {
          const next = new URLSearchParams(current);
          next.set("flowId", liveFlow.id);
          next.delete("campaignId");
          return next;
        });
      }
    }
  }, [flows, selectedFlowId]);

  useEffect(() => {
    if (selectedFlow?.sip_account_id && selectedFlow.sip_account_id !== "__none__") {
      setSelectedSipId(selectedFlow.sip_account_id);
    }
  }, [selectedFlow?.id]);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;

    async function loadQueueMonitor() {
      try {
        const data = await requestJson<QueueMonitorResponse>(withAccountQuery("/api/queue/monitor", user), {
          headers: accountHeaders(user),
        });
        if (!cancelled) {
          setQueueMonitor(data);
        }
      } catch (error) {
        if (!cancelled) {
          notify(error instanceof Error ? error.message : "Failed to load queue monitor", "error");
        }
      }
    }

    void loadQueueMonitor();
    const interval = monitorRate > 0 ? window.setInterval(() => void loadQueueMonitor(), monitorRate * 1000) : null;

    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
    };
  }, [user?.username, monitorRate]);

  async function handleStartOrResume() {
    if (!selectedFlowId || !selectedFlow) {
      notify("Select a campaign or IVR", "error");
      return;
    }
    if (!selectedSipId) {
      notify("Select a SIP account", "error");
      return;
    }

    try {
      const basePath = selectedFlow.flow_type === "ivr" ? `/api/ivrs/${selectedFlowId}` : `/api/campaigns/${selectedFlowId}`;
      await jsonRequest(`${basePath}/start`, "POST", {
        sip_account_id: selectedSipId,
        ...(selectedListId ? { contact_list_id: selectedListId } : {}),
      });
      await Promise.allSettled([refreshCampaigns(), refreshIvrs()]);
      const flowLabel = selectedFlow.flow_type === "ivr" ? "IVR" : "Campaign";
      notify(selectedFlow.status === "paused" ? `${flowLabel} resumed` : `${flowLabel} started`, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to start flow", "error");
    }
  }

  async function handleRunAction(action: "pause" | "stop") {
    if (!selectedFlowId || !selectedFlow) return;
    try {
      const basePath = selectedFlow.flow_type === "ivr" ? `/api/ivrs/${selectedFlowId}` : `/api/campaigns/${selectedFlowId}`;
      await jsonRequest(`${basePath}/${action}`, "POST");
      await Promise.allSettled([refreshCampaigns(), refreshIvrs()]);
      const actionLabel = action === "pause" ? "paused" : "stopped";
      notify(`${selectedFlow.flow_type === "ivr" ? "IVR" : "Campaign"} ${actionLabel}`, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : `Failed to ${action} flow`, "error");
    }
  }

  const progress = selectedFlow?.total_numbers
    ? Math.round((selectedFlow.dialed / selectedFlow.total_numbers) * 100)
    : 0;

  const queueAgents = queueMonitor?.agents || [];
  const queueCallers = queueMonitor?.callers || [];
  const freeAgents = queueAgents.filter((agent) => agent.status === "free").length;
  const runState = selectedFlow?.status === "running" ? "running" : selectedFlow?.status === "paused" ? "paused" : null;
  const selectedIvrDefinition = selectedFlow?.flow_type === "ivr" ? parseIvrDefinition(selectedFlow.ivr_definition) : null;
  const selectedRootNode = selectedIvrDefinition
    ? (selectedIvrDefinition.nodes.find((node) => node.id === selectedIvrDefinition.root_node_id) || selectedIvrDefinition.nodes[0] || null)
    : null;

  return (
    <section className="section active">
      <div className="page-header">
        <div className="page-title">Run Campaign / IVR</div>
        <div className="flex-center">
          {runState === "running" ? <div className="pulse-dot green" /> : null}
          <span className="c-dim">{runState === "running" ? "Flow running" : runState === "paused" ? "Paused" : ""}</span>
        </div>
      </div>

      <div className="page-body">
        <div className="run-layout">
          <div className="stack-12">
            <div className="run-panel">
              <div className="run-panel-hdr">⚙️ Setup</div>
              <div className="run-panel-body">
                <div className="form-group">
                  <label htmlFor="run-campaign-select">Select Campaign or IVR</label>
                  <select
                    id="run-campaign-select"
                    value={selectedFlowId}
                    onChange={(event) => {
                      const next = new URLSearchParams(searchParams);
                      if (event.target.value) next.set("flowId", event.target.value);
                      else next.delete("flowId");
                      next.delete("campaignId");
                      setSearchParams(next);
                    }}
                  >
                    <option value="">-- choose --</option>
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
                </div>

                {selectedFlow ? (
                  <div className="run-preview">
                    <hr />
                    <div className="preview-row">
                      <span className="preview-label">Flow Type</span>
                      <span>{selectedFlow.flow_type === "ivr" ? "Interactive IVR" : "Standard Campaign"}</span>
                    </div>
                    <div className="preview-row">
                      <span className="preview-label">Audio</span>
                      <span>
                        {selectedFlow.flow_type === "ivr"
                          ? selectedRootNode
                            ? ivrNodePromptLabel(selectedRootNode)
                            : "No IVR prompt"
                          : selectedFlow.audio_type === "tts"
                            ? "TTS message"
                            : selectedFlow.audio_file || "None"}
                      </span>
                    </div>
                    <div className="preview-row">
                      <span className="preview-label">Concurrent</span>
                      <span>{selectedFlow.concurrent_calls} calls</span>
                    </div>
                    <div className="preview-row">
                      <span className="preview-label">Retry</span>
                      <span>{selectedFlow.retry_attempts} retries</span>
                    </div>
                    <div className="preview-row">
                      <span className="preview-label">Timeout</span>
                      <span>{selectedFlow.call_timeout}s</span>
                    </div>
                    {selectedFlow.flow_type === "ivr" ? (
                      <>
                        <div className="preview-row">
                          <span className="preview-label">Start Menu</span>
                          <span>{selectedRootNode?.name || "Menu 1"}</span>
                        </div>
                        <div className="preview-row">
                          <span className="preview-label">Menus</span>
                          <span>{selectedIvrDefinition?.nodes.length || 0} node(s)</span>
                        </div>
                      </>
                    ) : (
                      <div className="preview-row">
                        <span className="preview-label">DTMF digits</span>
                        <span>{selectedFlow.dtmf_digits} digit(s)</span>
                      </div>
                    )}

                    {selectedFlow.flow_type === "campaign" && selectedFlow.audio_type === "upload" && selectedFlow.audio_file ? (
                      <AudioPreview compact fileName={selectedFlow.audio_file} label="Campaign Audio" />
                    ) : null}
                    {selectedFlow.flow_type === "campaign" && selectedFlow.audio_type === "tts" && selectedFlow.tts_text ? (
                      <div className="preview-tts">
                        <TtsPreviewButton text={selectedFlow.tts_text} language={selectedFlow.tts_language || "en-US"} />
                      </div>
                    ) : null}
                    {selectedFlow.flow_type === "ivr" && selectedRootNode?.audio_type === "upload" && selectedRootNode.audio_file ? (
                      <AudioPreview compact fileName={selectedRootNode.audio_file} label="Start Menu Audio" />
                    ) : null}
                    {selectedFlow.flow_type === "ivr" && selectedRootNode?.audio_type === "tts" && selectedRootNode.tts_text ? (
                      <div className="preview-tts">
                        <TtsPreviewButton text={selectedRootNode.tts_text} language={selectedRootNode.tts_language || "en-US"} />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="form-group">
                  <label htmlFor="run-list-select">Contact List</label>
                  <select
                    id="run-list-select"
                    value={selectedListId}
                    onChange={(event) => setSelectedListId(event.target.value)}
                  >
                    <option value="">-- choose --</option>
                    {contactLists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.list_name} ({list.contact_count})
                      </option>
                    ))}
                  </select>
                  <div className="form-hint">{selectedList ? `${selectedList.contact_count} contacts` : ""}</div>
                </div>

                <div className="form-group">
                  <label htmlFor="run-sip-select">SIP Account</label>
                  <select
                    id="run-sip-select"
                    value={selectedSipId}
                    onChange={(event) => setSelectedSipId(event.target.value)}
                  >
                    <option value="">-- choose --</option>
                    {sipAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} — {account.domain}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {subscription !== null && !subscription.active ? (
              <div className="sub-lock-banner">
                <span className="sub-lock-banner__icon">🔒</span>
                <div>
                  No active subscription. <Link to="/subscription">Activate a plan</Link> to run campaigns.
                </div>
              </div>
            ) : null}
            <div className="run-actions">
              {runState !== "running" ? (
                subscription !== null && !subscription.active ? (
                  <button className="btn btn-primary run-actions__primary" type="button" disabled>
                    Subscribe to Run
                  </button>
                ) : (
                  <button className="btn btn-primary run-actions__primary" type="button" onClick={() => void handleStartOrResume()}>
                    {runState === "paused" ? "▶ Resume" : "▶ Start"}
                  </button>
                )
              ) : null}
              {runState === "running" ? (
                <button className="btn btn-yellow btn-sm" type="button" onClick={() => void handleRunAction("pause")}>
                  ⏸
                </button>
              ) : null}
              {runState ? (
                <button className="btn btn-danger btn-sm" type="button" onClick={() => void handleRunAction("stop")}>
                  ■
                </button>
              ) : null}
            </div>

            {runState && selectedFlow ? (
              <div className="run-panel">
                <div className="run-panel-hdr run-panel-hdr--between">
                  <span>{selectedFlow.name}</span>
                  <span className={`badge badge-${selectedFlow.status}`}>{selectedFlow.status}</span>
                </div>
                <div className="run-panel-body">
                  <div>
                    <div className="preview-row">
                      <span className="preview-label">Progress</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="progress progress-lg">
                      <div className="progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  <div className="grid-3 stats-grid--compact">
                    <div className="stat-card stat-card--compact">
                      <div className="stat-val">{selectedFlow.dialed}</div>
                      <div className="stat-label">Dialed</div>
                    </div>
                    <div className="stat-card stat-card--compact">
                      <div className="stat-val c-green">{selectedFlow.answered}</div>
                      <div className="stat-label">Answered</div>
                    </div>
                    <div className="stat-card stat-card--compact">
                      <div className="stat-val c-blue">{activeCalls.length}</div>
                      <div className="stat-label">Active</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="stack-12">
            <div className="feed">
              <div className="feed-hdr">
                <div className={`pulse-dot ${activeCalls.length ? "green" : "red"}`} />
                Live Calls
                <span className="ml-auto c-dim">{activeCalls.length} active</span>
              </div>
              <div className="feed-body">
                {activeCalls.length ? (
                  activeCalls.map((call) => {
                    const duration =
                      call.answered && call.startTime
                        ? Math.floor((now - call.startTime) / 1000)
                        : call.duration || 0;
                    return (
                      <div className="feed-row" key={call.actionId}>
                        <div className={`pulse-dot ${call.answered ? "green" : "gray"}`} />
                        <span className="mono feed-row__grow">{call.phone}</span>
                        <span className={`badge badge-${call.answered ? "answered" : "calling"}`}>
                          {call.answered ? "answered" : "ringing"}
                        </span>
                        <span className="c-dim">{call.answered ? formatDuration(duration) : "Ringing…"}</span>
                        {call.dtmf ? <span className="c-blue feed-row__dtmf">{call.dtmf}</span> : null}
                      </div>
                    );
                  })
                ) : (
                  <div className="feed-empty">No active calls</div>
                )}
              </div>
            </div>

            <div className="feed">
              <div className="feed-hdr">
                🎹 DTMF Feed
                <button className="btn btn-ghost btn-sm ml-auto" type="button" onClick={clearDtmfFeed}>
                  Clear
                </button>
              </div>
              <div className="feed-body">
                {dtmfFeed.length ? (
                  dtmfFeed.map((entry) => (
                    <div className="feed-row" key={entry.id}>
                      <span className="feed-time">{new Date(entry.time).toLocaleTimeString()}</span>
                      <span className="mono c-blue">{entry.phone}</span>
                      <span className="dtmf-chip">{entry.digits}</span>
                    </div>
                  ))
                ) : (
                  <div className="feed-empty">Waiting for DTMF…</div>
                )}
              </div>
            </div>

            <div className="feed">
              <div className="feed-hdr">
                📡 Event Log
                <button className="btn btn-ghost btn-sm ml-auto" type="button" onClick={clearEventFeed}>
                  Clear
                </button>
              </div>
              <div className="feed-body">
                {eventFeed.length ? (
                  eventFeed.map((entry) => (
                    <div className="feed-row" key={entry.id}>
                      <span className="feed-time">{new Date(entry.time).toLocaleTimeString()}</span>
                      <span className={`feed-message feed-message--${entry.tone}`}>{entry.message}</span>
                    </div>
                  ))
                ) : (
                  <div className="feed-empty">Waiting for events…</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="monitor-grid">
          <div className="monitor-panel">
            <div className="monitor-hdr">
              📋 Queue Monitor
              <span className="monitor-tag">{queueMonitor?.queue || ""}</span>
              <div className="refresh-rate">
                Auto-refresh
                <select value={monitorRate} onChange={(event) => setMonitorRate(Number(event.target.value))}>
                  <option value={5}>5s</option>
                  <option value={10}>10s</option>
                  <option value={30}>30s</option>
                  <option value={0}>Off</option>
                </select>
              </div>
            </div>
            <div className="monitor-body">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Caller ID</th>
                    <th>Wait Time</th>
                    <th>Channel</th>
                  </tr>
                </thead>
                <tbody>
                  {queueCallers.length ? (
                    queueCallers.map((caller) => (
                      <tr key={`${caller.position}-${caller.callerid}`}>
                        <td className="c-blue">{caller.position}</td>
                        <td className="mono">{caller.callerid}</td>
                        <td className="c-yellow">{fmtWait(caller.wait)}</td>
                        <td className="c-dim">{caller.channel.split("-")[0] || caller.channel}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="table-empty">
                        No callers in queue
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="monitor-panel">
            <div className="monitor-hdr">
              🎧 Agent Monitor
              <span className="monitor-tag monitor-tag--green">
                {freeAgents} free / {queueAgents.length} total
              </span>
            </div>
            <div className="monitor-body">
              <table>
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Username</th>
                    <th>Status</th>
                    <th>Calls</th>
                    <th>Last Call</th>
                  </tr>
                </thead>
                <tbody>
                  {queueAgents.length ? (
                    queueAgents.map((agent) => {
                      const status = AGENT_STATUS_LABEL[agent.paused ? "paused" : agent.status] || AGENT_STATUS_LABEL.unknown;
                      return (
                        <tr key={`${agent.username}-${agent.status}`}>
                          <td>{agent.name}</td>
                          <td className="mono">{agent.username}</td>
                          <td>
                            <span className={status.className}>{status.label}</span>
                          </td>
                          <td>{agent.callsTaken}</td>
                          <td className="c-dim">{agent.lastCall}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="table-empty">
                        No agents in queue
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
