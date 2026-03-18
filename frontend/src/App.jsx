import { BrowserRouter, Routes, Route } from 'react-router-dom';
import TopBar         from './components/TopBar';
import Sidebar        from './components/Sidebar';
import Dashboard      from './pages/Dashboard';
import Campaigns      from './pages/Campaigns';
import CampaignDetail from './pages/CampaignDetail';
import RunCampaign    from './pages/RunCampaign';
import CampaignHistory from './pages/CampaignHistory';
import AudioFiles     from './pages/AudioFiles';
import SipSettings    from './pages/SipSettings';
import CallLogs       from './pages/CallLogs';
import Contacts       from './pages/Contacts';

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex flex-col h-screen overflow-hidden bg-[#F7F8FC]">
        <TopBar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto bg-[#F7F8FC]">
            <Routes>
              <Route path="/"              element={<Dashboard />} />
              <Route path="/campaigns"     element={<Campaigns />} />
              <Route path="/campaigns/:id" element={<CampaignDetail />} />
              <Route path="/new"           element={<Campaigns initialCreateOpen />} />
              <Route path="/run"           element={<RunCampaign />} />
              <Route path="/campaign-history" element={<CampaignHistory />} />
              <Route path="/audio"         element={<AudioFiles />} />
              <Route path="/sip"           element={<SipSettings />} />
              <Route path="/call-logs"     element={<CallLogs />} />
              <Route path="/contacts"      element={<Contacts />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
