import { useEffect, useRef, useState } from "react";
import { requestJson } from "../app/api";
import { useDialer } from "../app/context";
import { formatDuration, formatTimestamp } from "../app/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashStats {
  total_contacts: number;
  active_campaigns: number;
  calls_today: number;
  dtmf_today: number;
}

interface DayData {
  day: string;
  total: number;
  answered: number;
  dtmf: number;
}

interface RecentCall {
  phone: string;
  campaign: string;
  status: string;
  dtmf: string | null;
  duration: number;
  called_at: string;
}

interface DashboardData {
  stats: DashStats;
  daily: DayData[];
  recent: RecentCall[];
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function BarChart({ data }: { data: DayData[] }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; d: DayData } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const maxVal = Math.max(...data.map((d) => d.total), 1);
  const chartH = 200;
  const chartW = 520;
  const padL = 36;
  const padB = 32;
  const padT = 16;
  const innerH = chartH - padB - padT;
  const innerW = chartW - padL - 12;
  const colW = innerW / data.length;
  const barW = Math.min(14, colW * 0.28);
  const gap = 3;

  function barY(val: number) {
    return padT + innerH - (val / maxVal) * innerH;
  }
  function barH(val: number) {
    return (val / maxVal) * innerH;
  }

  // Y grid lines
  const yTicks = [0, Math.round(maxVal / 2), maxVal];

  return (
    <div className="dash-chart-wrap" onMouseLeave={() => setTooltip(null)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${chartW} ${chartH}`}
        className="dash-chart-svg"
        style={{ width: "100%", height: "auto", overflow: "visible" }}
      >
        {/* Y grid */}
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={padL} y1={barY(t)}
              x2={chartW - 12} y2={barY(t)}
              stroke="var(--border)" strokeWidth={1}
            />
            <text
              x={padL - 6} y={barY(t) + 4}
              textAnchor="end" fontSize={10}
              fill="var(--fg-muted)"
            >
              {t}
            </text>
          </g>
        ))}

        {/* Bars */}
        {data.map((d, i) => {
          const cx = padL + i * colW + colW / 2;
          const dayLabel = DAY_LABELS[new Date(d.day + "T12:00:00").getDay()];

          return (
            <g
              key={d.day}
              onMouseEnter={(e) => {
                const rect = svgRef.current?.getBoundingClientRect();
                if (!rect) return;
                const svgX = ((e.clientX - rect.left) / rect.width) * chartW;
                const svgY = ((e.clientY - rect.top) / rect.height) * chartH;
                setTooltip({ x: svgX, y: svgY, d });
              }}
            >
              {/* Total (grey background) */}
              {d.total > 0 && (
                <rect
                  x={cx - barW * 1.5 - gap}
                  y={barY(d.total)}
                  width={barW * 3 + gap * 2}
                  height={barH(d.total)}
                  fill="var(--border-strong)"
                  rx={2}
                  opacity={0.5}
                />
              )}
              {/* Answered (green) */}
              {d.answered > 0 && (
                <rect
                  x={cx - barW - gap / 2}
                  y={barY(d.answered)}
                  width={barW}
                  height={barH(d.answered)}
                  fill="var(--green)"
                  rx={2}
                />
              )}
              {/* DTMF (purple) */}
              {d.dtmf > 0 && (
                <rect
                  x={cx + gap / 2}
                  y={barY(d.dtmf)}
                  width={barW}
                  height={barH(d.dtmf)}
                  fill="#8b5cf6"
                  rx={2}
                />
              )}
              {/* Total Calls (red) — thin line marker */}
              {d.total > 0 && (
                <rect
                  x={cx - 1}
                  y={barY(d.total)}
                  width={2}
                  height={barH(d.total)}
                  fill="var(--red)"
                  rx={1}
                />
              )}
              {/* X label */}
              <text
                x={cx} y={chartH - 6}
                textAnchor="middle" fontSize={11}
                fill="var(--fg-muted)"
              >
                {dayLabel}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="dash-chart-tooltip"
          style={{
            left: `${(tooltip.x / 520) * 100}%`,
            top: `${(tooltip.y / 200) * 100}%`,
          }}
        >
          <div className="dash-tooltip-day">
            {DAY_LABELS[new Date(tooltip.d.day + "T12:00:00").getDay()]}
          </div>
          <div className="c-green">Answered : {tooltip.d.answered}</div>
          <div style={{ color: "#8b5cf6" }}>DTMF : {tooltip.d.dtmf}</div>
          <div className="c-red">Total Calls : {tooltip.d.total}</div>
        </div>
      )}

      {/* Legend */}
      <div className="dash-chart-legend">
        <span><span className="dash-legend-dot" style={{ background: "var(--green)" }} /> Answered</span>
        <span><span className="dash-legend-dot" style={{ background: "#8b5cf6" }} /> DTMF</span>
        <span><span className="dash-legend-dot" style={{ background: "var(--red)" }} /> Total Calls</span>
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="dash-stat-card">
      <div className="dash-stat-body">
        <div className="dash-stat-label">{label}</div>
        <div className="dash-stat-value">{value.toLocaleString()}</div>
      </div>
      <div className="dash-stat-icon" style={{ background: color }}>
        {icon}
      </div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const IC = { w: 28, h: 28, fill: "none", stroke: "#fff", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const ContactsIcon = () => (
  <svg viewBox="0 0 24 24" {...IC}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const CampaignIcon = () => (
  <svg viewBox="0 0 24 24" {...IC}>
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" {...IC}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.9a16 16 0 0 0 6 6l.94-.94a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.01Z" />
  </svg>
);

const DtmfIcon = () => (
  <svg viewBox="0 0 24 24" {...IC}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 8h.01M12 8h.01M17 8h.01M7 12h.01M12 12h.01M17 12h.01M7 16h.01M12 16h.01M17 16h.01" strokeWidth={2.5} />
  </svg>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { user, notify } = useDialer();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    requestJson<DashboardData>("/api/reports/dashboard")
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) notify(err instanceof Error ? err.message : "Failed to load dashboard", "error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const stats = data?.stats ?? { total_contacts: 0, active_campaigns: 0, calls_today: 0, dtmf_today: 0 };
  const daily = data?.daily ?? [];
  const recent = data?.recent ?? [];

  return (
    <section className="section active">
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="c-dim" style={{ fontSize: "0.85rem", marginTop: 2 }}>
            Welcome back! Here's your overview.
          </div>
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="table-empty">Loading…</div>
        ) : (
          <>
            {/* ── Stat cards ── */}
            <div className="dash-stats-row mb-20">
              <StatCard label="Total Contacts"    value={stats.total_contacts}   color="#3b82f6" icon={<ContactsIcon />} />
              <StatCard label="Active Campaigns"  value={stats.active_campaigns} color="#22c55e" icon={<CampaignIcon />} />
              <StatCard label="Calls Today"       value={stats.calls_today}      color="#ef4444" icon={<PhoneIcon />} />
              <StatCard label="DTMF Responses"    value={stats.dtmf_today}       color="#8b5cf6" icon={<DtmfIcon />} />
            </div>

            {/* ── Chart + Recent ── */}
            <div className="dash-main-row">
              {/* Call Performance chart */}
              <div className="dash-chart-card">
                <div className="dash-card-title">Call Performance</div>
                {daily.length > 0 ? (
                  <BarChart data={daily} />
                ) : (
                  <div className="table-empty" style={{ height: 200 }}>No call data yet</div>
                )}
              </div>

              {/* Recent Activity */}
              <div className="dash-recent-card">
                <div className="dash-card-title">Recent Activity</div>
                {recent.length === 0 ? (
                  <div className="table-empty">No recent calls</div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Number</th>
                          <th>Campaign</th>
                          <th>Duration</th>
                          <th>DTMF</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recent.map((call, i) => (
                          <tr key={i}>
                            <td className="mono dash-phone">{call.phone}</td>
                            <td className="c-dim" style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {call.campaign}
                            </td>
                            <td>{formatDuration(call.duration)}</td>
                            <td>
                              {call.dtmf
                                ? <strong className="c-blue">{call.dtmf}</strong>
                                : <span className="c-dim">-</span>}
                            </td>
                            <td>
                              <span className={`badge badge-${call.status}`}>{call.status === "no-answer" ? "No Answer" : call.status.charAt(0).toUpperCase() + call.status.slice(1)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
