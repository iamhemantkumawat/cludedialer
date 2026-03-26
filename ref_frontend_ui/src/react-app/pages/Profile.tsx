import { useMemo, useState } from "react";
import {
  CalendarDays,
  Eye,
  EyeOff,
  KeyRound,
  Send,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Badge } from "@/react-app/components/ui/badge";
import { Button } from "@/react-app/components/ui/button";
import { useAuth } from "@/react-app/context/AuthContext";
import { useLanguage } from "@/react-app/context/LanguageContext";

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Not available";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not available";
  return parsed.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "active":
      return "bg-green-500 hover:bg-green-600 text-white";
    case "expiring":
      return "bg-amber-500 hover:bg-amber-600 text-white";
    case "expired":
      return "bg-red-500 hover:bg-red-600 text-white";
    default:
      return "bg-slate-500 hover:bg-slate-600 text-white";
  }
}

function humanizeStatus(status: string): string {
  const normalized = String(status || "inactive").trim().toLowerCase();
  if (!normalized) return "Inactive";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export default function Profile() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [showPassword, setShowPassword] = useState(false);

  const telegramId = String(user?.telegram_id || "").trim();
  const hasTelegramLink = telegramId !== "" && !telegramId.startsWith("web:");
  const telegramUsernameRaw = String(user?.telegram_username || "").trim();
  const telegramUsername = telegramUsernameRaw
    ? telegramUsernameRaw.startsWith("@")
      ? telegramUsernameRaw
      : `@${telegramUsernameRaw}`
    : "Not available";
  const telegramName = String(user?.telegram_name || "").trim() || "Not available";

  const passwordRaw = String(user?.sip_password || "").trim();
  const passwordMasked = passwordRaw ? "•".repeat(Math.max(8, Math.min(passwordRaw.length, 18))) : "Not available";
  const passwordDisplay = showPassword ? (passwordRaw || "Not available") : passwordMasked;

  const planStatus = String(user?.membership?.plan_status || "inactive").trim().toLowerCase();
  const planName = String(user?.membership?.plan_name || "Free").trim() || "Free";
  const planExpiry = formatDateTime(user?.membership?.expiry_date);
  const planStart = formatDateTime(user?.membership?.started_at);
  const planDays = user?.membership?.days_remaining;
  const planPrice = user?.membership?.price_eur;
  const durationDays = user?.membership?.duration_days;

  const planDaysLabel = useMemo(() => {
    if (typeof planDays !== "number" || planDays < 0) return "Not available";
    if (planDays === 0) return "Expires today";
    if (planDays === 1) return "1 day remaining";
    return `${planDays} days remaining`;
  }, [planDays]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="text-center">
        <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight text-foreground">{t("page.profile.title")}</h1>
        <p className="text-muted-foreground mt-2 text-base">
          {t("page.profile.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="shadow-md border-sky-200/70 bg-gradient-to-br from-sky-50/70 via-background to-background">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                <ShieldCheck className="h-4 w-4" />
              </span>
              Account Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-sky-100 bg-white/80 px-4 py-3 flex items-center justify-between gap-4">
              <span className="text-xs uppercase tracking-wide font-semibold text-slate-500">SIP Username</span>
              <span className="font-mono text-base text-slate-900">{user?.sip_username || "-"}</span>
            </div>
            <div className="rounded-xl border border-sky-100 bg-white/80 px-4 py-3 flex items-center justify-between gap-4">
              <span className="text-xs uppercase tracking-wide font-semibold text-slate-500">Default SIP</span>
              <span className="font-mono text-base text-slate-900">
                {user?.default_sip_user || user?.sip_username || "-"}
              </span>
            </div>
            <div className="rounded-xl border border-sky-100 bg-white/80 px-4 py-3 flex items-center justify-between gap-4">
              <span className="text-xs uppercase tracking-wide font-semibold text-slate-500 flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-sky-700" />
                SIP Password
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-slate-900">{passwordDisplay}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-md border-emerald-200/70 bg-gradient-to-br from-emerald-50/70 via-background to-background">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <Wallet className="h-4 w-4" />
              </span>
              Active Plan Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-emerald-100 bg-white/80 px-4 py-3 flex items-center justify-between gap-4">
              <span className="text-xs uppercase tracking-wide font-semibold text-slate-500">Plan</span>
              <span className="text-base font-semibold text-slate-900">{planName}</span>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-white/80 px-4 py-3 flex items-center justify-between gap-4">
              <span className="text-xs uppercase tracking-wide font-semibold text-slate-500">Status</span>
              <Badge className={getStatusBadgeClass(planStatus)}>{humanizeStatus(planStatus)}</Badge>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-white/80 px-4 py-3 flex items-center justify-between gap-4">
              <span className="text-xs uppercase tracking-wide font-semibold text-slate-500 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-emerald-700" />
                Started On
              </span>
              <span className="font-medium text-slate-900">{planStart}</span>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-white/80 px-4 py-3 flex items-center justify-between gap-4">
              <span className="text-xs uppercase tracking-wide font-semibold text-slate-500">Expiry</span>
              <span className="font-medium text-slate-900">{planExpiry}</span>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-white/80 px-4 py-3 flex items-center justify-between gap-4">
              <span className="text-xs uppercase tracking-wide font-semibold text-slate-500">Remaining</span>
              <span className="font-medium text-slate-900">{planDaysLabel}</span>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-white/80 px-4 py-3 flex items-center justify-between gap-4">
              <span className="text-xs uppercase tracking-wide font-semibold text-slate-500">Plan Duration</span>
              <span className="font-medium text-slate-900">
                {typeof durationDays === "number" && durationDays > 0 ? `${durationDays} days` : "Not available"}
              </span>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-white/80 px-4 py-3 flex items-center justify-between gap-4">
              <span className="text-xs uppercase tracking-wide font-semibold text-slate-500">Plan Price</span>
              <span className="font-medium text-slate-900">
                {typeof planPrice === "number" && planPrice > 0 ? `€ ${planPrice.toFixed(2)}` : "Not available"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-violet-200/60 bg-gradient-to-br from-violet-50/60 via-background to-background max-w-3xl mx-auto">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
              <Send className="h-4 w-4" />
            </span>
            Telegram Link
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-xl border border-violet-100 bg-white/80 px-4 py-3 flex items-center justify-between gap-4">
            <span className="text-xs uppercase tracking-wide font-semibold text-slate-500">Telegram ID</span>
            <span className="font-mono text-slate-900">{hasTelegramLink ? telegramId : "Not linked"}</span>
          </div>
          <div className="rounded-xl border border-violet-100 bg-white/80 px-4 py-3 flex items-center justify-between gap-4">
            <span className="text-xs uppercase tracking-wide font-semibold text-slate-500">Username</span>
            <span className="font-medium text-slate-900">{hasTelegramLink ? telegramUsername : "Not available"}</span>
          </div>
          <div className="rounded-xl border border-violet-100 bg-white/80 px-4 py-3 flex items-center justify-between gap-4">
            <span className="text-xs uppercase tracking-wide font-semibold text-slate-500">Name</span>
            <span className="font-medium text-slate-900">{hasTelegramLink ? telegramName : "Not available"}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
