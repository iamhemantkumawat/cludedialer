import { useEffect, useMemo, useState } from "react";
import { Save, Send, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/react-app/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Label } from "@/react-app/components/ui/label";
import { Button } from "@/react-app/components/ui/button";
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
import { useAuth } from "@/react-app/context/AuthContext";
import {
  webappApi,
  type CallerIdRow,
  type OutboundSettingsResponse,
  type SipUserRow,
} from "@/react-app/lib/api";
import { useLanguage } from "@/react-app/context/LanguageContext";

function getCallerForSip(callerIds: CallerIdRow[], sipUsername: string): string {
  const row = callerIds.find(
    (item) => item.sipUsername === sipUsername && item.number !== "Not Set",
  );
  return row?.number || "";
}

function normalizeCallerSelection(value: string): string {
  const normalized = (value || "").trim();
  return normalized === "Not Set" ? "" : normalized;
}

export default function Settings() {
  const { refreshUser, user } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [sipUsers, setSipUsers] = useState<SipUserRow[]>([]);
  const [trunkAccounts, setTrunkAccounts] = useState<SipUserRow[]>([]);
  const [callerIds, setCallerIds] = useState<CallerIdRow[]>([]);
  const [selectedSip, setSelectedSip] = useState("");
  const [selectedCallerId, setSelectedCallerId] = useState("");
  const [defaultingSip, setDefaultingSip] = useState<string | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await webappApi.getOutboundSettings();
      setSipUsers(response.sipUsers);
      setTrunkAccounts(response.trunkAccounts || []);
      setCallerIds(response.callerIds);
      setSelectedSip(response.defaultSipUser || response.sipUsers[0]?.username || "");
      setSelectedCallerId(normalizeCallerSelection(response.defaultCallerId || ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const callerOptions = useMemo(
    () =>
      callerIds.filter(
        (row) => row.sipUsername === selectedSip && row.number && row.number !== "Not Set",
      ),
    [callerIds, selectedSip],
  );

  const onSipChange = (value: string) => {
    setSelectedSip(value);
    const nextCaller = getCallerForSip(callerIds, value);
    setSelectedCallerId(nextCaller);
  };

  const applySettingsResponse = (response: OutboundSettingsResponse) => {
    setSipUsers(response.sipUsers);
    setTrunkAccounts(response.trunkAccounts || []);
    setCallerIds(response.callerIds);
    setSelectedSip(response.defaultSipUser || response.sipUsers[0]?.username || "");
    setSelectedCallerId(normalizeCallerSelection(response.defaultCallerId || ""));
  };

  const handleSave = async () => {
    if (!selectedSip) {
      setError("Please choose a SIP account");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await webappApi.saveOutboundSettings(selectedSip, selectedCallerId || "");
      applySettingsResponse(response);
      await refreshUser();
      setSuccess("Default outbound SIP and caller ID updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefaultSip = async (sipUsername: string) => {
    setDefaultingSip(sipUsername);
    setError(null);
    setSuccess(null);
    try {
      const response = await webappApi.setDefaultSipUser(sipUsername);
      applySettingsResponse(response);
      await refreshUser();
      setSuccess(`Default SIP account set to ${sipUsername}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set default SIP account");
    } finally {
      setDefaultingSip(null);
    }
  };

  const telegramIdValue = useMemo(() => {
    const raw = String(user?.telegram_id || "").trim();
    if (!raw || raw.startsWith("web:")) return "Not linked";
    return raw;
  }, [user?.telegram_id]);

  const telegramUsernameValue = useMemo(() => {
    const raw = String(user?.telegram_username || "").trim();
    if (!raw) return "Not available";
    return raw.startsWith("@") ? raw : `@${raw}`;
  }, [user?.telegram_username]);

  const telegramNameValue = useMemo(() => {
    const raw = String(user?.telegram_name || "").trim();
    return raw || "Not available";
  }, [user?.telegram_name]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">{t("page.settings.title")}</h1>
        <p className="text-muted-foreground mt-1">
          {t("page.settings.subtitle")}
        </p>
      </div>

      {error ? (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
          {success}
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <Card className="shadow-sm xl:col-span-2 border-sky-200/70 bg-gradient-to-br from-sky-50/70 via-background to-background">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold tracking-tight flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                <Send className="h-4 w-4" />
              </span>
              Telegram Link
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-xl border border-sky-100 bg-white/80 px-3 py-2.5 flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold tracking-wide uppercase text-slate-500">Telegram ID</span>
              <span className="font-mono text-sm text-slate-900">{telegramIdValue}</span>
            </div>
            <div className="rounded-xl border border-sky-100 bg-white/80 px-3 py-2.5 flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold tracking-wide uppercase text-slate-500">Username</span>
              <span className="font-medium text-slate-900">{telegramUsernameValue}</span>
            </div>
            <div className="rounded-xl border border-sky-100 bg-white/80 px-3 py-2.5 flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold tracking-wide uppercase text-slate-500">Name</span>
              <span className="font-medium text-slate-900">{telegramNameValue}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm xl:col-span-3 border-emerald-200/70 bg-gradient-to-br from-emerald-50/70 via-background to-background">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold tracking-tight flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <SlidersHorizontal className="h-4 w-4" />
              </span>
              Outbound Defaults
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label
                  htmlFor="defaultSip"
                  className="text-[11px] font-semibold tracking-wide uppercase text-slate-500"
                >
                  Default SIP Account
                </Label>
                <Select value={selectedSip} onValueChange={onSipChange} disabled={loading || saving}>
                  <SelectTrigger id="defaultSip" className="h-11 bg-white/85 border-emerald-200/70">
                    <SelectValue placeholder="Select SIP account" />
                  </SelectTrigger>
                  <SelectContent>
                    {sipUsers.map((sip) => (
                      <SelectItem key={sip.id} value={sip.username}>
                        {sip.isDefault ? `${sip.username} (Default)` : sip.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="defaultCallerId"
                  className="text-[11px] font-semibold tracking-wide uppercase text-slate-500"
                >
                  Default Caller ID
                </Label>
                <Select
                  value={selectedCallerId}
                  onValueChange={setSelectedCallerId}
                  disabled={loading || saving || callerOptions.length === 0}
                >
                  <SelectTrigger id="defaultCallerId" className="h-11 bg-white/85 border-emerald-200/70">
                    <SelectValue
                      placeholder={
                        callerOptions.length === 0
                          ? "No caller ID available for selected SIP"
                          : "Select caller ID"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {callerOptions.map((caller) => (
                      <SelectItem key={caller.id} value={caller.number}>
                        {caller.number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="pt-1">
              <Button onClick={() => void handleSave()} disabled={loading || saving} className="shadow-sm">
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Set Default SIP Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SIP Username</TableHead>
                  <TableHead>Caller ID</TableHead>
                  <TableHead>Line Status</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sipUsers.map((sip) => {
                  const isLoadingRow = defaultingSip === sip.username;
                  return (
                    <TableRow key={`settings-sip-${sip.id}-${sip.username}`}>
                      <TableCell className="font-medium">{sip.username}</TableCell>
                      <TableCell className="font-mono text-sm">{sip.callerId || "Not Set"}</TableCell>
                      <TableCell>{sip.lineStatus || "-"}</TableCell>
                      <TableCell>
                        {sip.isDefault ? (
                          <Badge className="bg-blue-500 hover:bg-blue-600 text-white">Default</Badge>
                        ) : (
                          <Badge variant="secondary">No</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="sm"
                          variant={sip.isDefault ? "secondary" : "default"}
                          disabled={loading || saving || isLoadingRow || sip.isDefault}
                          onClick={() => void handleSetDefaultSip(sip.username)}
                        >
                          {isLoadingRow ? "Setting..." : sip.isDefault ? "Selected" : "Set as Default"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {!loading && sipUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No SIP users available.
                    </TableCell>
                  </TableRow>
                ) : null}

                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Loading SIP users...
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          {trunkAccounts.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Trunk accounts are shown in SIP Accounts and cannot be selected as default.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
