import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  History,
  Keyboard,
  PhoneCall,
  PhoneOff,
  RefreshCw,
  Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Input } from "@/react-app/components/ui/input";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/react-app/components/ui/table";
import { webappApi, type CampaignHistoryRow } from "@/react-app/lib/api";
import { useLanguage } from "@/react-app/context/LanguageContext";

function runStatusBadge(status: string) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "running") {
    return <Badge className="bg-blue-500 hover:bg-blue-600 text-white">Running</Badge>;
  }
  if (normalized === "failed") {
    return <Badge className="bg-red-500 hover:bg-red-600 text-white">Failed</Badge>;
  }
  return <Badge className="bg-green-500 hover:bg-green-600 text-white">Completed</Badge>;
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatRate(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(2)}%`;
}

export default function CampaignHistory() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<CampaignHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);

  const loadRows = async () => {
    setLoading(true);
    try {
      const response = await webappApi.getCampaignHistory(240);
      setRows(response.history || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaign history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, []);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return rows;
    }
    return rows.filter((row) => {
      return (
        String(row.campaignName || "").toLowerCase().includes(q) ||
        String(row.runUuid || "").toLowerCase().includes(q) ||
        String(row.runStatus || "").toLowerCase().includes(q) ||
        String(row.audioSource || "").toLowerCase().includes(q)
      );
    });
  }, [rows, query]);

  const totals = useMemo(() => {
    const totalRuns = filteredRows.length;
    const totalDialed = filteredRows.reduce((sum, row) => sum + Number(row.totalNumbers || 0), 0);
    const totalAnswered = filteredRows.reduce((sum, row) => sum + Number(row.answeredCount || 0), 0);
    const totalDtmf = filteredRows.reduce((sum, row) => sum + Number(row.dtmfHits || 0), 0);
    const answerRate = totalDialed > 0 ? (totalAnswered / totalDialed) * 100 : 0;
    const dtmfRate = totalDialed > 0 ? (totalDtmf / totalDialed) * 100 : 0;
    return {
      totalRuns,
      totalDialed,
      totalAnswered,
      totalDtmf,
      answerRate,
      dtmfRate,
    };
  }, [filteredRows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">{t("page.campaignHistory.title")}</h1>
          <p className="text-muted-foreground mt-1">
            {t("page.campaignHistory.subtitle")}
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadRows()} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-blue-100 p-2.5 rounded-xl">
              <History className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Runs</p>
              <p className="text-2xl font-bold">{totals.totalRuns}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-slate-100 p-2.5 rounded-xl">
              <PhoneCall className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Numbers Dialed</p>
              <p className="text-2xl font-bold">{totals.totalDialed}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-green-100 p-2.5 rounded-xl">
              <PhoneCall className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Answered</p>
              <p className="text-2xl font-bold">{totals.totalAnswered}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-purple-100 p-2.5 rounded-xl">
              <Keyboard className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">DTMF Hits</p>
              <p className="text-2xl font-bold">{totals.totalDtmf}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Success Rates</p>
            <p className="text-sm font-semibold mt-1">Answer: {formatRate(totals.answerRate)}</p>
            <p className="text-sm font-semibold">DTMF: {formatRate(totals.dtmfRate)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by campaign, run UUID, audio type, or status"
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            Campaign Runs ({filteredRows.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? <p className="text-destructive text-sm mb-3">{error}</p> : null}
          <div className="overflow-x-auto">
            <Table className="table-fixed min-w-[1120px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[230px]">Campaign</TableHead>
                  <TableHead className="hidden md:table-cell w-[170px]">Started</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead className="w-[90px] text-right">Dialed</TableHead>
                  <TableHead className="w-[95px] text-right">Answered</TableHead>
                  <TableHead className="w-[85px] text-right">Failed</TableHead>
                  <TableHead className="w-[80px] text-right">DTMF</TableHead>
                  <TableHead className="w-[140px] text-right hidden lg:table-cell">Rates</TableHead>
                  <TableHead className="w-[100px] text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => {
                  const isOpen = expandedRunId === row.runId;
                  const showAudioPlayer = row.campaignId > 0;
                  return (
                    <Fragment key={row.runId}>
                      <TableRow key={row.runId}>
                        <TableCell className="w-[230px]">
                          <div className="font-medium truncate max-w-[210px]" title={row.campaignName}>
                            {row.campaignName}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 truncate max-w-[210px]" title={row.runUuid}>
                            Run: {row.runUuid}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm w-[170px]">
                          {formatDateTime(row.startedAt)}
                        </TableCell>
                        <TableCell className="w-[110px]">{runStatusBadge(row.runStatus)}</TableCell>
                        <TableCell className="text-right">{row.totalNumbers}</TableCell>
                        <TableCell className="text-right text-green-700">{row.answeredCount}</TableCell>
                        <TableCell className="text-right text-red-700">{row.failedCount}</TableCell>
                        <TableCell className="text-right text-purple-700">{row.dtmfHits}</TableCell>
                        <TableCell className="text-right hidden lg:table-cell text-xs">
                          <div>Ans: {formatRate(row.answerRate)}</div>
                          <div>DTMF: {formatRate(row.dtmfSuccessRate)}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedRunId((prev) => (prev === row.runId ? null : row.runId))}
                          >
                            {isOpen ? (
                              <ChevronUp className="h-4 w-4 mr-1" />
                            ) : (
                              <ChevronDown className="h-4 w-4 mr-1" />
                            )}
                            {isOpen ? "Hide" : "View"}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isOpen ? (
                        <TableRow key={`${row.runId}-expanded`}>
                          <TableCell colSpan={9} className="bg-muted/30">
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 py-2 items-start">
                              <div className="space-y-3 min-w-0">
                                <div>
                                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                    Audio / TTS
                                  </p>
                                  <p className="text-sm mt-1">
                                    Source: <span className="font-medium uppercase">{row.audioSource}</span>
                                  </p>
                                  <p className="text-sm">
                                    Voice: <span className="font-medium">{row.ttsVoice || "-"}</span>
                                  </p>
                                  <p className="text-sm mt-1 leading-relaxed whitespace-pre-wrap break-words max-w-full">
                                    {row.ttsTextPreview || "-"}
                                  </p>
                                </div>
                                {showAudioPlayer ? (
                                  <audio
                                    controls
                                    preload="none"
                                    src={webappApi.getCampaignAudioPreviewUrl(row.campaignId)}
                                    className="w-full max-w-xl"
                                  />
                                ) : null}
                                <div className="text-xs text-muted-foreground">
                                  Finished: {formatDateTime(row.finishedAt)} | Duration: {row.durationFormatted}
                                </div>
                              </div>

                              <div className="space-y-3 min-w-0">
                                <div>
                                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                                    DTMF Numbers
                                  </p>
                                  {row.dtmfResults.length ? (
                                    <div className="max-h-28 overflow-auto border border-border rounded-md p-2 bg-background">
                                      <div className="flex flex-wrap gap-2">
                                        {row.dtmfResults.map((entry) => (
                                          <Badge key={`${row.runId}-${entry.number}-${entry.digit}`} className="bg-purple-500 hover:bg-purple-600 text-white">
                                            {entry.number}
                                            {" -> "}
                                            {entry.digit}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="text-sm text-muted-foreground">No DTMF hits in this run.</p>
                                  )}
                                </div>

                                <div>
                                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                                    Failed Numbers
                                  </p>
                                  {row.failedNumbers.length ? (
                                    <div className="max-h-28 overflow-auto border border-border rounded-md p-2 bg-background">
                                      <div className="flex flex-wrap gap-2">
                                        {row.failedNumbers.map((number) => (
                                          <Badge key={`${row.runId}-failed-${number}`} variant="secondary" className="bg-red-50 text-red-700 border border-red-200">
                                            <PhoneOff className="h-3 w-3 mr-1" />
                                            {number}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="text-sm text-muted-foreground">No failed numbers in this run.</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}

                {!loading && filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No campaign history found.
                    </TableCell>
                  </TableRow>
                ) : null}

                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Loading campaign history...
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
