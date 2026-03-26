import { useMemo, useState } from "react";
import { Bell, ChevronDown, Menu, PhoneCall, UserRound, Wallet } from "lucide-react";
import { Link } from "react-router";
import { Badge } from "@/react-app/components/ui/badge";
import { Button } from "@/react-app/components/ui/button";
import { Avatar, AvatarFallback } from "@/react-app/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/react-app/components/ui/dropdown-menu";
import { useAuth } from "@/react-app/context/AuthContext";
import { usePortalNotifications } from "@/react-app/context/NotificationContext";
import { cn } from "@/react-app/lib/utils";
import type { CurrencyCode } from "@/react-app/lib/api";
import {
  LANGUAGE_META,
  type LanguageCode,
  useLanguage,
} from "@/react-app/context/LanguageContext";

interface HeaderProps {
  onMenuClick: () => void;
  isMobile: boolean;
}

const CURRENCY_META: Record<
  CurrencyCode,
  { code: CurrencyCode; label: string; symbol: string; flag: string }
> = {
  USD: { code: "USD", label: "US Dollar", symbol: "$", flag: "🇺🇸" },
  INR: { code: "INR", label: "Indian Rupee", symbol: "₹", flag: "🇮🇳" },
  EUR: { code: "EUR", label: "Euro", symbol: "€", flag: "🇪🇺" },
  GBP: { code: "GBP", label: "British Pound", symbol: "£", flag: "🇬🇧" },
  RUB: { code: "RUB", label: "Russian Ruble", symbol: "₽", flag: "🇷🇺" },
};

const CURRENCY_ORDER: CurrencyCode[] = ["USD", "INR", "EUR", "GBP", "RUB"];

function formatNotificationDateTime(value: string, locale: string, nowLabel: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return nowLabel;
  return parsed.toLocaleString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  });
}

export default function Header({ onMenuClick, isMobile }: HeaderProps) {
  const { user, setCurrency } = useAuth();
  const { language, locale, setLanguage, t } = useLanguage();
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = usePortalNotifications();
  const [notificationOpen, setNotificationOpen] = useState(false);

  const username = user?.sip_username || "user";
  const isAdmin = Boolean(user?.is_admin);
  const balance = user?.balance_display || "₹ 0.00";
  const activeCallerId = user?.caller_id || t("header.notSet");
  const planStatus = String(user?.membership?.plan_status || "inactive").trim().toLowerCase();
  const hasActiveMembership = planStatus === "active" || planStatus === "expiring";
  const selectedCurrency = (user?.currency || "INR") as CurrencyCode;
  const selectedCurrencyMeta = CURRENCY_META[selectedCurrency] ?? CURRENCY_META.INR;
  const latestNotifications = useMemo(() => notifications.slice(0, 15), [notifications]);
  const languageOptions = useMemo(() => LANGUAGE_META, []);
  const selectedLanguageMeta = useMemo(
    () => languageOptions.find((option) => option.code === language) || languageOptions[0],
    [language, languageOptions],
  );

  const onCurrencyChange = async (value: CurrencyCode) => {
    try {
      await setCurrency(value);
    } catch {
      // ignore; header can retry on next change
    }
  };

  const onLanguageChange = (value: LanguageCode) => {
    setLanguage(value);
  };

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 lg:px-6">
      {/* Left side */}
      <div className="flex items-center gap-4">
        {isMobile && (
          <Button variant="ghost" size="icon" onClick={onMenuClick}>
            <Menu className="h-5 w-5" />
          </Button>
        )}

        {!isAdmin ? (
          <div className="hidden md:flex items-center gap-2 text-sm bg-muted/60 border border-border rounded-lg px-3 py-1.5">
            <PhoneCall className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">{t("header.active")}:</span>
            <span className="font-medium">{activeCallerId}</span>
          </div>
        ) : null}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3 lg:gap-6">
        {isAdmin ? (
          <div className="hidden sm:flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-lg">
            <span className="text-sm font-semibold">{t("header.adminAccount")}</span>
          </div>
        ) : (
          <>
            {/* Magnus Balance */}
            <div className="hidden sm:flex items-center gap-2.5 rounded-xl border border-rose-200/80 bg-gradient-to-r from-rose-50 to-red-50 px-3 py-1.5 shadow-sm">
              <div className="h-7 w-7 rounded-lg bg-white text-primary border border-rose-200/80 flex items-center justify-center">
                <Wallet className="h-4 w-4" />
              </div>
              <div className="leading-tight">
                <p className="text-[10px] uppercase tracking-wide text-rose-500 font-semibold">{t("header.wallet")}</p>
                <p className="text-sm font-bold text-primary">{balance}</p>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="hidden sm:flex h-10 min-w-[126px] items-center justify-between border-emerald-500/70 px-3 hover:border-emerald-600 hover:bg-emerald-50/60"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-xl leading-none">{selectedCurrencyMeta.flag}</span>
                    <span className="text-sm font-semibold">{selectedCurrencyMeta.code}</span>
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 p-2">
                {CURRENCY_ORDER.map((currency) => {
                  const meta = CURRENCY_META[currency];
                  const selected = currency === selectedCurrency;
                  return (
                    <DropdownMenuItem
                      key={currency}
                      onSelect={(event) => {
                        event.preventDefault();
                        void onCurrencyChange(currency);
                      }}
                      className={cn(
                        "cursor-pointer rounded-xl px-3 py-2.5",
                        selected ? "bg-emerald-100 text-emerald-800 focus:bg-emerald-100" : "",
                      )}
                    >
                      <span className="text-xl leading-none">{meta.flag}</span>
                      <span className="text-sm font-medium">
                        {meta.label} ({meta.symbol})
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="hidden sm:flex h-10 min-w-[130px] items-center justify-between border-border px-3"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-xl leading-none">{selectedLanguageMeta.flag}</span>
                    <span className="text-sm font-semibold">{selectedLanguageMeta.label}</span>
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 p-2">
                {languageOptions.map((option) => {
                  const selected = option.code === language;
                  return (
                    <DropdownMenuItem
                      key={option.code}
                      onSelect={(event) => {
                        event.preventDefault();
                        onLanguageChange(option.code);
                      }}
                      className={cn(
                        "cursor-pointer rounded-xl px-3 py-2.5",
                        selected ? "bg-zinc-100 text-zinc-900 focus:bg-zinc-100" : "",
                      )}
                    >
                      <span className="text-xl leading-none">{option.flag}</span>
                      <span className="text-sm font-medium">{option.label}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Subscription Status */}
            <Badge
              variant="default"
              className={
                hasActiveMembership
                  ? "bg-green-500 hover:bg-green-600 text-white hidden sm:flex"
                  : "bg-amber-500 hover:bg-amber-600 text-white hidden sm:flex"
              }
            >
              {hasActiveMembership ? t("header.active") : t("header.inactive", undefined, "Inactive")}
            </Badge>
          </>
        )}

        {/* Notification Bell */}
        <DropdownMenu
          open={notificationOpen}
          onOpenChange={(open) => {
            setNotificationOpen(open);
            if (open && unreadCount > 0) {
              markAllRead();
            }
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 ? (
                <span className="absolute top-1 right-1 h-2 w-2 bg-primary rounded-full" />
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[360px] max-w-[92vw] p-1.5">
            <div className="px-2 py-1.5 flex items-center justify-between">
              <DropdownMenuLabel className="p-0 text-xs uppercase tracking-wide">
                {t("header.dtmfNotifications")}
              </DropdownMenuLabel>
              {latestNotifications.length > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={(event) => {
                    event.preventDefault();
                    clearAll();
                  }}
                >
                  {t("header.clear")}
                </Button>
              ) : null}
            </div>
            <DropdownMenuSeparator />
            {latestNotifications.length > 0 ? (
              <div className="max-h-80 overflow-y-auto px-1 pb-1 space-y-1">
                {latestNotifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "w-full text-left rounded-lg border px-2.5 py-2 transition-colors",
                      item.read
                        ? "border-border/70 bg-background hover:bg-muted/50"
                        : "border-emerald-300/70 bg-emerald-50/60 hover:bg-emerald-100/60",
                    )}
                    onClick={() => markRead(item.id)}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          "mt-1 h-2.5 w-2.5 rounded-full shrink-0",
                          item.read ? "bg-muted-foreground/40" : "bg-emerald-500",
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-tight">
                          {t("header.dtmfFrom", {
                            dtmf: item.dtmf,
                            number: item.number,
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {item.campaign}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {formatNotificationDateTime(item.timestamp, locale, t("header.now"))}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t("header.noDtmfNotifications")}
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Avatar */}
        <Link
          to={isAdmin ? "/admin/security" : "/profile"}
          className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted transition-colors"
          title={isAdmin ? t("header.openAdminSecurity") : t("header.openProfile")}
        >
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-zinc-100 text-zinc-700 border border-zinc-200">
              <UserRound className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <span className="hidden lg:block font-medium text-sm">{username}</span>
        </Link>
      </div>
    </header>
  );
}
