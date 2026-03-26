import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jsonRequest, requestJson } from "../app/api";
import { useDialer } from "../app/context";

interface Plan {
  id: string;
  name: string;
  days: number;
  price_eur: number;
}

interface Subscription {
  id: string;
  plan_name: string;
  plan_days: number;
  price_eur: number;
  price_inr: number;
  status: string;
  activated_at: string;
  expires_at: string;
}

interface SubResponse {
  subscription: Subscription | null;
  plans: Plan[];
}

const EUR_TO_INR = 88.50;

function daysLeft(expiresAt: string): number {
  const now = new Date();
  const exp = new Date(expiresAt);
  return Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function SubscriptionPage() {
  const { user, session, notify, refreshBalance } = useDialer();
  const [data, setData] = useState<SubResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<string | null>(null);
  const navigate = useNavigate();

  function load() {
    setLoading(true);
    requestJson<SubResponse>("/api/subscription")
      .then(setData)
      .catch((err) => notify(err instanceof Error ? err.message : "Failed to load subscription", "error"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleActivate(plan: Plan) {
    if (!session) { notify("Not logged in", "error"); return; }
    const priceInr = plan.price_eur * EUR_TO_INR;
    const balance = parseFloat(String(user?.credit ?? "0"));

    if (balance < priceInr) {
      notify(`Insufficient balance. Need ₹${priceInr.toFixed(2)}, have ₹${balance.toFixed(2)}`, "error");
      return;
    }

    if (!confirm(`Activate ${plan.name} for €${plan.price_eur} (₹${priceInr.toFixed(2)})? This will be deducted from your Magnus balance.`)) return;

    setActivating(plan.id);
    try {
      await jsonRequest("/api/subscription/activate", "POST", {
        plan_id: plan.id,
        session_id: session,
      });
      notify(`${plan.name} activated successfully!`, "success");
      await refreshBalance();
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Activation failed", "error");
    } finally {
      setActivating(null);
    }
  }

  const sub = data?.subscription ?? null;
  const plans = data?.plans ?? [];

  return (
    <section className="section active">
      <div className="page-header">
        <div>
          <div className="page-title">✦ Subscription</div>
          <div className="c-dim" style={{ fontSize: "0.85rem", marginTop: 2 }}>
            Activate autodialer plans from your CyberX Account balance.
          </div>
        </div>
        <div className="header-actions">
          <span className="badge badge-answered" style={{ fontSize: "0.78rem" }}>Secure activation</span>
          <span className="badge badge-blue" style={{ fontSize: "0.78rem" }}>Instant upgrade</span>
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="table-empty">Loading…</div>
        ) : (
          <>
            {/* Current Plan */}
            <div className="sub-current-card mb-20">
              <div className="sub-current-title">🛡 Current Plan</div>
              {sub ? (
                <div className="sub-plan-grid">
                  <div className="sub-info-box">
                    <div className="sub-info-label">PLAN NAME</div>
                    <div className="sub-info-value">{sub.plan_name}</div>
                  </div>
                  <div className="sub-info-box">
                    <div className="sub-info-label">STATUS</div>
                    <div className="sub-info-value">
                      <span className="badge badge-answered">Active</span>
                    </div>
                  </div>
                  <div className="sub-info-box">
                    <div className="sub-info-label">TIME REMAINING</div>
                    <div className="sub-info-value sub-time-left">
                      <span>⏱</span> {daysLeft(sub.expires_at)} days left
                    </div>
                  </div>
                  <div className="sub-info-box sub-info-box--wide">
                    <div className="sub-info-label">EXPIRY DATE</div>
                    <div className="sub-info-value">
                      <span>📅</span> {fmtDate(sub.expires_at)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="sub-no-plan">
                  <div className="sub-no-plan__icon">🔒</div>
                  <div className="sub-no-plan__text">No active subscription</div>
                  <div className="c-dim" style={{ fontSize: "0.85rem" }}>
                    Campaign execution is locked. Activate a plan below to start running campaigns.
                  </div>
                </div>
              )}
            </div>

            {/* Plan Cards */}
            <div className="sub-plans-grid">
              {plans.map((plan) => {
                const priceInr = plan.price_eur * EUR_TO_INR;
                const isActive = activating === plan.id;
                const balance = parseFloat(String(user?.credit ?? "0"));
                const canAfford = balance >= priceInr;

                return (
                  <div className="sub-plan-card" key={plan.id}>
                    <div className="sub-plan-name">{plan.name}</div>
                    <div className="sub-plan-price-row">
                      <div className="sub-plan-label">PRICE</div>
                      <div className="sub-plan-price">€{plan.price_eur}</div>
                      <div className="sub-plan-inr">≈ ₹{priceInr.toFixed(0)}</div>
                    </div>
                    <div className="sub-plan-access-row">
                      <div className="sub-plan-label">ACCESS</div>
                      <div className="sub-plan-access">{plan.days} {plan.days === 1 ? "day" : "days"} access</div>
                    </div>
                    <button
                      className="btn sub-activate-btn"
                      type="button"
                      disabled={isActive || !canAfford}
                      onClick={() => void handleActivate(plan)}
                    >
                      {isActive ? (
                        "Processing…"
                      ) : !canAfford ? (
                        "Insufficient Balance"
                      ) : (
                        <><span>💳</span> Activate Plan</>
                      )}
                    </button>
                    {!canAfford && (
                      <div className="sub-plan-hint c-dim">
                        Need ₹{(priceInr - balance).toFixed(2)} more
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
