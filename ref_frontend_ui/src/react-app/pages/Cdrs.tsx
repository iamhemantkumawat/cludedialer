import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, RefreshCw, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Input } from "@/react-app/components/ui/input";
import { Button } from "@/react-app/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/react-app/components/ui/table";
import { Badge } from "@/react-app/components/ui/badge";
import { webappApi, type CdrRow } from "@/react-app/lib/api";
import { useLanguage } from "@/react-app/context/LanguageContext";

type SortField = "date" | "number" | "callerId" | "campaign" | "duration" | "dtmf" | "result";
type SortDirection = "asc" | "desc";

function resultBadge(result: string) {
  if (result === "answered") {
    return <Badge className="bg-green-500 hover:bg-green-600 text-white">Answered</Badge>;
  }
  if (result === "no_answer") {
    return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">No Answer</Badge>;
  }
  if (result === "failed") {
    return <Badge className="bg-red-500 hover:bg-red-600 text-white">Failed</Badge>;
  }
  return <Badge variant="secondary">{result}</Badge>;
}

function parseDurationToSeconds(duration: string): number {
  const raw = String(duration || "").trim();
  const parts = raw.split(":").map((token) => Number.parseInt(token, 10));
  if (parts.length === 2 && parts.every((value) => Number.isFinite(value))) {
    return Math.max(parts[0], 0) * 60 + Math.max(parts[1], 0);
  }
  if (parts.length === 3 && parts.every((value) => Number.isFinite(value))) {
    return Math.max(parts[0], 0) * 3600 + Math.max(parts[1], 0) * 60 + Math.max(parts[2], 0);
  }
  return 0;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function compareNumericText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

function dtmfSortValue(raw: string): { isNumber: boolean; numeric: number; text: string } {
  const normalized = String(raw || "").trim();
  if (/^\d+$/.test(normalized)) {
    return { isNumber: true, numeric: Number.parseInt(normalized, 10), text: normalized };
  }
  return { isNumber: false, numeric: Number.MAX_SAFE_INTEGER, text: normalized || "-" };
}

export default function Cdrs() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<CdrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [error, setError] = useState<string | null>(null);

  const loadRows = async () => {
    setLoading(true);
    try {
      const response = await webappApi.getLocalCdrs();
      setRows(response.cdrRecords);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load CDRs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, []);

  const handleSortChange = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDirection(field === "date" ? "desc" : "asc");
  };

  const filteredAndSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filteredRows = !q
      ? rows
      : rows.filter(
      (row) =>
        row.number.toLowerCase().includes(q) ||
        String(row.callerId || "").toLowerCase().includes(q) ||
        row.campaign.toLowerCase().includes(q) ||
        row.dtmf.toLowerCase().includes(q) ||
        row.result.toLowerCase().includes(q),
    );

    const sortedRows = [...filteredRows].sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") {
        cmp = compareText(a.date, b.date);
      } else if (sortField === "number") {
        cmp = compareNumericText(a.number, b.number);
      } else if (sortField === "callerId") {
        cmp = compareNumericText(String(a.callerId || ""), String(b.callerId || ""));
      } else if (sortField === "campaign") {
        cmp = compareText(a.campaign, b.campaign);
      } else if (sortField === "duration") {
        const aSeconds = Number.isFinite(a.durationSeconds)
          ? Number(a.durationSeconds)
          : parseDurationToSeconds(a.duration);
        const bSeconds = Number.isFinite(b.durationSeconds)
          ? Number(b.durationSeconds)
          : parseDurationToSeconds(b.duration);
        cmp = aSeconds - bSeconds;
      } else if (sortField === "dtmf") {
        const aDtmf = dtmfSortValue(a.dtmf);
        const bDtmf = dtmfSortValue(b.dtmf);
        cmp = aDtmf.numeric - bDtmf.numeric;
        if (cmp === 0) {
          cmp = compareText(aDtmf.text, bDtmf.text);
        }
      } else if (sortField === "result") {
        cmp = compareText(a.result, b.result);
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });

    return sortedRows;
  }, [rows, search, sortField, sortDirection]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">{t("page.cdr.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("page.cdr.subtitle")}</p>
        </div>
        <Button variant="outline" onClick={() => void loadRows()} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by number, caller ID, campaign, DTMF, or status"
                className="pl-10"
              />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">CDR Records ({filteredAndSorted.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? <p className="text-destructive text-sm mb-3">{error}</p> : null}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => handleSortChange("date")}
                      className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                    >
                      Date
                      {sortField !== "date" ? (
                        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : sortDirection === "asc" ? (
                        <ArrowUp className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5 text-primary" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => handleSortChange("number")}
                      className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                    >
                      Number
                      {sortField !== "number" ? (
                        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : sortDirection === "asc" ? (
                        <ArrowUp className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5 text-primary" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => handleSortChange("callerId")}
                      className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                    >
                      Caller ID
                      {sortField !== "callerId" ? (
                        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : sortDirection === "asc" ? (
                        <ArrowUp className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5 text-primary" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    <button
                      type="button"
                      onClick={() => handleSortChange("campaign")}
                      className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                    >
                      Campaign
                      {sortField !== "campaign" ? (
                        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : sortDirection === "asc" ? (
                        <ArrowUp className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5 text-primary" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => handleSortChange("duration")}
                      className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                    >
                      Duration
                      {sortField !== "duration" ? (
                        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : sortDirection === "asc" ? (
                        <ArrowUp className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5 text-primary" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => handleSortChange("dtmf")}
                      className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                    >
                      DTMF
                      {sortField !== "dtmf" ? (
                        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : sortDirection === "asc" ? (
                        <ArrowUp className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5 text-primary" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => handleSortChange("result")}
                      className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                    >
                      Result
                      {sortField !== "result" ? (
                        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : sortDirection === "asc" ? (
                        <ArrowUp className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5 text-primary" />
                      )}
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSorted.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm">{row.date}</TableCell>
                    <TableCell className="font-mono text-sm">{row.number}</TableCell>
                    <TableCell className="font-mono text-sm">{row.callerId || "-"}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm">{row.campaign}</TableCell>
                    <TableCell>{row.duration}</TableCell>
                    <TableCell>{row.dtmf}</TableCell>
                    <TableCell>{resultBadge(row.result)}</TableCell>
                  </TableRow>
                ))}
                {!loading && filteredAndSorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No CDR records found.
                    </TableCell>
                  </TableRow>
                ) : null}
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Loading CDR records...
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
