import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BadgeCheck,
  CalendarClock,
  CreditCard,
  Loader2,
  ShieldCheck,
  Sparkles,
  TimerReset,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { webappApi, type SubscriptionPlan } from "@/react-app/lib/api";
import { useAuth } from "@/react-app/context/AuthContext";
import { useLanguage } from "@/react-app/context/LanguageContext";

interface CurrentSubscription {
  plan_name: string;
  plan_status: string;
  expiry_date: string | null;
}

function formatDateTime(value: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDaysRemaining(value: string | null): string {
  if (!value) return "No active expiry";
  const expiry = new Date(value).getTime();
  if (!Number.isFinite(expiry)) return "No active expiry";
  const now = Date.now();
  const diffMs = expiry - now;
  if (diffMs <= 0) return "Expired";
  const days = Math.ceil(diffMs / 86400000);
  return days === 1 ? "1 day left" : `${days} days left`;
}

function statusBadgeClass(status: string): string {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "active") return "bg-emerald-500 hover:bg-emerald-600 text-white";
  if (normalized === "expiring") return "bg-amber-500 hover:bg-amber-600 text-white";
  if (normalized === "expired") return "bg-red-500 hover:bg-red-600 text-white";
  return "bg-slate-500 hover:bg-slate-600 text-white";
}

function statusLabel(status: string): string {
  const normalized = String(status || "inactive").trim().toLowerCase();
  return normalized ? `${normalized[0].toUpperCase()}${normalized.slice(1)}` : "Inactive";
}

const PLAN_CARD_STYLES = [
  "border-red-200/80 bg-gradient-to-br from-red-50 via-background to-background",
  "border-amber-200/80 bg-gradient-to-br from-amber-50 via-background to-background",
  "border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-background to-background",
];

export default function Subscription() {
  const { refreshUser } = useAuth();
  const { t } = useLanguage();
  const [current, setCurrent] = useState<CurrentSubscription | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [activatingPlan, setActivatingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadSubscription = async () => {
    setLoading(true);
    try {
      const response = await webappApi.getSubscription();
      setCurrent(response.current);
      setPlans(response.plans);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subscription");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSubscription();
  }, []);

  const activatePlan = async (planKey: string) => {
    setActivatingPlan(planKey);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await webappApi.activateSubscription(planKey);
      setSuccessMessage(
        `Plan activated: ${response.plan_name}. Expires ${new Date(response.expiry_date).toLocaleString()}`,
      );
      await loadSubscription();
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Plan activation failed");
    } finally {
      setActivatingPlan(null);
    }
  };

  const currentPlanStatus = useMemo(
    () => String(current?.plan_status || "inactive").trim().toLowerCase(),
    [current?.plan_status],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Card className="border-red-200/70 bg-gradient-to-r from-red-50 via-background to-amber-50 shadow-sm">
        <CardContent className="px-5 py-5 lg:px-7 lg:py-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight text-foreground flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-red-600" />
                {t("page.subscription.title")}
              </h1>
              <p className="text-muted-foreground mt-2 text-base">
                {t("page.subscription.subtitle")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border border-red-200">
                Secure activation
              </Badge>
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border border-emerald-200">
                Instant upgrade
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      ) : null}
      {successMessage ? (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-2">
          <BadgeCheck className="h-4 w-4" />
          {successMessage}
        </div>
      ) : null}

      <Card className="shadow-sm border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 via-background to-background">
        <CardHeader>
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-700" />
            Current Plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-muted-foreground">Loading plan status...</p> : null}
          {!loading && current ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-xl border border-emerald-200 bg-white/85 px-4 py-3">
                <p className="text-xs uppercase tracking-wide font-semibold text-slate-500">Plan Name</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{current.plan_name || "Free"}</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-white/85 px-4 py-3">
                <p className="text-xs uppercase tracking-wide font-semibold text-slate-500">Status</p>
                <div className="mt-2">
                  <Badge className={statusBadgeClass(currentPlanStatus)}>{statusLabel(currentPlanStatus)}</Badge>
                </div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-white/85 px-4 py-3">
                <p className="text-xs uppercase tracking-wide font-semibold text-slate-500">Time Remaining</p>
                <p className="mt-1 text-base font-semibold text-slate-900 flex items-center gap-2">
                  <TimerReset className="h-4 w-4 text-emerald-700" />
                  {getDaysRemaining(current.expiry_date)}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-white/85 px-4 py-3 lg:col-span-3">
                <p className="text-xs uppercase tracking-wide font-semibold text-slate-500">Expiry Date</p>
                <p className="mt-1 text-base font-medium text-slate-900 flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-emerald-700" />
                  {formatDateTime(current.expiry_date)}
                </p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {plans.map((plan, index) => {
          const isBusy = activatingPlan === plan.planKey;
          const isCurrentPlan =
            current &&
            String(current.plan_name || "").trim().toLowerCase() ===
              String(plan.name || "").trim().toLowerCase() &&
            currentPlanStatus === "active";
          return (
            <Card key={plan.planKey} className={`shadow-sm ${PLAN_CARD_STYLES[index % PLAN_CARD_STYLES.length]}`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-2xl font-semibold tracking-tight flex items-center justify-between">
                  <span>{plan.name}</span>
                  {isCurrentPlan ? (
                    <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white">Current</Badge>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-border/70 bg-white/90 px-4 py-4">
                  <p className="text-xs uppercase tracking-wide font-semibold text-slate-500">Price</p>
                  <p className="mt-1 text-4xl leading-none font-bold text-slate-900">
                    {plan.currency}
                    {plan.price}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-white/90 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide font-semibold text-slate-500">Access</p>
                  <p className="mt-1 text-base font-medium text-slate-900">{plan.limits}</p>
                </div>
                <Button
                  className="w-full h-11 text-base font-semibold"
                  onClick={() => void activatePlan(plan.planKey)}
                  disabled={isBusy}
                >
                  {isBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Activating...
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Activate Plan
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
