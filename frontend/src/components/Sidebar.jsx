import { NavLink, useLocation } from 'react-router-dom';

const IconGrid = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
);
const IconCampaign = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);
const IconRun = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="9" />
    <polygon points="10 8 17 12 10 16 10 8" />
  </svg>
);
const IconHistory = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <polyline points="3 3 3 9 9 9" />
    <path d="M12 7v5l3 3" />
  </svg>
);
const IconUsers = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const IconList = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
    <line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/>
    <line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
);
const IconSettings = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);
const IconMusic = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M9 18V5l12-2v13"/>
    <circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
  </svg>
);

export default function Sidebar() {
  const location = useLocation();
  const isCampaignRoute = location.pathname.startsWith('/campaigns') || location.pathname === '/new';
  const isRunRoute = location.pathname.startsWith('/run');
  const isHistoryRoute = location.pathname.startsWith('/campaign-history');

  return (
    <aside className="w-56 shrink-0 bg-white border-r border-black/[0.07] flex flex-col h-full overflow-y-auto">
      <nav className="flex-1 p-2.5 space-y-0.5">
        <NavLink to="/" end className={() => location.pathname === '/' ? 'sidebar-item-active' : 'sidebar-item-inactive'}>
          <IconGrid /><span>Dashboard</span>
        </NavLink>

        <NavLink to="/campaigns" className={() => isCampaignRoute ? 'sidebar-item-active' : 'sidebar-item-inactive'}>
          <IconCampaign /><span>Campaigns</span>
        </NavLink>

        <NavLink to="/run" className={() => isRunRoute ? 'sidebar-item-active' : 'sidebar-item-inactive'}>
          <IconRun /><span>Run Campaign</span>
        </NavLink>

        <NavLink to="/campaign-history" className={() => isHistoryRoute ? 'sidebar-item-active' : 'sidebar-item-inactive'}>
          <IconHistory /><span>Campaign History</span>
        </NavLink>

        <NavLink to="/contacts" className={({ isActive }) => isActive ? 'sidebar-item-active' : 'sidebar-item-inactive'}>
          <IconUsers /><span>Contacts</span>
        </NavLink>

        <NavLink to="/call-logs" className={({ isActive }) => isActive ? 'sidebar-item-active' : 'sidebar-item-inactive'}>
          <IconList /><span>Call Logs / CDRs</span>
        </NavLink>

        <NavLink to="/audio" className={({ isActive }) => isActive ? 'sidebar-item-active' : 'sidebar-item-inactive'}>
          <IconMusic /><span>Audio Files</span>
        </NavLink>

        <NavLink to="/sip" className={({ isActive }) => isActive ? 'sidebar-item-active' : 'sidebar-item-inactive'}>
          <IconSettings /><span>SIP Accounts</span>
        </NavLink>
      </nav>

      <div className="p-3 border-t border-black/[0.06]">
        <div className="text-[10px] text-[#94A3B8] text-center">v1.0</div>
      </div>
    </aside>
  );
}
