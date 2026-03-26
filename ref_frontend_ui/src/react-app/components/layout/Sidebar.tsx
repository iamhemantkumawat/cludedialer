import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Link, useLocation } from "react-router";
import {
  LayoutDashboard,
  Megaphone,
  PlayCircle,
  History,
  Users,
  Phone,
  FileText,
  PhoneCall,
  CreditCard,
  Settings,
  ShieldCheck,
  Radio,
  ClipboardList,
  LockKeyhole,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { useAuth } from "@/react-app/context/AuthContext";
import { useLanguage } from "@/react-app/context/LanguageContext";

type MenuItem = {
  icon: ComponentType<{ className?: string }>;
  labelKey: string;
  path: string;
  matchPrefix?: boolean;
};

const baseMenuItemsBeforeCampaign: MenuItem[] = [
  { icon: LayoutDashboard, labelKey: "menu.dashboard", path: "/" },
];

const campaignSubMenuItems: MenuItem[] = [
  { icon: Megaphone, labelKey: "menu.campaign", path: "/campaigns" },
  { icon: PlayCircle, labelKey: "menu.runCampaign", path: "/campaigns/run" },
  { icon: History, labelKey: "menu.campaignHistory", path: "/campaigns/history" },
];

const baseMenuItemsAfterCampaign: MenuItem[] = [
  { icon: Users, labelKey: "menu.contacts", path: "/contacts" },
  { icon: Phone, labelKey: "menu.liveCalls", path: "/live-calls" },
  { icon: FileText, labelKey: "menu.callLogs", path: "/cdrs" },
  { icon: PhoneCall, labelKey: "menu.callerId", path: "/caller-id" },
  { icon: CreditCard, labelKey: "menu.subscription", path: "/subscription" },
  { icon: Settings, labelKey: "menu.settings", path: "/settings" },
] ;

const adminMenuItems: MenuItem[] = [
  { icon: ShieldCheck, labelKey: "menu.adminDashboard", path: "/admin" },
  { icon: Users, labelKey: "menu.telegramUsers", path: "/admin/users" },
  { icon: Phone, labelKey: "menu.adminLiveLogs", path: "/admin/live" },
  { icon: Radio, labelKey: "menu.userCampaigns", path: "/admin/campaigns" },
  { icon: FileText, labelKey: "menu.allUsersCdrs", path: "/admin/cdrs" },
  { icon: ClipboardList, labelKey: "menu.activityLogs", path: "/admin/activity" },
  { icon: Megaphone, labelKey: "menu.broadcast", path: "/admin/broadcast" },
  { icon: LockKeyhole, labelKey: "menu.adminSecurity", path: "/admin/security" },
] ;

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const { logout, user } = useAuth();
  const { t } = useLanguage();
  const isCampaignSectionActive = useMemo(
    () => location.pathname === "/campaigns" || location.pathname.startsWith("/campaigns/"),
    [location.pathname],
  );
  const [campaignsOpen, setCampaignsOpen] = useState(isCampaignSectionActive);

  useEffect(() => {
    if (isCampaignSectionActive) {
      setCampaignsOpen(true);
    }
  }, [isCampaignSectionActive]);

  const onLogout = async () => {
    await logout();
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-card border-r border-border transition-all duration-300 flex flex-col",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-center border-b border-border px-4">
        {collapsed ? (
          <img
            src="/logo_custom1.png"
            alt="CyberX"
            className="h-8 w-auto"
          />
        ) : (
          <img
            src="/logo_custom1.png"
            alt="CyberX AutoDial"
            className="h-10 w-auto"
          />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 overflow-y-auto">
        {user?.is_admin ? (
          <ul className="space-y-1">
            {adminMenuItems.map((item) => {
              const isActive = item.matchPrefix
                ? location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
                : location.pathname === item.path;
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      collapsed && "justify-center",
                    )}
                  >
                    <item.icon className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-5 w-5")} />
                    {!collapsed && <span className="font-medium">{t(item.labelKey)}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className="space-y-1">
            {baseMenuItemsBeforeCampaign.map((item) => {
              const isActive = item.matchPrefix
                ? location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
                : location.pathname === item.path;
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      collapsed && "justify-center",
                    )}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {!collapsed && <span className="font-medium">{t(item.labelKey)}</span>}
                  </Link>
                </li>
              );
            })}

            <li>
              <button
                type="button"
                onClick={() => setCampaignsOpen((prev) => !prev)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                  isCampaignSectionActive
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  collapsed && "justify-center",
                )}
              >
                <Megaphone className="h-5 w-5 shrink-0" />
                {!collapsed ? <span className="font-medium flex-1 text-left">{t("menu.campaigns")}</span> : null}
                {!collapsed ? (
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform duration-200",
                      campaignsOpen ? "rotate-180" : "",
                    )}
                  />
                ) : null}
              </button>
            </li>

            {campaignsOpen ? (
              <li>
                <ul className={cn("space-y-1", !collapsed ? "ml-5 border-l border-border/70 pl-3" : "")}>
                  {campaignSubMenuItems.map((item) => {
                    const isActive = item.matchPrefix
                      ? location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
                      : location.pathname === item.path;
                    return (
                      <li key={item.path}>
                        <Link
                          to={item.path}
                          className={cn(
                            "flex items-center gap-3 px-3 rounded-lg transition-all duration-200",
                            collapsed ? "py-2.5 justify-center" : "py-2 text-sm",
                            isActive
                              ? "bg-primary text-primary-foreground shadow-md"
                              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                          )}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          {!collapsed ? <span className="font-medium">{t(item.labelKey)}</span> : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ) : null}

            {baseMenuItemsAfterCampaign.map((item) => {
              const isActive = item.matchPrefix
                ? location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
                : location.pathname === item.path;
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      collapsed && "justify-center",
                    )}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {!collapsed && <span className="font-medium">{t(item.labelKey)}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {/* Logout */}
      <div className="p-2 border-t border-border">
        <button
          type="button"
          onClick={() => void onLogout()}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-200",
            collapsed && "justify-center"
          )}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="font-medium">{t("menu.logout")}</span>}
        </button>
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 bg-card border border-border rounded-full p-1.5 shadow-md hover:bg-accent transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
    </aside>
  );
}
