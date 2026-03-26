import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Play,
  Pencil,
  Trash2,
  Phone,
  Keyboard,
  MoreHorizontal,
  Loader2,
} from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Badge } from "@/react-app/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/react-app/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/react-app/components/ui/dropdown-menu";
import CreateCampaignModal, {
  type CampaignFormData,
} from "@/react-app/components/campaigns/CreateCampaignModal";
import {
  webappApi,
  type CampaignAudioSource,
  type CampaignRow,
  type CallerIdRow,
} from "@/react-app/lib/api";
import { useLanguage } from "@/react-app/context/LanguageContext";

function toCampaignAudioSource(value: string): CampaignAudioSource {
  return value === "upload" ? "upload" : "tts";
}

export default function Campaigns() {
  const { t } = useLanguage();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [callerIds, setCallerIds] = useState<CallerIdRow[]>([]);
  const [callerIdsLoaded, setCallerIdsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<CampaignRow | null>(null);
  const [busyCampaignId, setBusyCampaignId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const response = await webappApi.getCampaigns();
      setCampaigns(response.campaigns);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  };

  const loadCallerIds = async (force = false) => {
    if (callerIdsLoaded && !force) {
      return;
    }
    try {
      const response = await webappApi.getCallerIds();
      setCallerIds(response.callerIds);
      setCallerIdsLoaded(true);
    } catch {
      setCallerIds([]);
      setCallerIdsLoaded(false);
    }
  };

  useEffect(() => {
    void loadCampaigns();
  }, []);

  const openCreateModal = async () => {
    await loadCallerIds();
    setIsCreateModalOpen(true);
  };

  const openEditModal = async (campaign: CampaignRow) => {
    setBusyCampaignId(campaign.id);
    try {
      await Promise.all([
        loadCallerIds(),
        webappApi.getCampaign(campaign.id).then((response) =>
          setEditingCampaign(response.campaign || campaign),
        ),
      ]);
    } catch {
      setEditingCampaign(campaign);
    } finally {
      setBusyCampaignId(null);
    }
  };

  const handleEditSave = async (data: CampaignFormData) => {
    if (!editingCampaign?.id) return;

    setEditSaving(true);
    setBusyCampaignId(editingCampaign.id);
    setError(null);
    try {
      await webappApi.updateCampaign(editingCampaign.id, data);
      setEditingCampaign(null);
      await loadCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update campaign");
    } finally {
      setBusyCampaignId(null);
      setEditSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setBusyCampaignId(id);
    setError(null);
    try {
      await webappApi.deleteCampaign(id);
      await loadCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete campaign");
    } finally {
      setBusyCampaignId(null);
    }
  };

  const handleCreate = async (data: CampaignFormData) => {
    setCreating(true);
    setError(null);
    try {
      await webappApi.createCampaign(data);
      setIsCreateModalOpen(false);
      await loadCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setCreating(false);
    }
  };

  const totalCalls = campaigns.reduce((sum, c) => sum + c.totalCalls, 0);
  const totalDtmf = campaigns.reduce((sum, c) => sum + c.dtmfResponses, 0);
  const activeCampaigns = campaigns.filter((c) => c.status === "active").length;

  const editInitialData = useMemo<Partial<CampaignFormData> | undefined>(() => {
    if (!editingCampaign) return undefined;
    return {
      name: editingCampaign.name || "",
      callerId: editingCampaign.callerId || "",
      audioSource: toCampaignAudioSource(editingCampaign.audioSource),
      ttsText: editingCampaign.ivrText || "",
      ttsVoice: editingCampaign.ttsVoice || "en_us_female",
      concurrency: editingCampaign.concurrency ?? 3,
      maxCallDuration: editingCampaign.maxCallDuration ?? 60,
      retryAttempts: editingCampaign.retryAttempts ?? 3,
      retryDelay: editingCampaign.retryDelay ?? 300,
      dtmfMaxDigits: editingCampaign.dtmfMaxDigits ?? 1,
      enableDtmf: editingCampaign.enableDtmf ?? true,
      enableRecording: editingCampaign.enableRecording ?? false,
    };
  }, [editingCampaign]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">{t("page.campaigns.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("page.campaigns.subtitle")}</p>
        </div>
        <Button onClick={() => void openCreateModal()} className="shadow-md" disabled={creating}>
          <Plus className="h-4 w-4 mr-2" />
          Create Campaign
        </Button>
      </div>

      {error ? (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="bg-green-100 p-3 rounded-xl">
              <Play className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Campaigns</p>
              <p className="text-2xl font-bold">{activeCampaigns}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="bg-blue-100 p-3 rounded-xl">
              <Phone className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Calls</p>
              <p className="text-2xl font-bold">{totalCalls.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="bg-purple-100 p-3 rounded-xl">
              <Keyboard className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">DTMF Responses</p>
              <p className="text-2xl font-bold">{totalDtmf.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">All Campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="table-fixed min-w-[980px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Campaign Name</TableHead>
                  <TableHead className="hidden md:table-cell w-[170px]">Caller ID</TableHead>
                  <TableHead className="hidden lg:table-cell w-[150px]">SIP Account</TableHead>
                  <TableHead className="w-[300px]">Audio</TableHead>
                  <TableHead className="w-[110px] text-right">Total Calls</TableHead>
                  <TableHead className="w-[90px] text-right hidden sm:table-cell">DTMF</TableHead>
                  <TableHead className="w-[100px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => {
                  const busy = busyCampaignId === campaign.id;
                  const audioPreviewUrl =
                    campaign.audioPreviewUrl || webappApi.getCampaignAudioPreviewUrl(campaign.id);
                  const ttsPreview =
                    campaign.audioSource === "tts"
                      ? (campaign.ivrTextPreview || campaign.ivrText || "").trim()
                      : "Uploaded audio message";
                  return (
                    <TableRow key={campaign.id}>
                      <TableCell className="font-medium truncate max-w-[170px]" title={campaign.name}>
                        {campaign.name}
                      </TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-sm w-[170px]">
                        {campaign.callerId}
                      </TableCell>
                      <TableCell
                        className="hidden lg:table-cell text-sm text-muted-foreground truncate max-w-[140px]"
                        title={campaign.sipAccount}
                      >
                        {campaign.sipAccount}
                      </TableCell>
                      <TableCell className="w-[300px]">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="uppercase text-[10px] tracking-wide">
                              {campaign.audioSource === "upload" ? "Upload" : "TTS"}
                            </Badge>
                          </div>
                          <p
                            className="text-xs text-muted-foreground truncate max-w-[260px]"
                            title={ttsPreview}
                          >
                            {ttsPreview || "-"}
                          </p>
                          <audio controls preload="none" src={audioPreviewUrl} className="h-9 w-[220px] max-w-full">
                            <track kind="captions" />
                          </audio>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{campaign.totalCalls.toLocaleString()}</TableCell>
                      <TableCell className="text-right hidden sm:table-cell">
                        {campaign.dtmfResponses}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <div className="hidden sm:flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={busy || editSaving}
                              onClick={() => void openEditModal(campaign)}
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            >
                              {busy && editSaving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Pencil className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={busy}
                              onClick={() => void handleDelete(campaign.id)}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              {busy && !editSaving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                          <div className="sm:hidden">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" disabled={busy}>
                                  {busy ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <MoreHorizontal className="h-4 w-4" />
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => void openEditModal(campaign)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => void handleDelete(campaign.id)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {!loading && campaigns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No campaigns yet. Create your first campaign to get started.
                    </TableCell>
                  </TableRow>
                ) : null}

                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Loading campaigns...
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <CreateCampaignModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onSubmit={(data) => void handleCreate(data)}
        callerIds={callerIds}
        mode="create"
        title="Create New Campaign"
        submitLabel="Create Campaign"
      />

      <CreateCampaignModal
        open={Boolean(editingCampaign)}
        onOpenChange={(open) => {
          if (!open) setEditingCampaign(null);
        }}
        onSubmit={(data) => void handleEditSave(data)}
        callerIds={callerIds}
        mode="edit"
        title="Edit Campaign"
        submitLabel="Save Changes"
        initialData={editInitialData}
        existingAudioPreviewUrl={
          editingCampaign && editingCampaign.audioSource === "upload"
            ? editingCampaign.audioPreviewUrl || webappApi.getCampaignAudioPreviewUrl(editingCampaign.id)
            : null
        }
      />
    </div>
  );
}
