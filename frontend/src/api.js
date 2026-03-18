import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// ── SIP Accounts ──────────────────────────────────────────────────────────────
export const getSipAccounts   = ()       => api.get('/sip').then(r => r.data);
export const createSipAccount = (data)  => api.post('/sip', data).then(r => r.data);
export const updateSipAccount = (id, d) => api.put(`/sip/${id}`, d).then(r => r.data);
export const deleteSipAccount = (id)    => api.delete(`/sip/${id}`).then(r => r.data);
export const getSipStatus     = (id)    => api.get(`/sip/${id}/status`).then(r => r.data);

// ── Campaigns ─────────────────────────────────────────────────────────────────
export const getCampaigns           = ()    => api.get('/campaigns').then(r => r.data);
export const getCampaignHistory     = ()    => api.get('/campaigns/history').then(r => r.data);
export const getCampaign            = (id)  => api.get(`/campaigns/${id}`).then(r => r.data);
export const createCampaign         = (d)   => api.post('/campaigns', d).then(r => r.data);
export const deleteCampaign         = (id)  => api.delete(`/campaigns/${id}`).then(r => r.data);
export const startCampaign          = (id, contactListId = null) =>
  api.post(`/campaigns/${id}/start`, contactListId ? { contact_list_id: contactListId } : {}).then(r => r.data);
export const pauseCampaign          = (id)  => api.post(`/campaigns/${id}/pause`).then(r => r.data);
export const stopCampaign           = (id)  => api.post(`/campaigns/${id}/stop`).then(r => r.data);
export const getCampaignResults     = (id)  => api.get(`/campaigns/${id}/results`).then(r => r.data);
export const getCampaignDtmfSummary = (id)  => api.get(`/campaigns/${id}/dtmf-summary`).then(r => r.data);
export const getCampaignContacts    = (id)  => api.get(`/campaigns/${id}/contacts`).then(r => r.data);

// ── Status & Test ─────────────────────────────────────────────────────────────
export const getSipLiveStatus = ()  => api.get('/sip-status').then(r => r.data);
export const testCall         = (d) => api.post('/test-call', d).then(r => r.data);

// ── Audio ─────────────────────────────────────────────────────────────────────
export const getAudioFiles   = ()    => api.get('/audio').then(r => r.data);
export const deleteAudioFile = (id)  => api.delete(`/audio/${id}`).then(r => r.data);
export const generateTTS     = (d)   => api.post('/audio/tts', d).then(r => r.data);
export const uploadAudio     = (formData) =>
  api.post('/audio/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);

// ── Call Logs ─────────────────────────────────────────────────────────────────
export const getCallLogs = (params = {}) => {
  const p = new URLSearchParams();
  if (params.q)      p.set('q',      params.q);
  if (params.status) p.set('status', params.status);
  if (params.page)   p.set('page',   params.page);
  if (params.limit)  p.set('limit',  params.limit);
  return api.get(`/call-logs?${p.toString()}`).then(r => r.data);
};

// ── Contact Lists ─────────────────────────────────────────────────────────────
export const getContactLists = (sipAccountId) =>
  api.get(`/contact-lists?sip_account_id=${sipAccountId}`).then(r => r.data);

export const createContactList = (data) =>
  api.post('/contact-lists', data).then(r => r.data);

export const renameContactList = (id, listName) =>
  api.patch(`/contact-lists/${id}`, { list_name: listName }).then(r => r.data);

export const deleteContactList = (id) =>
  api.delete(`/contact-lists/${id}`).then(r => r.data);

// ── Contacts ──────────────────────────────────────────────────────────────────
export const getContacts = (params = {}) => {
  const p = new URLSearchParams();
  if (params.list_id) p.set('list_id', params.list_id);
  if (params.q)       p.set('q',       params.q);
  if (params.status)  p.set('status',  params.status);
  return api.get(`/contacts?${p.toString()}`).then(r => r.data);
};

export const addContact = (data) =>
  api.post('/contacts', data).then(r => r.data);

export const deleteContact = (id) =>
  api.delete(`/contacts/${id}`).then(r => r.data);

export const importContacts = (data) =>
  api.post('/contacts/import', data).then(r => r.data);

export const cleanupContacts = (data) =>
  api.post('/contacts/cleanup', data).then(r => r.data);
