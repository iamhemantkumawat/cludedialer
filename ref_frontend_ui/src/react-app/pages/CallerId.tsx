import { useEffect, useState } from "react";
import { Eye, EyeOff, PhoneCall, Server, UserCircle2 } from "lucide-react";
import { Badge } from "@/react-app/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/react-app/components/ui/table";
import { Input } from "@/react-app/components/ui/input";
import {
  webappApi,
  type OutboundSettingsResponse,
  type SipUserRow,
} from "@/react-app/lib/api";
import { useLanguage } from "@/react-app/context/LanguageContext";

function maskPassword(password: string): string {
  if (!password) return "-";
  return "*".repeat(Math.max(password.length, 6));
}

function normalizeCallerId(value: string): string {
  const normalized = (value || "").trim();
  return normalized.toLowerCase() === "not set" ? "" : normalized;
}

function buildCallerDrafts(
  sipUsers: SipUserRow[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of sipUsers) {
    map[row.username] = normalizeCallerId(row.callerId || "");
  }
  return map;
}

export default function CallerId() {
  const { t } = useLanguage();
  const [sipUsers, setSipUsers] = useState<SipUserRow[]>([]);
  const [trunkAccounts, setTrunkAccounts] = useState<SipUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [callerDrafts, setCallerDrafts] = useState<Record<string, string>>({});
  const [savingByUser, setSavingByUser] = useState<Record<string, boolean>>({});

  const applyProfile = (response: OutboundSettingsResponse) => {
    const nextSipUsers = response.sipUsers || [];
    const nextTrunks = response.trunkAccounts || [];
    setSipUsers(nextSipUsers);
    setTrunkAccounts(nextTrunks);
    setCallerDrafts(buildCallerDrafts(nextSipUsers));
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const response = await webappApi.getCallerIds();
        applyProfile(response);
        setSuccess(null);
        setError(null);
      } catch (err) {
        setSuccess(null);
        setError(err instanceof Error ? err.message : "Failed to load SIP users");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const togglePassword = (username: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [username]: !prev[username] }));
  };

  const setDraftValue = (username: string, value: string) => {
    setCallerDrafts((prev) => ({ ...prev, [username]: value }));
  };

  const handleSetCallerId = async (username: string) => {
    const callerId = normalizeCallerId(callerDrafts[username] || "");
    if (!callerId) {
      setSuccess(null);
      setError("Caller ID cannot be empty.");
      return;
    }

    setSavingByUser((prev) => ({ ...prev, [username]: true }));
    setError(null);
    setSuccess(null);
    try {
      const response = await webappApi.setSipUserCallerId(username, callerId);
      applyProfile(response);
      setSuccess(`Caller ID updated for ${username}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set caller ID");
    } finally {
      setSavingByUser((prev) => ({ ...prev, [username]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">{t("page.callerId.title")}</h1>
        <p className="text-muted-foreground mt-1">
          {t("page.callerId.subtitle")}
        </p>
      </div>

      {error ? (
        <div className="text-destructive text-sm bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
          {success}
        </div>
      ) : null}

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">SIP Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SIP Username</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Caller ID</TableHead>
                  <TableHead>Password</TableHead>
                  <TableHead>Line Status</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead>Set Caller ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sipUsers.map((sip) => {
                  const isVisible = !!visiblePasswords[sip.username];
                  const password = sip.sipPassword || "";
                  const isSaving = !!savingByUser[sip.username];
                  const draftValue = callerDrafts[sip.username] || "";
                  return (
                    <TableRow key={sip.id}>
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-2">
                          <UserCircle2 className="h-4 w-4 text-muted-foreground" />
                          {sip.username}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{sip.host || "dynamic"}</TableCell>
                      <TableCell className="font-mono text-sm">
                        <span className="inline-flex items-center gap-2">
                          <PhoneCall className="h-4 w-4 text-muted-foreground" />
                          {sip.callerId}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 max-w-[210px]">
                          <span className="font-mono text-sm truncate">
                            {isVisible ? password || "-" : maskPassword(password)}
                          </span>
                          {password ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => togglePassword(sip.username)}
                              className="h-7 w-7"
                            >
                              {isVisible ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{sip.lineStatus || "-"}</TableCell>
                      <TableCell>
                        {sip.isDefault ? (
                          <Badge className="bg-blue-500 hover:bg-blue-600 text-white">Default</Badge>
                        ) : (
                          <Badge variant="secondary">No</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2 min-w-[210px]">
                          <Input
                            value={draftValue}
                            onChange={(event) => setDraftValue(sip.username, event.target.value)}
                            placeholder="Enter caller ID"
                            disabled={loading || isSaving}
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleSetCallerId(sip.username)}
                            disabled={loading || isSaving || !normalizeCallerId(draftValue)}
                          >
                            {isSaving ? "Saving..." : "Set Caller ID"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {!loading && sipUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No SIP users found for this account.
                    </TableCell>
                  </TableRow>
                ) : null}

                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Loading SIP users...
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
          <CardTitle className="text-lg font-semibold">Trunk Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trunk Username</TableHead>
                  <TableHead>Host/IP</TableHead>
                  <TableHead>Caller ID</TableHead>
                  <TableHead>Line Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trunkAccounts.map((trunk) => {
                  return (
                    <TableRow key={`trunk-${trunk.id}-${trunk.username}`}>
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-2">
                          <Server className="h-4 w-4 text-muted-foreground" />
                          {trunk.username}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{trunk.host || "-"}</TableCell>
                      <TableCell className="font-mono text-sm">{trunk.callerId || "Not Set"}</TableCell>
                      <TableCell>{trunk.lineStatus || "-"}</TableCell>
                    </TableRow>
                  );
                })}

                {!loading && trunkAccounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No trunk accounts found.
                    </TableCell>
                  </TableRow>
                ) : null}

                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Loading trunk accounts...
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
