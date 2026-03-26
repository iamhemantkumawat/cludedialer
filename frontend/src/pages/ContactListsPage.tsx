import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { jsonRequest, requestJson } from "../app/api";
import { useDialer } from "../app/context";
import type { ContactList, ContactListFormState, ContactRecord, PaginatedContacts } from "../app/types";
import { formatTimestamp } from "../app/utils";
import { Modal } from "../components/Modal";

const DEFAULT_FORM: ContactListFormState = {
  list_name: "",
  description: "",
};

const DEFAULT_CONTACT_FORM = {
  phone_number: "",
  contact_name: "",
};

type StatusFilter = "all" | "pending" | "called" | "calling" | "busy" | "no-answer" | "failed" | "cancelled" | "rejected";
type QuickClearFilter = "all" | "answered" | "dtmf";
type NoticeTone = "neutral" | "success" | "error";

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All Status" },
  { value: "pending", label: "Pending" },
  { value: "called", label: "Called" },
  { value: "calling", label: "Calling" },
  { value: "busy", label: "Busy" },
  { value: "no-answer", label: "No Answer" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "rejected", label: "Rejected" },
];

function normalizeContactStatus(contact: ContactRecord) {
  const status = String(contact.status || "").trim().toLowerCase();
  if (!status) return "pending";
  if (status === "answered" || status === "completed") return "called";
  return status;
}

function titleCaseStatus(status: string) {
  return status
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function contactBadge(contact: ContactRecord) {
  const status = normalizeContactStatus(contact);
  let tone = "pending";

  if (status === "called") tone = "called";
  else if (status === "calling") tone = "progress";
  else if (status === "busy" || status === "no-answer" || status === "cancelled") tone = "warning";
  else if (status === "failed" || status === "rejected") tone = "danger";

  return {
    className: `contacts-status-chip contacts-status-chip--${tone}`,
    label: titleCaseStatus(status),
  };
}

function contactLastResult(contact: ContactRecord) {
  const value = String(contact.last_result || "").trim();
  if (value && value !== "-") return value;

  const status = normalizeContactStatus(contact);
  if (status === "called") return "Answered";
  if (status === "pending") return "Waiting to dial";
  return titleCaseStatus(status);
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function ContactListsPage() {
  const { contactLists, refreshContactLists, notify } = useDialer();
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [contactsPage, setContactsPage] = useState(1);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadTone, setUploadTone] = useState<NoticeTone>("neutral");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingList, setEditingList] = useState<ContactList | null>(null);
  const [form, setForm] = useState<ContactListFormState>(DEFAULT_FORM);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [contactForm, setContactForm] = useState(DEFAULT_CONTACT_FORM);
  const [pasteText, setPasteText] = useState("");

  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const selectedList = contactLists.find((list) => list.id === selectedListId) || null;
  const selectedListTotal = selectedList?.contact_count || 0;
  const totalPages = Math.max(1, Math.ceil(contactsTotal / 100));
  const pendingCount = contacts.filter((contact) => normalizeContactStatus(contact) === "pending").length;
  const calledCount = contacts.filter((contact) => normalizeContactStatus(contact) === "called").length;
  const visibleContacts = contacts;

  useEffect(() => {
    void refreshContactLists().catch((error: unknown) => {
      notify(error instanceof Error ? error.message : "Failed to load contact lists", "error");
    });
  }, []);

  useEffect(() => {
    if (!contactLists.length) {
      setSelectedListId(null);
      setContacts([]);
      setContactsTotal(0);
      return;
    }

    if (selectedListId && contactLists.some((list) => list.id === selectedListId)) {
      return;
    }

    setSelectedListId(contactLists[0].id);
    setContactsPage(1);
  }, [contactLists, selectedListId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    setContactsPage(1);
  }, [debouncedQuery, statusFilter]);

  useEffect(() => {
    if (!selectedListId) return;
    void loadContacts(selectedListId, contactsPage, debouncedQuery, statusFilter);
  }, [selectedListId, contactsPage, debouncedQuery, statusFilter]);

  useEffect(() => {
    setUploadStatus("");
    setUploadTone("neutral");
  }, [selectedListId]);

  async function loadContacts(listId: number, pageNumber = 1, query = "", status: StatusFilter = "all") {
    setLoadingContacts(true);

    try {
      const params = new URLSearchParams({
        page: String(pageNumber),
        limit: "100",
      });

      if (query.trim()) params.set("q", query.trim());
      if (status !== "all") params.set("status", status);

      const data = await requestJson<PaginatedContacts>(`/api/contact-lists/${listId}/contacts?${params.toString()}`);
      setContacts(data.contacts || []);
      setContactsTotal(data.total || 0);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to load contacts", "error");
      setContacts([]);
      setContactsTotal(0);
    } finally {
      setLoadingContacts(false);
    }
  }

  function openModal(list?: ContactList) {
    setEditingList(list || null);
    setForm(
      list
        ? {
            list_name: list.list_name,
            description: list.description || "",
          }
        : DEFAULT_FORM,
    );
    setModalOpen(true);
  }

  async function handleSaveList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = {
      list_name: form.list_name.trim(),
      description: form.description.trim(),
    };

    if (!payload.list_name) {
      notify("List name is required", "error");
      return;
    }

    try {
      const saved = await jsonRequest<ContactList>(
        editingList ? `/api/contact-lists/${editingList.id}` : "/api/contact-lists",
        editingList ? "PUT" : "POST",
        payload,
      );
      await refreshContactLists();
      setSelectedListId(saved.id);
      setContactsPage(1);
      notify(editingList ? "List updated" : "List created", "success");
      setModalOpen(false);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to save list", "error");
    }
  }

  async function handleDeleteList(list: ContactList) {
    if (!window.confirm(`Delete list "${list.list_name}" and all its contacts?`)) return;

    try {
      await jsonRequest(`/api/contact-lists/${list.id}`, "DELETE");
      await refreshContactLists();
      if (selectedListId === list.id) {
        setSelectedListId(null);
        setContacts([]);
        setContactsTotal(0);
        setContactsPage(1);
      }
      notify("List deleted", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to delete list", "error");
    }
  }

  async function uploadContactsFile(file: File, source = "Imported") {
    if (!selectedListId) {
      notify("Select a list first", "error");
      return false;
    }

    setUploading(true);
    setUploadTone("neutral");
    setUploadStatus(`Uploading ${file.name}...`);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const data = await requestJson<{ imported: number; total: number }>(
        `/api/contact-lists/${selectedListId}/contacts/upload`,
        {
          method: "POST",
          body: formData,
        },
      );

      setUploadTone("success");
      setUploadStatus(`${source}: ${data.imported} numbers added. Active list total: ${data.total}.`);
      await refreshContactLists();
      setContactsPage(1);
      await loadContacts(selectedListId, 1, debouncedQuery, statusFilter);
      notify(`${data.imported} contacts imported`, "success");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setUploadTone("error");
      setUploadStatus(message);
      notify(message, "error");
      return false;
    } finally {
      setUploading(false);
    }
  }

  async function handleUpload(file: File) {
    void uploadContactsFile(file);
  }

  async function handleAddContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedListId) {
      notify("Select a list first", "error");
      return;
    }

    if (!contactForm.phone_number.trim()) {
      notify("Phone number is required", "error");
      return;
    }

    try {
      await jsonRequest(`/api/contact-lists/${selectedListId}/contacts`, "POST", {
        phone_number: contactForm.phone_number.trim(),
        contact_name: contactForm.contact_name.trim(),
      });
      setContactForm(DEFAULT_CONTACT_FORM);
      setAddModalOpen(false);
      await refreshContactLists();
      await loadContacts(selectedListId, contactsPage, debouncedQuery, statusFilter);
      notify("Contact added", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to add contact", "error");
    }
  }

  async function handleDeleteContact(contactId: string) {
    if (!selectedListId) return;

    try {
      await jsonRequest(`/api/contact-lists/${selectedListId}/contacts/${contactId}`, "DELETE");
      await refreshContactLists();
      await loadContacts(selectedListId, contactsPage, debouncedQuery, statusFilter);
      notify("Contact removed", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to delete contact", "error");
    }
  }

  async function handleClearContacts(filter: QuickClearFilter = "all", openPasteAfter = false) {
    if (!selectedListId) return false;

    const confirmMessage =
      filter === "answered"
        ? "Delete answered contacts from this list?"
        : filter === "dtmf"
          ? "Delete contacts with DTMF results from this list?"
          : openPasteAfter
            ? "Delete all contacts in this list, then paste new numbers?"
            : "Delete all contacts in this list?";

    if (!window.confirm(confirmMessage)) return false;

    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("filter", filter);
      const suffix = params.size ? `?${params.toString()}` : "";
      const response = await jsonRequest<{ success: boolean; deleted: number }>(`/api/contact-lists/${selectedListId}/contacts${suffix}`, "DELETE");
      await refreshContactLists();
      setContactsPage(1);
      await loadContacts(selectedListId, 1, debouncedQuery, statusFilter);

      if ((response.deleted || 0) > 0) {
        const label =
          filter === "answered" ? "Answered contacts cleared"
          : filter === "dtmf" ? "DTMF contacts cleared"
          : "Contacts cleared";
        notify(`${label} (${response.deleted})`, "success");
      } else {
        notify("No matching contacts found to clear", "info");
      }

      if (openPasteAfter) {
        setPasteModalOpen(true);
      }

      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to clear contacts", "error");
      return false;
    }
  }

  async function handlePasteImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalized = pasteText
      .split(/[\n,]+/)
      .map((value) => value.trim())
      .filter(Boolean)
      .join("\n");

    if (!normalized) {
      notify("Paste at least one number", "error");
      return;
    }

    const file = new File([normalized], "pasted-contacts.txt", {
      type: "text/plain",
    });
    const success = await uploadContactsFile(file, "Pasted import");
    if (success) {
      setPasteText("");
      setPasteModalOpen(false);
    }
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void handleUpload(file);
    }
    event.target.value = "";
  }

  return (
    <section className="section active">
      <input
        ref={uploadInputRef}
        className="contacts-hidden-input"
        type="file"
        accept=".csv,.txt"
        onChange={handleFileInput}
      />

      <div className="page-header contacts-page-header">
        <div>
          <div className="page-title">Contacts</div>
          <div className="contacts-page-subtitle">Create and manage multiple contact lists.</div>
        </div>

        <div className="header-actions header-actions--wrap">
          <button className="btn btn-ghost contacts-header-btn" type="button" onClick={() => setPasteModalOpen(true)} disabled={!selectedList || uploading}>
            Paste Numbers
          </button>
          <button
            className="btn btn-ghost contacts-header-btn"
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            disabled={!selectedList || uploading}
          >
            Upload CSV/TXT
          </button>
          <button className="btn btn-primary contacts-header-btn" type="button" onClick={() => setAddModalOpen(true)} disabled={!selectedList}>
            Add Contact
          </button>
        </div>
      </div>

      <div className="page-body">
        <div className="contacts-dashboard-grid mb-20">
          <article className="card contacts-dashboard-card contacts-dashboard-card--list">
            <div className="contacts-dashboard-card__top">
              <div className="contacts-dashboard-icon contacts-dashboard-icon--list">L</div>
              <span className="contacts-dashboard-pill">{selectedListTotal}</span>
            </div>

            <div className="contacts-dashboard-card__label">Contact List</div>
            <div className="contacts-dashboard-card__headline-row">
              <div className="contacts-dashboard-card__value">{selectedList ? selectedList.list_name : "No list selected"}</div>
              <button className="contacts-inline-link" type="button" onClick={() => selectedList && openModal(selectedList)} disabled={!selectedList}>
                Edit
              </button>
            </div>

            <label className="contacts-field-label" htmlFor="contacts-list-picker">
              Select List
            </label>
            <select
              id="contacts-list-picker"
              className="contacts-list-picker"
              value={selectedListId || ""}
              onChange={(event) => {
                setSelectedListId(Number(event.target.value) || null);
                setContactsPage(1);
              }}
              disabled={!contactLists.length}
            >
              {contactLists.length ? (
                contactLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.list_name} ({list.contact_count})
                  </option>
                ))
              ) : (
                <option value="">No contact lists yet</option>
              )}
            </select>

            <div className="contacts-dashboard-actions">
              <button className="btn btn-ghost contacts-card-button" type="button" onClick={() => openModal()}>
                New
              </button>
              <button
                className="btn btn-ghost contacts-card-button contacts-card-button--danger"
                type="button"
                onClick={() => selectedList && void handleDeleteList(selectedList)}
                disabled={!selectedList}
              >
                Delete
              </button>
            </div>
          </article>

          <article className="card contacts-dashboard-card contacts-dashboard-card--metric contacts-dashboard-card--blue">
            <div className="contacts-dashboard-stat">
              <div className="contacts-dashboard-icon contacts-dashboard-icon--blue">T</div>
              <div>
                <div className="contacts-dashboard-card__label">Total Contacts</div>
                <div className="contacts-dashboard-card__metric">{selectedListTotal}</div>
              </div>
            </div>
          </article>

          <article className="card contacts-dashboard-card contacts-dashboard-card--metric contacts-dashboard-card--amber">
            <div className="contacts-dashboard-stat">
              <div className="contacts-dashboard-icon contacts-dashboard-icon--amber">P</div>
              <div>
                <div className="contacts-dashboard-card__label">Pending</div>
                <div className="contacts-dashboard-card__metric">{pendingCount}</div>
              </div>
            </div>
          </article>

          <article className="card contacts-dashboard-card contacts-dashboard-card--metric contacts-dashboard-card--green">
            <div className="contacts-dashboard-stat">
              <div className="contacts-dashboard-icon contacts-dashboard-icon--green">C</div>
              <div>
                <div className="contacts-dashboard-card__label">Called</div>
                <div className="contacts-dashboard-card__metric">{calledCount}</div>
              </div>
            </div>
          </article>
        </div>

        <div className="card contacts-filter-shell mb-20">
          <div className="contacts-filter-shell__row">
            <div className="contacts-searchbar">
              <input
                id="contacts-search"
                type="search"
                placeholder="Search by name or number..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                disabled={!selectedList}
              />
            </div>

            <div className="contacts-filter-dropdown">
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} disabled={!selectedList}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {uploadStatus ? (
            <div className={`contacts-inline-note contacts-inline-note--${uploadTone}`}>{uploadStatus}</div>
          ) : null}
        </div>

        {selectedList ? (
          <div className="table-wrap contacts-table-card">
            <div className="contacts-table-card__header">
              <div>
                <div className="card-title">
                  Contact List <span className="contacts-table-card__count">({pluralize(selectedListTotal, "contact")})</span>
                </div>
                <div className="c-dim">
                  {debouncedQuery || statusFilter !== "all"
                    ? `${pluralize(contactsTotal, "match")} for the current search and filter.`
                    : `${pluralize(selectedListTotal, "contact")} available in this list.`}
                </div>
              </div>

              <div className="contacts-table-pills">
                <button className="contacts-pill contacts-pill--danger" type="button" onClick={() => void handleClearContacts("all", true)} disabled={!selectedList}>
                  Clear All + Paste New
                </button>
                <button className="contacts-pill contacts-pill--green" type="button" onClick={() => void handleClearContacts("answered")} disabled={!selectedList}>
                  Clear Answered Only
                </button>
                <button className="contacts-pill contacts-pill--purple" type="button" onClick={() => void handleClearContacts("dtmf")} disabled={!selectedList}>
                  Clear DTMF Only
                </button>
                <button className="contacts-pill contacts-pill--danger" type="button" onClick={() => void handleClearContacts("all")} disabled={!selectedList}>
                  Clear All Contacts
                </button>
              </div>
            </div>

            <div className="contacts-table-scroll">
              <table className="contacts-table contacts-table--clean">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Attempts</th>
                    <th>Last Result</th>
                    <th className="contacts-row-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingContacts ? (
                    <tr>
                      <td colSpan={6} className="table-empty">
                        Loading contacts...
                      </td>
                    </tr>
                  ) : visibleContacts.length ? (
                    visibleContacts.map((contact) => {
                      const badge = contactBadge(contact);
                      return (
                        <tr key={contact.id}>
                          <td className="mono">{contact.phone_number}</td>
                          <td>{contact.contact_name || "Unnamed"}</td>
                          <td>
                            <span className={badge.className}>{badge.label}</span>
                          </td>
                          <td>{contact.attempts ?? 0}</td>
                          <td className="c-dim">{contactLastResult(contact)}</td>
                          <td className="contacts-row-actions">
                            <button className="contacts-delete-btn" type="button" onClick={() => void handleDeleteContact(contact.id)}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="table-empty">
                        {debouncedQuery || statusFilter !== "all"
                          ? "No contacts match the current search or status filter."
                          : "No contacts yet. Upload a file, paste numbers, or add them manually."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex-center pager-row contacts-pager-row">
              <span className="c-dim">
                Page {contactsPage} / {totalPages}
              </span>
              <button className="btn btn-ghost btn-sm" type="button" disabled={contactsPage <= 1} onClick={() => setContactsPage((current) => current - 1)}>
                Prev
              </button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => selectedList && void loadContacts(selectedList.id, contactsPage, debouncedQuery, statusFilter)} disabled={loadingContacts}>
                Refresh
              </button>
              <button className="btn btn-ghost btn-sm" type="button" disabled={contactsPage >= totalPages} onClick={() => setContactsPage((current) => current + 1)}>
                Next
              </button>
            </div>
          </div>
        ) : (
          <div className="empty empty-panel contacts-empty-state">
            <div className="empty-title">No contact list selected</div>
            <div>Create your first list, then start importing numbers from CSV, TXT, or manual paste.</div>
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        title={editingList ? "Rename List" : "New Contact List"}
        maxWidth={420}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button className="btn btn-ghost" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="contact-list-form">
              {editingList ? "Save Changes" : "Create List"}
            </button>
          </>
        }
      >
        <form id="contact-list-form" onSubmit={handleSaveList}>
          <div className="form-group">
            <label htmlFor="list-name">List Name *</label>
            <input
              id="list-name"
              value={form.list_name}
              onChange={(event) => setForm((current) => ({ ...current, list_name: event.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="list-description">Description</label>
            <input
              id="list-description"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Optional note for the team"
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={addModalOpen}
        title="Add Contact"
        maxWidth={420}
        onClose={() => setAddModalOpen(false)}
        footer={
          <>
            <button className="btn btn-ghost" type="button" onClick={() => setAddModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="add-contact-form">
              Save Contact
            </button>
          </>
        }
      >
        <form id="add-contact-form" onSubmit={handleAddContact}>
          <div className="form-group">
            <label htmlFor="contact-name">Contact Name</label>
            <input
              id="contact-name"
              value={contactForm.contact_name}
              onChange={(event) => setContactForm((current) => ({ ...current, contact_name: event.target.value }))}
              placeholder="Optional display name"
            />
          </div>
          <div className="form-group">
            <label htmlFor="contact-number">Phone Number *</label>
            <input
              id="contact-number"
              value={contactForm.phone_number}
              onChange={(event) => setContactForm((current) => ({ ...current, phone_number: event.target.value }))}
              placeholder="+91 9988229920"
              required
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={pasteModalOpen}
        title="Paste Numbers"
        maxWidth={520}
        onClose={() => setPasteModalOpen(false)}
        footer={
          <>
            <button className="btn btn-ghost" type="button" onClick={() => setPasteModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="paste-contacts-form" disabled={uploading}>
              Import Numbers
            </button>
          </>
        }
      >
        <form id="paste-contacts-form" onSubmit={handlePasteImport}>
          <div className="form-group">
            <label htmlFor="paste-contacts">Paste numbers separated by comma or new line</label>
            <textarea
              id="paste-contacts"
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              placeholder={"+91 9988229920\n+91 8877665544\n+1 415 555 1234"}
            />
          </div>
          <div className="form-hint">Only valid phone numbers will be imported into the selected contact list.</div>
        </form>
      </Modal>
    </section>
  );
}
