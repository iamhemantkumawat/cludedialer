import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BadgeCheck,
  Clock3,
  LockKeyhole,
  Megaphone,
  PhoneCall,
  Radio,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useLocation } from "react-router";
import { Badge } from "@/react-app/components/ui/badge";
import { Button } from "@/react-app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Input } from "@/react-app/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/react-app/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/react-app/components/ui/table";
import { Textarea } from "@/react-app/components/ui/textarea";
import {
  webappApi,
  type AdminActivityLogRow,
  type AdminBroadcastJob,
  type AdminCampaignRow,
  type AdminCdrRow,
  type AdminLiveCallRow,
  type AdminLiveLogRow,
  type AdminOverviewStats,
  type AdminUserRow,
} from "@/react-app/lib/api";

type AdminSection =
  | "dashboard"
  | "users"
  | "live"
  | "campaigns"
  | "cdrs"
  | "activity"
  | "broadcast"
  | "security";

function sectionFromPath(pathname: string): AdminSection {
  if (pathname.startsWith("/admin/users")) return "users";
  if (pathname.startsWith("/admin/live")) return "live";
  if (pathname.startsWith("/admin/campaigns")) return "campaigns";
  if (pathname.startsWith("/admin/cdrs")) return "cdrs";
  if (pathname.startsWith("/admin/activity")) return "activity";
  if (pathname.startsWith("/admin/broadcast")) return "broadcast";
  if (pathname.startsWith("/admin/security")) return "security";
  return "dashboard";
}

function formatDate(raw: string | null | undefined): string {
  if (!raw) return "-";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

function membershipBadge(status: string) {
  const safe = String(status || "inactive").toLowerCase();
  if (safe === "active") {
    return <Badge className="bg-green-500 hover:bg-green-600 text-white">Active</Badge>;
  }
  if (safe === "expiring") {
    return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">Expiring</Badge>;
  }
  if (safe === "expired") {
    return <Badge className="bg-red-500 hover:bg-red-600 text-white">Expired</Badge>;
  }
  return <Badge variant="secondary">Inactive</Badge>;
}

function campaignStatusBadge(status: string) {
  const safe = String(status || "paused").toLowerCase();
  if (safe === "active" || safe === "running") {
    return <Badge className="bg-green-500 hover:bg-green-600 text-white">Running</Badge>;
  }
  if (safe === "failed") {
    return <Badge className="bg-red-500 hover:bg-red-600 text-white">Failed</Badge>;
  }
  if (safe === "completed") {
    return <Badge className="bg-blue-500 hover:bg-blue-600 text-white">Completed</Badge>;
  }
  return <Badge variant="secondary">Paused</Badge>;
}

function callStatusBadge(status: string) {
  const safe = String(status || "ringing").toLowerCase();
  if (safe === "answered") {
    return <Badge className="bg-green-500 hover:bg-green-600 text-white">Answered</Badge>;
  }
  if (safe === "ringing") {
    return <Badge className="bg-blue-500 hover:bg-blue-600 text-white">Ringing</Badge>;
  }
  if (safe === "failed") {
    return <Badge className="bg-red-500 hover:bg-red-600 text-white">Failed</Badge>;
  }
  if (safe === "no_answer") {
    return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">No Answer</Badge>;
  }
  return <Badge variant="secondary">{safe}</Badge>;
}

function cdrResultBadge(status: string) {
  const safe = String(status || "failed").toLowerCase();
  if (safe === "answered") {
    return <Badge className="bg-green-500 hover:bg-green-600 text-white">Answered</Badge>;
  }
  if (safe === "no_answer") {
    return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">No Answer</Badge>;
  }
  if (safe === "failed") {
    return <Badge className="bg-red-500 hover:bg-red-600 text-white">Failed</Badge>;
  }
  if (safe === "ringing") {
    return <Badge className="bg-blue-500 hover:bg-blue-600 text-white">Ringing</Badge>;
  }
  return <Badge variant="secondary">{safe}</Badge>;
}

function broadcastStatusBadge(status: string) {
  const safe = String(status || "running").toLowerCase();
  if (safe === "running") {
    return <Badge className="bg-blue-500 hover:bg-blue-600 text-white">Running</Badge>;
  }
  if (safe === "finished") {
    return <Badge className="bg-green-500 hover:bg-green-600 text-white">Finished</Badge>;
  }
  if (safe === "failed") {
    return <Badge className="bg-red-500 hover:bg-red-600 text-white">Failed</Badge>;
  }
  return <Badge variant="secondary">{safe}</Badge>;
}

export default function Admin() {
  const location = useLocation();
  const section = useMemo(() => sectionFromPath(location.pathname), [location.pathname]);

  const [overview, setOverview] = useState<AdminOverviewStats | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [campaigns, setCampaigns] = useState<AdminCampaignRow[]>([]);
  const [adminCdrs, setAdminCdrs] = useState<AdminCdrRow[]>([]);
  const [activityLogs, setActivityLogs] = useState<AdminActivityLogRow[]>([]);
  const [activityActions, setActivityActions] = useState<string[]>([]);
  const [liveCalls, setLiveCalls] = useState<AdminLiveCallRow[]>([]);
  const [liveLogs, setLiveLogs] = useState<AdminLiveLogRow[]>([]);
  const [jobs, setJobs] = useState<AdminBroadcastJob[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [userQuery, setUserQuery] = useState("");
  const [membershipFilter, setMembershipFilter] = useState("all");
  const [campaignQuery, setCampaignQuery] = useState("");
  const [cdrQuery, setCdrQuery] = useState("");
  const [cdrPage, setCdrPage] = useState(1);
  const [cdrPageSize, setCdrPageSize] = useState(200);
  const [cdrTotal, setCdrTotal] = useState(0);
  const [cdrTotalPages, setCdrTotalPages] = useState(1);
  const [cdrLoading, setCdrLoading] = useState(false);
  const [activityQuery, setActivityQuery] = useState("");
  const [activityAction, setActivityAction] = useState("all");
  const [activityPage, setActivityPage] = useState(1);
  const [activityPageSize, setActivityPageSize] = useState(200);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityTotalPages, setActivityTotalPages] = useState(1);
  const [activityLoading, setActivityLoading] = useState(false);

  const [selectedSips, setSelectedSips] = useState<string[]>([]);
  const [grantingSips, setGrantingSips] = useState<string[]>([]);
  const [batchGranting, setBatchGranting] = useState(false);

  const [broadcastText, setBroadcastText] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const loadOverview = useCallback(async () => {
    const response = await webappApi.getAdminOverview();
    setOverview(response.stats);
  }, []);

  const loadUsers = useCallback(async () => {
    const response = await webappApi.getAdminUsers(userQuery, membershipFilter);
    setUsers(response.users);
  }, [membershipFilter, userQuery]);

  const loadCampaigns = useCallback(async () => {
    const response = await webappApi.getAdminCampaigns(campaignQuery, 600);
    setCampaigns(response.campaigns);
  }, [campaignQuery]);

  const loadCdrs = useCallback(async (page: number, pageSize: number, query: string) => {
    setCdrLoading(true);
    try {
      const response = await webappApi.getAdminCdrs(query, page, pageSize);
      setAdminCdrs(response.cdrRecords);
      setCdrTotal(response.pagination.total);
      setCdrTotalPages(response.pagination.total_pages);
    } finally {
      setCdrLoading(false);
    }
  }, []);

  const loadActivityLogs = useCallback(
    async (
      page: number,
      pageSize: number,
      query: string,
      action: string,
    ) => {
      setActivityLoading(true);
      try {
        const response = await webappApi.getAdminActivityLogs(query, action, page, pageSize);
        setActivityLogs(response.logs);
        setActivityActions(response.actions || []);
        setActivityTotal(response.pagination.total);
        setActivityTotalPages(response.pagination.total_pages);
      } finally {
        setActivityLoading(false);
      }
    },
    [],
  );

  const loadLive = useCallback(async () => {
    const [callsResponse, logsResponse] = await Promise.all([
      webappApi.getAdminLiveCalls(),
      webappApi.getAdminLiveLogs(160),
    ]);
    setLiveCalls(callsResponse.liveCalls);
    setLiveLogs(logsResponse.logs);
  }, []);

  const loadJobs = useCallback(async () => {
    const response = await webappApi.getAdminBroadcastJobs();
    setJobs(response.jobs);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadOverview(), loadUsers(), loadCampaigns(), loadLive(), loadJobs()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, [loadCampaigns, loadJobs, loadLive, loadOverview, loadUsers]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (section !== "dashboard" && section !== "live" && section !== "broadcast") {
      return;
    }
    const timer = window.setInterval(() => {
      void loadLive();
      void loadJobs();
      void loadOverview();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [loadJobs, loadLive, loadOverview, section]);

  useEffect(() => {
    if (section === "cdrs") {
      void loadCdrs(cdrPage, cdrPageSize, cdrQuery);
    }
  }, [cdrPage, cdrPageSize, loadCdrs, section]);

  useEffect(() => {
    if (section === "activity") {
      void loadActivityLogs(activityPage, activityPageSize, activityQuery, activityAction);
    }
  }, [
    activityAction,
    activityPage,
    activityPageSize,
    loadActivityLogs,
    section,
  ]);

  const onRefresh = async () => {
    setRefreshing(true);
    setNotice(null);
    try {
      if (section === "users") {
        await Promise.all([loadOverview(), loadUsers()]);
      } else if (section === "live") {
        await Promise.all([loadOverview(), loadLive(), loadJobs()]);
      } else if (section === "campaigns") {
        await Promise.all([loadOverview(), loadCampaigns()]);
      } else if (section === "cdrs") {
        await Promise.all([loadOverview(), loadCdrs(cdrPage, cdrPageSize, cdrQuery)]);
      } else if (section === "activity") {
        await Promise.all([
          loadOverview(),
          loadActivityLogs(activityPage, activityPageSize, activityQuery, activityAction),
        ]);
      } else if (section === "broadcast") {
        await Promise.all([loadOverview(), loadJobs()]);
      } else if (section === "security") {
        await loadOverview();
      } else {
        await Promise.all([loadOverview(), loadLive(), loadJobs()]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh admin data");
    } finally {
      setRefreshing(false);
    }
  };

  const onCdrSearch = () => {
    if (cdrPage !== 1) {
      setCdrPage(1);
      return;
    }
    void loadCdrs(1, cdrPageSize, cdrQuery);
  };

  const cdrFrom = adminCdrs.length > 0 ? (cdrPage - 1) * cdrPageSize + 1 : 0;
  const cdrTo = (cdrPage - 1) * cdrPageSize + adminCdrs.length;
  const activityFrom = activityLogs.length > 0 ? (activityPage - 1) * activityPageSize + 1 : 0;
  const activityTo = (activityPage - 1) * activityPageSize + activityLogs.length;
  const onActivitySearch = () => {
    if (activityPage !== 1) {
      setActivityPage(1);
      return;
    }
    void loadActivityLogs(1, activityPageSize, activityQuery, activityAction);
  };
  const selectedSipSet = useMemo(() => new Set(selectedSips), [selectedSips]);
  const selectableSips = useMemo(
    () =>
      users
        .map((row) => String(row.sip_username || "").trim())
        .filter((sip, index, arr) => Boolean(sip) && sip !== "-" && arr.indexOf(sip) === index),
    [users],
  );
  const allUsersSelected =
    selectableSips.length > 0 && selectableSips.every((sip) => selectedSipSet.has(sip));

  useEffect(() => {
    setSelectedSips((prev) => prev.filter((sip) => selectableSips.includes(sip)));
  }, [selectableSips]);

  const requestGrantDays = (defaultDays = 7): number | null => {
    const rawValue = window.prompt("Enter free subscription days (1-3650):", String(defaultDays));
    if (rawValue === null) {
      return null;
    }
    const parsed = Number.parseInt(rawValue.trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 3650) {
      setError("Invalid days. Enter a number between 1 and 3650.");
      return null;
    }
    return parsed;
  };

  const onGrantFree = async (
    sipUsername: string,
    durationDays: number,
    options?: { reloadAfter?: boolean; showNotice?: boolean; showError?: boolean },
  ): Promise<boolean> => {
    const safeSip = String(sipUsername || "").trim();
    if (!safeSip || safeSip === "-") {
      if (options?.showError !== false) {
        setError("Cannot grant membership: invalid SIP username");
      }
      return false;
    }

    setGrantingSips((prev) => (prev.includes(safeSip) ? prev : [...prev, safeSip]));
    if (options?.showError !== false) {
      setError(null);
    }
    if (options?.showNotice !== false) {
      setNotice(null);
    }
    try {
      const response = await webappApi.grantAdminFreeMembership(safeSip, durationDays);
      if (options?.showNotice !== false) {
        setNotice(
          `Free membership (${durationDays} days) granted to ${response.sip_username} until ${formatDate(response.membership.expiry_date)}`,
        );
      }
      if (options?.reloadAfter !== false) {
        await Promise.all([loadUsers(), loadOverview()]);
      }
      return true;
    } catch (err) {
      if (options?.showError !== false) {
        setError(err instanceof Error ? err.message : "Failed to grant free membership");
      }
      return false;
    } finally {
      setGrantingSips((prev) => prev.filter((sip) => sip !== safeSip));
    }
  };

  const onGrantFreePrompt = async (sipUsername: string) => {
    const days = requestGrantDays(7);
    if (days === null) {
      return;
    }
    await onGrantFree(sipUsername, days);
  };

  const onBatchGrantFree = async () => {
    if (selectedSips.length === 0) {
      setError("Select at least one user for batch grant");
      return;
    }
    const days = requestGrantDays(7);
    if (days === null) {
      return;
    }

    setBatchGranting(true);
    setError(null);
    setNotice(null);

    let success = 0;
    const failed: string[] = [];
    for (const sip of selectedSips) {
      const ok = await onGrantFree(sip, days, {
        reloadAfter: false,
        showNotice: false,
        showError: false,
      });
      if (ok) {
        success += 1;
      } else {
        failed.push(sip);
      }
    }

    await Promise.all([loadUsers(), loadOverview()]);
    setBatchGranting(false);

    if (success > 0) {
      setNotice(`Granted ${days} day(s) free membership to ${success} user(s).`);
    }
    if (failed.length > 0) {
      const preview = failed.slice(0, 10).join(", ");
      setError(
        `Failed for ${failed.length} user(s): ${preview}${failed.length > 10 ? " ..." : ""}`,
      );
    }
    setSelectedSips([]);
  };

  const toggleSelectAllUsers = (checked: boolean) => {
    if (checked) {
      setSelectedSips(selectableSips);
    } else {
      setSelectedSips([]);
    }
  };

  const toggleUserSelection = (sipUsername: string, checked: boolean) => {
    const safeSip = String(sipUsername || "").trim();
    if (!safeSip || safeSip === "-") {
      return;
    }
    setSelectedSips((prev) => {
      if (checked) {
        return prev.includes(safeSip) ? prev : [...prev, safeSip];
      }
      return prev.filter((sip) => sip !== safeSip);
    });
  };

  const onBroadcast = async () => {
    const text = broadcastText.trim();
    if (!text) {
      setError("Broadcast message is required");
      return;
    }

    setBroadcasting(true);
    setError(null);
    setNotice(null);
    try {
      await webappApi.startAdminBroadcast(text);
      setBroadcastText("");
      setNotice("Broadcast started. Delivery status is updating below.");
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start broadcast");
    } finally {
      setBroadcasting(false);
    }
  };

  const onChangePassword = async () => {
    setError(null);
    setNotice(null);
    if (!currentPassword || !newPassword) {
      setError("Current password and new password are required");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirm password do not match");
      return;
    }

    setSavingPassword(true);
    try {
      await webappApi.changeAdminPassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice("Admin password updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update admin password");
    } finally {
      setSavingPassword(false);
    }
  };

  const statCards = useMemo(
    () => [
      {
        key: "users",
        label: "Portal Users",
        value: overview?.total_users ?? 0,
        icon: Users,
      },
      {
        key: "telegram",
        label: "Telegram Linked",
        value: overview?.telegram_registered_users ?? 0,
        icon: BadgeCheck,
      },
      {
        key: "subs",
        label: "Active Memberships",
        value: overview?.active_memberships ?? 0,
        icon: ShieldCheck,
      },
      {
        key: "expiring",
        label: "Expiring (7 days)",
        value: overview?.expiring_memberships ?? 0,
        icon: Clock3,
      },
      {
        key: "runs",
        label: "Running Campaigns",
        value: overview?.running_campaigns ?? 0,
        icon: Activity,
      },
      {
        key: "calls",
        label: "Live Calls",
        value: overview?.live_calls ?? 0,
        icon: PhoneCall,
      },
      {
        key: "campaigns",
        label: "Total Campaigns",
        value: overview?.total_campaigns ?? 0,
        icon: Radio,
      },
      {
        key: "today",
        label: "Today Calls",
        value: overview?.today_calls ?? 0,
        icon: Megaphone,
      },
    ],
    [overview],
  );

  const sectionTitle = useMemo(() => {
    if (section === "users") return "Admin Users";
    if (section === "live") return "Live Calls & Logs";
    if (section === "campaigns") return "User Campaigns";
    if (section === "cdrs") return "All Users CDRs";
    if (section === "activity") return "Activity Logs";
    if (section === "broadcast") return "Broadcast";
    if (section === "security") return "Admin Security";
    return "Admin Dashboard";
  }, [section]);

  const sectionSubtitle = useMemo(() => {
    if (section === "users") return "Manage Telegram-linked users and grant free memberships.";
    if (section === "live") return "Monitor all users' live calls and realtime logs.";
    if (section === "campaigns") return "View campaign activity across all users.";
    if (section === "cdrs") return "Server-wide call detail records from the local autodialer database.";
    if (section === "activity") return "Audit trail for login, subscriptions, caller ID changes, runs, and Telegram actions.";
    if (section === "broadcast") return "Send Telegram broadcasts and track delivery jobs.";
    if (section === "security") return "Change admin password and access security settings.";
    return "Manage users, memberships, campaigns, live calls, and broadcasts.";
  }, [section]);

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Admin Dashboard</h1>
        <p className="text-muted-foreground">Loading admin data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">{sectionTitle}</h1>
          <p className="text-muted-foreground mt-1">{sectionSubtitle}</p>
        </div>
        <Button variant="outline" onClick={() => void onRefresh()} disabled={refreshing}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {refreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {error ? (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
          {notice}
        </div>
      ) : null}

      {section === "dashboard" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {statCards.map((card) => (
            <Card key={card.key} className="shadow-sm">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{card.label}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{card.value}</p>
                </div>
                <card.icon className="h-6 w-6 text-primary" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {section === "users" && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Telegram Users and Memberships</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
              <div className="relative lg:col-span-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={userQuery}
                  onChange={(event) => setUserQuery(event.target.value)}
                  placeholder="Search SIP / Telegram / name"
                  className="pl-10"
                />
              </div>
              <div>
                <Select value={membershipFilter} onValueChange={setMembershipFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Membership" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Memberships</SelectItem>
                    <SelectItem value="active">Subscribed (Active)</SelectItem>
                    <SelectItem value="expiring">Expiring Soon</SelectItem>
                    <SelectItem value="inactive">Inactive/Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Button className="w-full" variant="secondary" onClick={() => void loadUsers()}>
                  Apply Filters
                </Button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Selected users: {selectedSips.length}
              </p>
              <Button
                onClick={() => void onBatchGrantFree()}
                disabled={batchGranting || selectedSips.length === 0}
              >
                {batchGranting
                  ? "Granting..."
                  : `Grant Free to Selected${selectedSips.length > 0 ? ` (${selectedSips.length})` : ""}`}
              </Button>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[48px]">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={allUsersSelected}
                        onChange={(event) => toggleSelectAllUsers(event.target.checked)}
                        aria-label="Select all users"
                        disabled={selectableSips.length === 0 || batchGranting}
                      />
                    </TableHead>
                    <TableHead>SIP User</TableHead>
                    <TableHead>Telegram Username</TableHead>
                    <TableHead>Telegram ID</TableHead>
                    <TableHead>Membership</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Campaigns</TableHead>
                    <TableHead>Active Runs</TableHead>
                    <TableHead>Last Run</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((row) => {
                    const safeSip = String(row.sip_username || "").trim();
                    const isSelectable = Boolean(safeSip) && safeSip !== "-";
                    const isSelected = isSelectable && selectedSipSet.has(safeSip);
                    const tgUsernameRaw = String(row.telegram_username || "").trim();
                    const tgUsernameText = tgUsernameRaw
                      ? (tgUsernameRaw.startsWith("@") ? tgUsernameRaw : `@${tgUsernameRaw}`)
                      : "Not available";
                    const tgIdText = row.telegram_registered && row.telegram_id
                      ? row.telegram_id
                      : "Not linked";
                    const tgNameText = String(row.telegram_name || "").trim();
                    const expiryText = row.membership.expiry_date
                      ? formatDate(row.membership.expiry_date)
                      : "-";
                    const loadingGrant = grantingSips.includes(safeSip);
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={isSelected}
                            onChange={(event) => toggleUserSelection(safeSip, event.target.checked)}
                            aria-label={`Select ${safeSip}`}
                            disabled={!isSelectable || batchGranting || loadingGrant}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm">{row.sip_username}</TableCell>
                        <TableCell className="text-sm">
                          {tgUsernameText}
                          {tgNameText ? (
                            <span className="block text-xs text-muted-foreground">{tgNameText}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm font-mono">{tgIdText}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {membershipBadge(row.membership.status)}
                            <span className="text-xs text-muted-foreground">{row.membership.plan_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {expiryText}
                          {row.membership.days_remaining !== null ? (
                            <span className="block text-xs text-muted-foreground">
                              {row.membership.days_remaining} day(s) left
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>{row.campaigns_total}</TableCell>
                        <TableCell>{row.active_runs}</TableCell>
                        <TableCell className="text-sm">{formatDate(row.last_run_at)}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            onClick={() => void onGrantFreePrompt(safeSip)}
                            disabled={loadingGrant || !isSelectable || batchGranting}
                          >
                            {loadingGrant ? "Granting..." : "Grant Free"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        No users found for current filters.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {section === "live" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">All Live Calls</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Number</TableHead>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>DTMF</TableHead>
                      <TableHead>Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {liveCalls.map((row) => (
                      <TableRow key={`${row.run_uuid}-${row.number}-${row.id}`}>
                        <TableCell className="font-mono text-xs">{row.sip_username}</TableCell>
                        <TableCell className="font-mono text-sm">{row.number}</TableCell>
                        <TableCell className="text-sm">{row.campaign}</TableCell>
                        <TableCell>{callStatusBadge(row.status)}</TableCell>
                        <TableCell>{row.dtmf || "-"}</TableCell>
                        <TableCell>{row.duration}</TableCell>
                      </TableRow>
                    ))}
                    {liveCalls.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No live calls currently running.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Live Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-md bg-muted/20 p-3 max-h-80 overflow-y-auto space-y-2">
                {liveLogs.map((log, index) => (
                  <div key={`${log.timestamp}-${index}`} className="text-sm">
                    <span className="text-xs text-muted-foreground mr-2">{log.timestamp}</span>
                    <span>{log.message}</span>
                  </div>
                ))}
                {liveLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No live logs available.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {section === "campaigns" && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Users Campaigns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
              <div className="relative lg:col-span-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={campaignQuery}
                  onChange={(event) => setCampaignQuery(event.target.value)}
                  placeholder="Search campaign name or SIP user"
                  className="pl-10"
                />
              </div>
              <Button variant="secondary" onClick={() => void loadCampaigns()}>
                Search Campaigns
              </Button>
            </div>

            <div className="overflow-x-auto">
              <Table className="table-fixed min-w-[980px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">User</TableHead>
                    <TableHead className="w-[360px]">Campaign</TableHead>
                    <TableHead className="w-[110px]">Status</TableHead>
                    <TableHead className="w-[90px]">Runs</TableHead>
                    <TableHead className="w-[110px]">Total Calls</TableHead>
                    <TableHead className="w-[110px]">DTMF Hits</TableHead>
                    <TableHead className="w-[180px]">Latest Run</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((row) => (
                    <TableRow key={`admin-campaign-${row.id}`}>
                      <TableCell className="font-mono text-xs truncate">{row.sip_username}</TableCell>
                      <TableCell className="text-sm whitespace-normal">
                        <p className="font-medium text-foreground leading-tight">{row.campaign_name}</p>
                        <span className="block text-xs text-muted-foreground leading-tight mt-1">
                          {row.campaign_type.toUpperCase()} / {row.audio_source.toUpperCase()} / {row.numbers_count} numbers
                        </span>
                      </TableCell>
                      <TableCell>{campaignStatusBadge(row.status)}</TableCell>
                      <TableCell className="text-sm">{row.runs_total}</TableCell>
                      <TableCell className="text-sm">{row.total_calls}</TableCell>
                      <TableCell className="text-sm">{row.dtmf_hits}</TableCell>
                      <TableCell className="text-sm">{formatDate(row.latest_run_at)}</TableCell>
                    </TableRow>
                  ))}
                  {campaigns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No campaigns found.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {section === "cdrs" && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Server Wide CDRs ({cdrTotal})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-6 gap-3">
              <div className="relative lg:col-span-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={cdrQuery}
                  onChange={(event) => setCdrQuery(event.target.value)}
                  placeholder="Search SIP user, number, caller ID, campaign, DTMF, or result"
                  className="pl-10"
                />
              </div>
              <Select
                value={String(cdrPageSize)}
                onValueChange={(value) => {
                  const next = Number.parseInt(value, 10);
                  if (Number.isFinite(next)) {
                    setCdrPageSize(next);
                    setCdrPage(1);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Rows" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="100">100 / page</SelectItem>
                  <SelectItem value="200">200 / page</SelectItem>
                  <SelectItem value="500">500 / page</SelectItem>
                  <SelectItem value="1000">1000 / page</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="secondary" onClick={onCdrSearch} disabled={cdrLoading}>
                Search CDRs
              </Button>
            </div>

            <div className="overflow-x-auto">
              <Table className="table-fixed min-w-[1180px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Date</TableHead>
                    <TableHead className="w-[130px]">SIP User</TableHead>
                    <TableHead className="w-[130px]">Number</TableHead>
                    <TableHead className="w-[120px]">Caller ID</TableHead>
                    <TableHead className="w-[220px]">Campaign</TableHead>
                    <TableHead className="w-[90px]">Duration</TableHead>
                    <TableHead className="w-[80px]">DTMF</TableHead>
                    <TableHead className="w-[100px]">Result</TableHead>
                    <TableHead className="w-[210px]">Run UUID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!cdrLoading ? adminCdrs.map((row) => (
                    <TableRow key={`admin-cdr-${row.id}`}>
                      <TableCell className="text-xs">{row.date}</TableCell>
                      <TableCell className="font-mono text-xs truncate">{row.sip_username}</TableCell>
                      <TableCell className="font-mono text-sm">{row.number}</TableCell>
                      <TableCell className="font-mono text-sm">{row.callerId || "-"}</TableCell>
                      <TableCell className="text-sm truncate">{row.campaign}</TableCell>
                      <TableCell>{row.duration}</TableCell>
                      <TableCell>{row.dtmf}</TableCell>
                      <TableCell>{cdrResultBadge(row.result)}</TableCell>
                      <TableCell className="font-mono text-xs truncate">{row.runUuid}</TableCell>
                    </TableRow>
                  )) : null}
                  {!cdrLoading && adminCdrs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No CDR records found.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {cdrLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        Loading CDR records...
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Showing {cdrFrom}-{cdrTo} of {cdrTotal}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCdrPage((prev) => Math.max(1, prev - 1))}
                  disabled={cdrLoading || cdrPage <= 1}
                >
                  Prev
                </Button>
                <span className="text-sm text-muted-foreground min-w-[110px] text-center">
                  Page {cdrPage} / {cdrTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCdrPage((prev) => Math.min(cdrTotalPages, prev + 1))}
                  disabled={cdrLoading || cdrPage >= cdrTotalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {section === "activity" && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">System Activity Logs ({activityTotal})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-7 gap-3">
              <div className="relative lg:col-span-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={activityQuery}
                  onChange={(event) => setActivityQuery(event.target.value)}
                  placeholder="Search action, user, target, run uuid, details, or IP"
                  className="pl-10"
                />
              </div>
              <Select
                value={activityAction}
                onValueChange={(value) => {
                  setActivityAction(value);
                  setActivityPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {activityActions.map((action) => (
                    <SelectItem key={action} value={action}>
                      {action}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(activityPageSize)}
                onValueChange={(value) => {
                  const next = Number.parseInt(value, 10);
                  if (Number.isFinite(next)) {
                    setActivityPageSize(next);
                    setActivityPage(1);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Rows" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="100">100 / page</SelectItem>
                  <SelectItem value="200">200 / page</SelectItem>
                  <SelectItem value="500">500 / page</SelectItem>
                  <SelectItem value="1000">1000 / page</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="secondary" onClick={onActivitySearch} disabled={activityLoading}>
                Search Logs
              </Button>
            </div>

            <div className="overflow-x-auto">
              <Table className="table-fixed min-w-[1320px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">Date</TableHead>
                    <TableHead className="w-[180px]">Action</TableHead>
                    <TableHead className="w-[160px]">Actor</TableHead>
                    <TableHead className="w-[150px]">Target</TableHead>
                    <TableHead className="w-[210px]">Run UUID</TableHead>
                    <TableHead className="w-[140px]">IP</TableHead>
                    <TableHead className="w-[320px]">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!activityLoading
                    ? activityLogs.map((row) => (
                      <TableRow key={`activity-log-${row.id}`}>
                        <TableCell className="text-xs">{row.date}</TableCell>
                        <TableCell className="font-mono text-xs">{row.action}</TableCell>
                        <TableCell className="text-sm">
                          <span className="font-mono text-xs">{row.actorUsername}</span>
                          <span className="block text-xs text-muted-foreground">{row.actorRole}</span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.targetUsername}</TableCell>
                        <TableCell className="font-mono text-xs truncate">{row.runUuid}</TableCell>
                        <TableCell className="font-mono text-xs">{row.ipAddress}</TableCell>
                        <TableCell className="text-xs whitespace-normal break-words">{row.detailsText}</TableCell>
                      </TableRow>
                    ))
                    : null}
                  {!activityLoading && activityLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No activity logs found.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {activityLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Loading activity logs...
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Showing {activityFrom}-{activityTo} of {activityTotal}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActivityPage((prev) => Math.max(1, prev - 1))}
                  disabled={activityLoading || activityPage <= 1}
                >
                  Prev
                </Button>
                <span className="text-sm text-muted-foreground min-w-[110px] text-center">
                  Page {activityPage} / {activityTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActivityPage((prev) => Math.min(activityTotalPages, prev + 1))}
                  disabled={activityLoading || activityPage >= activityTotalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {section === "broadcast" && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Telegram Broadcast</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
              <div className="lg:col-span-3">
                <Textarea
                  value={broadcastText}
                  onChange={(event) => setBroadcastText(event.target.value)}
                  placeholder="Type broadcast message for all linked Telegram users"
                  rows={4}
                />
              </div>
              <div className="flex lg:items-start">
                <Button className="w-full" onClick={() => void onBroadcast()} disabled={broadcasting}>
                  <Send className="h-4 w-4 mr-2" />
                  {broadcasting ? "Starting..." : "Start Broadcast"}
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Delivered</TableHead>
                    <TableHead>Failed</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Message Preview</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.job_id}>
                      <TableCell className="text-sm">{formatDate(job.started_at)}</TableCell>
                      <TableCell>{broadcastStatusBadge(job.status)}</TableCell>
                      <TableCell>{job.sent}</TableCell>
                      <TableCell>{job.failed}</TableCell>
                      <TableCell>{job.total}</TableCell>
                      <TableCell className="max-w-[320px] truncate">{job.text_preview}</TableCell>
                    </TableRow>
                  ))}
                  {jobs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No broadcast jobs yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {section === "security" && (
        <Card className="shadow-sm max-w-2xl">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <LockKeyhole className="h-5 w-5" />
              Admin Password
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Current Password</label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Enter current password"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">New Password</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="At least 8 characters"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Confirm New Password</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter new password"
              />
            </div>

            <Button onClick={() => void onChangePassword()} disabled={savingPassword}>
              {savingPassword ? "Saving..." : "Update Password"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
