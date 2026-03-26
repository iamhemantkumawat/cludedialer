// Mock data for the CyberX AutoDial platform

export const dashboardStats = {
  totalContacts: 12847,
  activeCampaigns: 5,
  callsToday: 1234,
  dtmfResponsesToday: 89,
};

export const recentActivity = [
  {
    id: 1,
    number: "+1 555-0101",
    campaign: "Spring Sale 2024",
    duration: "0:45",
    dtmfPressed: "1",
    status: "answered",
  },
  {
    id: 2,
    number: "+1 555-0102",
    campaign: "Customer Survey",
    duration: "1:23",
    dtmfPressed: "2",
    status: "answered",
  },
  {
    id: 3,
    number: "+1 555-0103",
    campaign: "Spring Sale 2024",
    duration: "0:00",
    dtmfPressed: "-",
    status: "failed",
  },
  {
    id: 4,
    number: "+1 555-0104",
    campaign: "Product Launch",
    duration: "0:32",
    dtmfPressed: "1",
    status: "answered",
  },
  {
    id: 5,
    number: "+1 555-0105",
    campaign: "Customer Survey",
    duration: "0:00",
    dtmfPressed: "-",
    status: "no_answer",
  },
  {
    id: 6,
    number: "+1 555-0106",
    campaign: "Spring Sale 2024",
    duration: "0:58",
    dtmfPressed: "3",
    status: "answered",
  },
];

export const callPerformanceData = [
  { day: "Mon", calls: 245, answered: 180, dtmf: 42 },
  { day: "Tue", calls: 312, answered: 240, dtmf: 58 },
  { day: "Wed", calls: 289, answered: 210, dtmf: 51 },
  { day: "Thu", calls: 378, answered: 290, dtmf: 72 },
  { day: "Fri", calls: 420, answered: 320, dtmf: 89 },
  { day: "Sat", calls: 180, answered: 120, dtmf: 28 },
  { day: "Sun", calls: 145, answered: 95, dtmf: 18 },
];

export const campaigns = [
  {
    id: 1,
    name: "Spring Sale 2024",
    callerId: "+1 555-0123",
    sipAccount: "sip_main",
    status: "active",
    totalCalls: 4521,
    dtmfResponses: 234,
  },
  {
    id: 2,
    name: "Customer Survey",
    callerId: "+1 555-0124",
    sipAccount: "sip_main",
    status: "active",
    totalCalls: 2890,
    dtmfResponses: 156,
  },
  {
    id: 3,
    name: "Product Launch",
    callerId: "+1 555-0125",
    sipAccount: "sip_backup",
    status: "paused",
    totalCalls: 1245,
    dtmfResponses: 89,
  },
  {
    id: 4,
    name: "Appointment Reminder",
    callerId: "+1 555-0123",
    sipAccount: "sip_main",
    status: "active",
    totalCalls: 3120,
    dtmfResponses: 412,
  },
  {
    id: 5,
    name: "Feedback Collection",
    callerId: "+1 555-0126",
    sipAccount: "sip_backup",
    status: "paused",
    totalCalls: 890,
    dtmfResponses: 67,
  },
];

export const contacts = [
  { id: 1, number: "+1 555-0201", name: "John Smith", status: "pending", attempts: 0, lastResult: "-" },
  { id: 2, number: "+1 555-0202", name: "Jane Doe", status: "called", attempts: 2, lastResult: "Answered" },
  { id: 3, number: "+1 555-0203", name: "Bob Johnson", status: "called", attempts: 1, lastResult: "No Answer" },
  { id: 4, number: "+1 555-0204", name: "Alice Brown", status: "pending", attempts: 0, lastResult: "-" },
  { id: 5, number: "+1 555-0205", name: "Charlie Wilson", status: "called", attempts: 3, lastResult: "Answered" },
  { id: 6, number: "+1 555-0206", name: "Diana Lee", status: "failed", attempts: 3, lastResult: "Failed" },
  { id: 7, number: "+1 555-0207", name: "Edward Chen", status: "pending", attempts: 0, lastResult: "-" },
  { id: 8, number: "+1 555-0208", name: "Fiona Garcia", status: "called", attempts: 1, lastResult: "Answered" },
];

export const liveCalls = [
  { id: 1, number: "+1 555-0301", campaign: "Spring Sale 2024", status: "ringing", duration: "0:05", dtmf: "-" },
  { id: 2, number: "+1 555-0302", campaign: "Customer Survey", status: "answered", duration: "0:32", dtmf: "1" },
  { id: 3, number: "+1 555-0303", campaign: "Product Launch", status: "answered", duration: "1:15", dtmf: "2" },
  { id: 4, number: "+1 555-0304", campaign: "Spring Sale 2024", status: "ringing", duration: "0:08", dtmf: "-" },
];

export const cdrRecords = [
  { id: 1, date: "2024-01-15 14:32:10", number: "+1 555-0401", campaign: "Spring Sale", duration: "0:45", dtmf: "1", result: "answered", hasRecording: true },
  { id: 2, date: "2024-01-15 14:30:05", number: "+1 555-0402", campaign: "Customer Survey", duration: "1:23", dtmf: "2", result: "answered", hasRecording: true },
  { id: 3, date: "2024-01-15 14:28:00", number: "+1 555-0403", campaign: "Spring Sale", duration: "0:00", dtmf: "-", result: "no_answer", hasRecording: false },
  { id: 4, date: "2024-01-15 14:25:30", number: "+1 555-0404", campaign: "Product Launch", duration: "0:32", dtmf: "1", result: "answered", hasRecording: true },
  { id: 5, date: "2024-01-15 14:22:15", number: "+1 555-0405", campaign: "Feedback", duration: "0:00", dtmf: "-", result: "failed", hasRecording: false },
  { id: 6, date: "2024-01-15 14:20:00", number: "+1 555-0406", campaign: "Spring Sale", duration: "0:58", dtmf: "3", result: "answered", hasRecording: true },
];

export const callerIds = [
  { id: 1, number: "+1 555-0123", label: "Main Line", verified: true, isActive: true },
  { id: 2, number: "+1 555-0124", label: "Sales", verified: true, isActive: false },
  { id: 3, number: "+1 555-0125", label: "Support", verified: true, isActive: false },
  { id: 4, number: "+1 555-0126", label: "Marketing", verified: false, isActive: false },
];

export const subscriptionPlans = [
  {
    id: 1,
    name: "1 Day",
    price: 14,
    currency: "€",
    features: ["Unlimited Calls", "DTMF Detection", "Call Recording", "Basic Analytics"],
    limits: "24 hours access",
  },
  {
    id: 2,
    name: "1 Week",
    price: 65,
    currency: "€",
    features: ["Unlimited Calls", "DTMF Detection", "Call Recording", "Advanced Analytics", "Priority Support"],
    limits: "7 days access",
    popular: true,
  },
  {
    id: 3,
    name: "1 Month",
    price: 149,
    currency: "€",
    features: ["Unlimited Calls", "DTMF Detection", "Call Recording", "Advanced Analytics", "Priority Support", "API Access"],
    limits: "30 days access",
  },
];
