import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Upload,
  Plus,
  Pencil,
  Search,
  Filter,
  Users,
  Phone,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  Loader2,
  Files,
  ClipboardPaste,
  RotateCcw,
  ListX,
  BadgeCheck,
  KeyRound,
} from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Badge } from "@/react-app/components/ui/badge";
import { Input } from "@/react-app/components/ui/input";
import { Textarea } from "@/react-app/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/react-app/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/react-app/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/react-app/components/ui/dialog";
import { Label } from "@/react-app/components/ui/label";
import {
  webappApi,
  type ContactCleanupMode,
  type ContactListRow,
  type ContactRow,
} from "@/react-app/lib/api";
import { useLanguage } from "@/react-app/context/LanguageContext";

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return (
        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
          <Clock className="h-3 w-3 mr-1" />
          Pending
        </Badge>
      );
    case "called":
      return (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
          <CheckCircle className="h-3 w-3 mr-1" />
          Called
        </Badge>
      );
    case "failed":
      return (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
          <XCircle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function Contacts() {
  const { t } = useLanguage();
  const [contactLists, setContactLists] = useState<ContactListRow[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [contacts, setContacts] = useState<ContactRow[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [isReplaceModalOpen, setIsReplaceModalOpen] = useState(false);
  const [isCreateListModalOpen, setIsCreateListModalOpen] = useState(false);
  const [isRenameListModalOpen, setIsRenameListModalOpen] = useState(false);

  const [newContact, setNewContact] = useState({ name: "", number: "" });
  const [newListName, setNewListName] = useState("");
  const [renameListName, setRenameListName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [replaceText, setReplaceText] = useState("");

  const [loading, setLoading] = useState(true);
  const [busyDeleteId, setBusyDeleteId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cleanupBusyMode, setCleanupBusyMode] = useState<ContactCleanupMode | null>(null);
  const [deletingList, setDeletingList] = useState(false);
  const [renamingList, setRenamingList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedList = useMemo(
    () => contactLists.find((list) => String(list.id) === selectedListId) || null,
    [contactLists, selectedListId],
  );

  const selectedListIdNumber = useMemo(() => Number.parseInt(selectedListId, 10) || 0, [selectedListId]);

  const loadContactLists = useCallback(async () => {
    const response = await webappApi.getContactLists();
    const rows = response.contactLists || [];
    setContactLists(rows);
    if (!rows.length) {
      setSelectedListId("");
      return rows;
    }

    setSelectedListId((prev) => {
      const exists = rows.some((list) => String(list.id) === prev);
      return exists ? prev : String(rows[0].id);
    });
    return rows;
  }, []);

  const loadContacts = useCallback(
    async (query: string, status: string, listId: number) => {
      setLoading(true);
      try {
        const response = await webappApi.getContacts(query, status, listId > 0 ? listId : undefined);
        setContacts(response.contacts);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load contacts");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const refreshAll = useCallback(async () => {
    try {
      const lists = await loadContactLists();
      const activeId = Number.parseInt(selectedListId, 10) || (lists[0]?.id ?? 0);
      if (activeId > 0) {
        await loadContacts(searchQuery, statusFilter, activeId);
      } else {
        setContacts([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contact data");
    }
  }, [loadContactLists, loadContacts, searchQuery, selectedListId, statusFilter]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!selectedListIdNumber) return;
    const timer = setTimeout(() => {
      void loadContacts(searchQuery, statusFilter, selectedListIdNumber);
    }, 250);
    return () => clearTimeout(timer);
  }, [loadContacts, searchQuery, selectedListIdNumber, statusFilter]);

  const handleCreateList = async (event: React.FormEvent) => {
    event.preventDefault();
    const safeName = newListName.trim();
    if (!safeName) {
      setError("Contact list name is required");
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      const response = await webappApi.createContactList(safeName);
      setNewListName("");
      setIsCreateListModalOpen(false);
      await loadContactLists();
      if (response.contactList?.id) {
        setSelectedListId(String(response.contactList.id));
      }
      setSuccess(`Contact list '${safeName}' created.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create list");
    }
  };

  const handleDeleteSelectedList = async () => {
    if (!selectedListIdNumber || !selectedList) return;
    if (selectedList.name === "Default") {
      setError("Default list cannot be deleted.");
      return;
    }

    setDeletingList(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await webappApi.deleteContactList(selectedListIdNumber);
      const rows = await loadContactLists();
      const nextId = response.movedToListId || rows[0]?.id || 0;
      setSelectedListId(nextId ? String(nextId) : "");
      await loadContacts(searchQuery, statusFilter, nextId || 0);
      setSuccess(`List '${selectedList.name}' deleted. Contacts were moved to Default.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete contact list");
    } finally {
      setDeletingList(false);
    }
  };

  const openRenameListModal = () => {
    if (!selectedList || selectedList.name === "Default") {
      return;
    }
    setRenameListName(selectedList.name);
    setIsRenameListModalOpen(true);
  };

  const handleRenameList = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedList || !selectedListIdNumber) {
      setError("Please select a contact list first.");
      return;
    }
    if (selectedList.name === "Default") {
      setError("Default list cannot be renamed.");
      return;
    }

    const safeName = renameListName.trim();
    if (!safeName) {
      setError("Contact list name is required.");
      return;
    }
    if (safeName === selectedList.name) {
      setIsRenameListModalOpen(false);
      return;
    }

    setRenamingList(true);
    setError(null);
    setSuccess(null);
    try {
      await webappApi.renameContactList(selectedListIdNumber, safeName);
      await loadContactLists();
      setSelectedListId(String(selectedListIdNumber));
      await loadContacts(searchQuery, statusFilter, selectedListIdNumber);
      setIsRenameListModalOpen(false);
      setSuccess(`List renamed to '${safeName}'.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename contact list");
    } finally {
      setRenamingList(false);
    }
  };

  const handleAddContact = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (!selectedListIdNumber) {
      setError("Please select a contact list first.");
      return;
    }
    try {
      await webappApi.addContact(newContact.name.trim(), newContact.number.trim(), selectedListIdNumber);
      setNewContact({ name: "", number: "" });
      setIsAddModalOpen(false);
      await Promise.all([
        loadContacts(searchQuery, statusFilter, selectedListIdNumber),
        loadContactLists(),
      ]);
      setSuccess("Contact added successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add contact");
    }
  };

  const handleDeleteContact = async (id: number) => {
    setBusyDeleteId(id);
    setError(null);
    setSuccess(null);
    try {
      await webappApi.deleteContact(id);
      await Promise.all([
        loadContacts(searchQuery, statusFilter, selectedListIdNumber),
        loadContactLists(),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete contact");
    } finally {
      setBusyDeleteId(null);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!selectedListIdNumber) {
      setError("Please select a contact list first.");
      event.target.value = "";
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await webappApi.importContactsCsv(file, selectedListIdNumber);
      setIsUploadModalOpen(false);
      await Promise.all([
        loadContacts(searchQuery, statusFilter, selectedListIdNumber),
        loadContactLists(),
      ]);
      setSuccess(`Imported ${response.added} new and updated ${response.updated} contact(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import file");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handlePasteImport = async () => {
    if (!selectedListIdNumber) {
      setError("Please select a contact list first.");
      return;
    }
    if (!pasteText.trim()) {
      setError("Paste contacts before import.");
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await webappApi.importContactsText(pasteText, selectedListIdNumber);
      setPasteText("");
      setIsPasteModalOpen(false);
      await Promise.all([
        loadContacts(searchQuery, statusFilter, selectedListIdNumber),
        loadContactLists(),
      ]);
      setSuccess(`Imported ${response.added} new and updated ${response.updated} contact(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import pasted contacts");
    } finally {
      setUploading(false);
    }
  };

  const runCleanupAction = useCallback(
    async (mode: ContactCleanupMode, successMessage: string, csvText = "") => {
      if (!selectedListIdNumber) {
        setError("Please select a contact list first.");
        return;
      }
      setCleanupBusyMode(mode);
      setError(null);
      setSuccess(null);
      try {
        const response = await webappApi.cleanupContacts(mode, selectedListIdNumber, csvText);
        await Promise.all([
          loadContacts(searchQuery, statusFilter, selectedListIdNumber),
          loadContactLists(),
        ]);
        const deletedInfo =
          typeof response.deleted === "number" ? ` Removed ${response.deleted} contact(s).` : "";
        const addedInfo =
          typeof response.added === "number" ? ` Added ${response.added} new contact(s).` : "";
        setSuccess(`${successMessage}${deletedInfo}${addedInfo}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to cleanup contacts");
      } finally {
        setCleanupBusyMode(null);
      }
    },
    [loadContactLists, loadContacts, searchQuery, selectedListIdNumber, statusFilter],
  );

  const handleClearAll = async () => {
    if (!selectedList) return;
    const confirmed = window.confirm(
      `Clear all contacts from '${selectedList.name}'? This cannot be undone.`,
    );
    if (!confirmed) return;
    await runCleanupAction("clear_all", `Cleared list '${selectedList.name}'.`);
  };

  const handleClearAnswered = async () => {
    await runCleanupAction("clear_answered", "Cleared answered contacts.");
  };

  const handleClearDtmf = async () => {
    await runCleanupAction("clear_dtmf", "Cleared DTMF contacts.");
  };

  const handleReplaceWithPaste = async () => {
    if (!replaceText.trim()) {
      setError("Paste numbers before replacing contacts.");
      return;
    }
    await runCleanupAction("replace_from_text", "Replaced contacts with pasted list.", replaceText);
    setReplaceText("");
    setIsReplaceModalOpen(false);
  };

  const totalContacts = selectedList?.contactsCount || contacts.length;
  const pendingContacts = selectedList?.pendingCount || contacts.filter((c) => c.status === "pending").length;
  const calledContacts = selectedList?.calledCount || contacts.filter((c) => c.status === "called").length;
  const filteredCount = contacts.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">{t("page.contacts.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("page.contacts.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setIsPasteModalOpen(true)} disabled={uploading}>
            <ClipboardPaste className="h-4 w-4 mr-2" />
            Paste Numbers
          </Button>
          <Button variant="outline" onClick={() => setIsUploadModalOpen(true)} disabled={uploading}>
            <Upload className="h-4 w-4 mr-2" />
            Upload CSV/TXT
          </Button>
          <Button onClick={() => setIsAddModalOpen(true)} className="shadow-md">
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        </div>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="h-full border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background shadow-sm">
          <CardContent className="p-4 h-full flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="bg-primary/15 p-2.5 rounded-xl">
                  <Files className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">Contact List</p>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-base font-semibold truncate">
                      {selectedList ? selectedList.name : "No list selected"}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary hover:bg-primary/10"
                      disabled={!selectedList || selectedList.name === "Default" || renamingList}
                      onClick={openRenameListModal}
                    >
                      {renamingList ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              </div>
              <Badge className="bg-primary/15 text-primary hover:bg-primary/20">
                {contactLists.length}
              </Badge>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Select List</Label>
              <Select value={selectedListId} onValueChange={setSelectedListId}>
                <SelectTrigger className="border-primary/20 focus:ring-primary/30">
                  <SelectValue placeholder="Choose contact list" />
                </SelectTrigger>
                <SelectContent>
                  {contactLists.map((list) => (
                    <SelectItem key={list.id} value={String(list.id)}>
                      {list.name} ({list.contactsCount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-auto">
              <Button
                type="button"
                variant="outline"
                className="border-primary/25 text-primary hover:bg-primary/10"
                onClick={() => setIsCreateListModalOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                New
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                disabled={!selectedList || selectedList.name === "Default" || deletingList}
                onClick={() => void handleDeleteSelectedList()}
              >
                {deletingList ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-1.5" />
                )}
                Delete
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="h-full border-blue-200/70 bg-gradient-to-br from-blue-50/80 via-background to-background shadow-sm">
          <CardContent className="p-4 h-full flex items-center gap-4">
            <div className="bg-blue-100/80 p-3 rounded-xl">
              <Users className="h-5 w-5 text-blue-700" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Contacts</p>
              <p className="text-2xl font-bold">{totalContacts}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="h-full border-amber-200/70 bg-gradient-to-br from-amber-50/85 via-background to-background shadow-sm">
          <CardContent className="p-4 h-full flex items-center gap-4">
            <div className="bg-amber-100/80 p-3 rounded-xl">
              <Clock className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold">{pendingContacts}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="h-full border-emerald-200/70 bg-gradient-to-br from-emerald-50/85 via-background to-background shadow-sm">
          <CardContent className="p-4 h-full flex items-center gap-4">
            <div className="bg-green-100/80 p-3 rounded-xl">
              <Phone className="h-5 w-5 text-green-700" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Called</p>
              <p className="text-2xl font-bold">{calledContacts}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or number..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="called">Called</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg font-semibold">
            Contact List
            <span className="text-sm font-normal text-muted-foreground ml-2">
              ({filteredCount} contacts)
            </span>
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setIsReplaceModalOpen(true)}
              disabled={!selectedListIdNumber || cleanupBusyMode !== null}
              className="border-primary/25 text-primary hover:bg-primary/10"
            >
              {cleanupBusyMode === "replace_from_text" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Clear All + Paste New
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleClearAnswered()}
              disabled={!selectedListIdNumber || cleanupBusyMode !== null}
              className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            >
              {cleanupBusyMode === "clear_answered" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <BadgeCheck className="h-3.5 w-3.5 mr-1.5" />
              )}
              Clear Answered Only
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleClearDtmf()}
              disabled={!selectedListIdNumber || cleanupBusyMode !== null}
              className="border-violet-200 text-violet-700 hover:bg-violet-50"
            >
              {cleanupBusyMode === "clear_dtmf" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <KeyRound className="h-3.5 w-3.5 mr-1.5" />
              )}
              Clear DTMF Only
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleClearAll()}
              disabled={!selectedListIdNumber || cleanupBusyMode !== null}
              className="border-red-200 text-red-600 hover:bg-red-50"
            >
              {cleanupBusyMode === "clear_all" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <ListX className="h-3.5 w-3.5 mr-1.5" />
              )}
              Clear All Contacts
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Attempts</TableHead>
                  <TableHead className="hidden sm:table-cell">Last Result</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell className="font-mono text-sm">{contact.number}</TableCell>
                    <TableCell className="font-medium">{contact.name}</TableCell>
                    <TableCell>{getStatusBadge(contact.status)}</TableCell>
                    <TableCell className="text-center">{contact.attempts}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {contact.lastResult}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={busyDeleteId === contact.id}
                        onClick={() => void handleDeleteContact(contact.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        {busyDeleteId === contact.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

                {!loading && contacts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {searchQuery || statusFilter !== "all"
                        ? "No contacts match your search criteria."
                        : "No contacts yet in selected list. Upload a CSV/TXT, paste numbers, or add manually."}
                    </TableCell>
                  </TableRow>
                ) : null}

                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Loading contacts...
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isCreateListModalOpen} onOpenChange={setIsCreateListModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Contact List</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateList} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contact-list-name">List Name</Label>
              <Input
                id="contact-list-name"
                placeholder="India Leads"
                value={newListName}
                onChange={(event) => setNewListName(event.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateListModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create List</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isRenameListModalOpen} onOpenChange={setIsRenameListModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Contact List</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRenameList} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rename-contact-list-name">New List Name</Label>
              <Input
                id="rename-contact-list-name"
                placeholder="Updated list name"
                value={renameListName}
                onChange={(event) => setRenameListName(event.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsRenameListModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={renamingList}>
                {renamingList ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Contact</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddContact} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contact-name">Name</Label>
              <Input
                id="contact-name"
                placeholder="Enter contact name"
                value={newContact.name}
                onChange={(event) => setNewContact({ ...newContact, name: event.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-number">Phone Number</Label>
              <Input
                id="contact-number"
                placeholder="+91 9988229920"
                value={newContact.number}
                onChange={(event) => setNewContact({ ...newContact, number: event.target.value })}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Add Contact</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload CSV/TXT File</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
              <input
                type="file"
                accept=".csv,.txt"
                onChange={(event) => void handleFileUpload(event)}
                className="hidden"
                id="csv-upload"
              />
              <label htmlFor="csv-upload" className="cursor-pointer">
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">
                  {uploading ? "Uploading..." : "Click to upload CSV/TXT file"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  CSV: name,number OR number-only list
                </p>
              </label>
            </div>
            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="text-sm font-medium mb-2">Formats supported:</p>
              <code className="text-xs text-muted-foreground">
                John,+91 9988229920
                <br />
                +91 9988776655,+91 9900011122
                <br />
                +91 9000000000
              </code>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsUploadModalOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isPasteModalOpen} onOpenChange={setIsPasteModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Paste Numbers / CSV Text</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="paste-contacts">Paste numbers separated by comma/newline</Label>
            <Textarea
              id="paste-contacts"
              rows={10}
              placeholder={"+91 9988229920, +91 9988776655\nJohn,+91 9000000000"}
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              You can paste plain numbers, comma separated numbers, or CSV rows (name,number).
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPasteModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void handlePasteImport()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Import
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isReplaceModalOpen} onOpenChange={setIsReplaceModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Clear Current List + Paste New Contacts</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="replace-contacts">Paste numbers separated by comma/newline</Label>
            <Textarea
              id="replace-contacts"
              rows={10}
              placeholder={"+91 9988229920, +91 9988776655\nJohn,+91 9000000000"}
              value={replaceText}
              onChange={(event) => setReplaceText(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              This will remove all contacts from the selected list and import this new text.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsReplaceModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => void handleReplaceWithPaste()}
                disabled={cleanupBusyMode === "replace_from_text"}
              >
                {cleanupBusyMode === "replace_from_text" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Replace List
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
