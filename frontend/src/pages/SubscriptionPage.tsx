import { useEffect, useState } from "react";
import { jsonRequest, requestJson } from "../app/api";
import { useDialer } from "../app/context";

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

// Plans are defined here so they always show even if API is slow/down
const PLANS = [
  { id: "1day",   name: "1 Day",   days: 1,  price_eur: 14  },
  { id: "1week",  name: "1 Week",  days: 7,  price_eur: 65  },
  { id: "1month", name: "1 Month", days: 30, price_eur: 149 },
];

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
  const { user, notify, refreshBalance, refreshSubscription } = useDialer();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<string | null>(null);

  function load() {
    setLoading(true);
    requestJson<{ subscription: Subscription | null }>("/api/subscription")
      .then((d) => setSub(d.subscription ?? null))
      .catch(() => setSub(null))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleActivate(plan: typeof PLANS[number]) {
    const priceInr = plan.price_eur * EUR_TO_INR;
    const balance = parseFloat(String(user?.credit ?? "0"));

    if (balance < priceInr) {
      notify(`Insufficient balance. Need ₹${priceInr.toFixed(2)}, have ₹${balance.toFixed(2)}`, "error");
      return;
    }

    if (!confirm(`Activate ${plan.name} for €${plan.price_eur} (≈ ₹${priceInr.toFixed(0)})?`)) return;

    setActivating(plan.id);
    try {
      await jsonRequest("/api/subscription/activate", "POST", { plan_id: plan.id });
      notify(`${plan.name} activated successfully!`, "success");
      await refreshBalance();
      await refreshSubscription();
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Activation failed", "error");
    } finally {
      setActivating(null);
    }
  }

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
        {/* Current Plan */}
        <div className="sub-current-card mb-20">
          <div className="sub-current-title">🛡 Current Plan</div>
          {loading ? (
            <div className="c-dim" style={{ padding: "16px 0" }}>Checking subscription…</div>
          ) : sub ? (
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

        {/* Plan Cards — always visible */}
        <div className="sub-plans-grid">
          {PLANS.map((plan) => {
            const priceInr = plan.price_eur * EUR_TO_INR;
            const isActivating = activating === plan.id;
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
                  disabled={isActivating || !canAfford}
                  onClick={() => void handleActivate(plan)}
                >
                  {isActivating ? "Processing…" : !canAfford ? "Insufficient Balance" : <><span>💳</span> Activate Plan</>}
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
      </div>
    </section>
  );
}
