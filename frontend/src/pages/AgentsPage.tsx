import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { accountHeaders, jsonRequest, requestJson } from "../app/api";
import { useDialer } from "../app/context";
import type { Agent, AgentFormState, QueueFormState } from "../app/types";
import { QUEUE_STRATEGIES } from "../app/utils";
import { AudioPreview } from "../components/AudioPreview";
import { Modal } from "../components/Modal";

const DEFAULT_AGENT_FORM: AgentFormState = {
  name: "",
  password: "",
  caller_id: "",
};

export function AgentsPage() {
  const { user, agents, queueConfig, queueName, audioFiles, refreshAgentsData, refreshAudioFiles, notify } = useDialer();
  const [queueForm, setQueueForm] = useState<QueueFormState>({
    strategy: queueConfig.strategy,
    agent_timeout: queueConfig.agent_timeout,
    max_wait: queueConfig.max_wait,
    moh_file: queueConfig.moh_file,
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [agentForm, setAgentForm] = useState<AgentFormState>(DEFAULT_AGENT_FORM);
  const [savingAgent, setSavingAgent] = useState(false);
  const [savingQueue, setSavingQueue] = useState(false);
  const [uploadingMoh, setUploadingMoh] = useState(false);

  useEffect(() => {
    void Promise.allSettled([refreshAgentsData(), refreshAudioFiles()]);
  }, []);

  useEffect(() => {
    setQueueForm({
      strategy: queueConfig.strategy || "ringall",
      agent_timeout: Number(queueConfig.agent_timeout) || 15,
      max_wait: Number(queueConfig.max_wait) || 120,
      moh_file: queueConfig.moh_file || "",
    });
  }, [queueConfig.strategy, queueConfig.agent_timeout, queueConfig.max_wait, queueConfig.moh_file]);

  function openModal(agent?: Agent) {
    setEditingAgent(agent || null);
    setAgentForm(
      agent
        ? {
            name: agent.name,
            password: agent.password,
            caller_id: agent.caller_id || "",
          }
        : DEFAULT_AGENT_FORM,
    );
    setModalOpen(true);
  }

  async function handleSaveQueue() {
    if (!user) return;
    setSavingQueue(true);
    try {
      await jsonRequest("/api/queue", "PUT", queueForm, {
        headers: accountHeaders(user),
      });
      await refreshAgentsData();
      notify("Queue settings saved", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to save queue settings", "error");
    } finally {
      setSavingQueue(false);
    }
  }

  async function handleMohUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingMoh(true);
    try {
      const formData = new FormData();
      formData.append("audio", file);
      const response = await requestJson<{ filename: string }>("/api/audio/upload", {
        method: "POST",
        body: formData,
      });
      await refreshAudioFiles();
      setQueueForm((current) => ({ ...current, moh_file: response.filename }));
      notify("MOH audio uploaded", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to upload MOH audio", "error");
    } finally {
      setUploadingMoh(false);
      event.target.value = "";
    }
  }

  async function handleToggleQueueMember(agent: Agent, inQueue: boolean) {
    if (!user) return;
    try {
      await jsonRequest(
        `/api/queue/member/${agent.id}`,
        "PUT",
        { in_queue: inQueue },
        { headers: accountHeaders(user) },
      );
      await refreshAgentsData();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to update queue membership", "error");
    }
  }

  async function handleSaveAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setSavingAgent(true);
    try {
      await jsonRequest(
        editingAgent ? `/api/agents/${editingAgent.id}` : "/api/agents",
        editingAgent ? "PUT" : "POST",
        agentForm,
        { headers: accountHeaders(user) },
      );
      await refreshAgentsData();
      notify(editingAgent ? "Agent updated" : "Agent created", "success");
      setModalOpen(false);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to save agent", "error");
    } finally {
      setSavingAgent(false);
    }
  }

  async function handleDeleteAgent(agent: Agent) {
    if (!user) return;
    if (!window.confirm(`Delete agent "${agent.name}"? They will be removed from Asterisk.`)) return;
    try {
      await jsonRequest(`/api/agents/${agent.id}`, "DELETE", undefined, {
        headers: accountHeaders(user),
      });
      await refreshAgentsData();
      notify(`Agent "${agent.name}" deleted`, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to delete agent", "error");
    }
  }

  return (
    <section className="section active">
      <div className="page-header">
        <div className="page-title">Agents</div>
        <div className="header-actions">
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => void refreshAgentsData()}>
            ↻ Refresh
          </button>
          <button className="btn btn-primary" type="button" onClick={() => openModal()}>
            + Add Agent
          </button>
        </div>
      </div>

      <div className="page-body">
        <div className="queue-card">
          <div className="queue-card-title">
            🎯 Queue Settings —{" "}
            <span className="queue-card-title__sub">
              When transfer destination is the agent queue, callers wait here until an agent is available.
            </span>
          </div>
          <div className="queue-card-grid">
            <div className="form-group">
              <label htmlFor="queue-strategy">Strategy</label>
              <select
                id="queue-strategy"
                value={queueForm.strategy}
                onChange={(event) => setQueueForm((current) => ({ ...current, strategy: event.target.value }))}
              >
                {QUEUE_STRATEGIES.map((strategy) => (
                  <option key={strategy.value} value={strategy.value}>
                    {strategy.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="queue-timeout">Agent Timeout (s)</label>
              <input
                id="queue-timeout"
                type="number"
                min={5}
                max={120}
                value={queueForm.agent_timeout}
                onChange={(event) =>
                  setQueueForm((current) => ({
                    ...current,
                    agent_timeout: Number.parseInt(event.target.value, 10) || 15,
                  }))
                }
              />
            </div>
            <div className="form-group">
              <label htmlFor="queue-maxwait">Max Wait (s)</label>
              <input
                id="queue-maxwait"
                type="number"
                min={30}
                max={600}
                value={queueForm.max_wait}
                onChange={(event) =>
                  setQueueForm((current) => ({
                    ...current,
                    max_wait: Number.parseInt(event.target.value, 10) || 120,
                  }))
                }
              />
            </div>
            <div className="form-group">
              <label htmlFor="queue-moh">Music on Hold</label>
              <select
                id="queue-moh"
                value={queueForm.moh_file}
                onChange={(event) => setQueueForm((current) => ({ ...current, moh_file: event.target.value }))}
              >
                <option value="">-- Silence --</option>
                {audioFiles.map((file) => (
                  <option key={file.name} value={file.name}>
                    {file.name}
                  </option>
                ))}
              </select>

              <label className="upload-inline">
                <input type="file" accept=".wav,.mp3,.gsm,.ulaw,.alaw,.ogg" onChange={handleMohUpload} />
                {uploadingMoh ? "Uploading…" : "⬆ Upload MOH Audio"}
              </label>
            </div>
          </div>

          {queueForm.moh_file ? <AudioPreview compact fileName={queueForm.moh_file} label="Music on Hold Preview" /> : null}

          <div className="queue-card__footer">
            <button className="btn btn-primary btn-sm" type="button" onClick={() => void handleSaveQueue()} disabled={savingQueue}>
              {savingQueue ? "Saving…" : "Save Queue Settings"}
            </button>
            <span className="c-dim">Queue name: {queueName || "—"}</span>
          </div>
        </div>

        <div className="agents-note">
          Register agents in Zoiper using your Asterisk host on port <strong>5060</strong>. Toggle the queue switch to include or exclude an agent from the shared queue.
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Queue</th>
                <th>Name</th>
                <th>Username</th>
                <th>Password</th>
                <th>Caller ID</th>
                <th>Transfer Dial</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.length ? (
                agents.map((agent) => (
                  <tr key={agent.id}>
                    <td>
                      <span
                        className={`pulse-dot ${
                          agent.status === "online" ? "green" : agent.status === "offline" ? "red" : "gray"
                        }`}
                        title={agent.status}
                      />
                    </td>
                    <td>
                      <label className="q-toggle" title={agent.in_queue !== false ? "In queue" : "Not in queue"}>
                        <input
                          type="checkbox"
                          checked={agent.in_queue !== false}
                          onChange={(event) => void handleToggleQueueMember(agent, event.target.checked)}
                        />
                        <span className="q-slider" />
                      </label>
                    </td>
                    <td className="history-phone">{agent.name}</td>
                    <td className="mono">{agent.username}</td>
                    <td className="mono">{agent.password}</td>
                    <td>{agent.caller_id || "—"}</td>
                    <td className="mono c-blue">SIP/{agent.username}</td>
                    <td>
                      <div className="flex-center">
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => openModal(agent)}>
                          Edit
                        </button>
                        <button className="btn btn-danger btn-sm" type="button" onClick={() => void handleDeleteAgent(agent)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="table-empty">
                    No agents yet. Click “+ Add Agent” to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={modalOpen}
        title={editingAgent ? "Edit Agent" : "Add Agent"}
        maxWidth={460}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button className="btn btn-ghost" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="agent-form" disabled={savingAgent}>
              {savingAgent ? "Saving…" : editingAgent ? "Save Changes" : "Create Agent"}
            </button>
          </>
        }
      >
        <form id="agent-form" onSubmit={handleSaveAgent}>
          <div className="form-group">
            <label htmlFor="agent-name">Display Name *</label>
            <input
              id="agent-name"
              value={agentForm.name}
              onChange={(event) => setAgentForm((current) => ({ ...current, name: event.target.value }))}
              required
            />
          </div>

          {!editingAgent ? (
            <div className="form-group">
              <label>SIP Username</label>
              <div className="form-static">
                Auto-assigned as <strong>agent1</strong>, <strong>agent2</strong>, and so on.
              </div>
            </div>
          ) : null}

          <div className="form-group">
            <label htmlFor="agent-password">SIP Password *</label>
            <input
              id="agent-password"
              value={agentForm.password}
              onChange={(event) => setAgentForm((current) => ({ ...current, password: event.target.value }))}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="agent-caller-id">Caller ID</label>
            <input
              id="agent-caller-id"
              value={agentForm.caller_id}
              onChange={(event) => setAgentForm((current) => ({ ...current, caller_id: event.target.value }))}
              placeholder="e.g. Agent Name <1234>"
            />
          </div>
        </form>
      </Modal>
    </section>
  );
}
