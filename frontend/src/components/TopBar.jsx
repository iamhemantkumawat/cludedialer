import { useEffect, useState } from 'react';
import socket from '../socket';
import { getSipAccounts } from '../api';

export default function TopBar() {
  const [connected, setConnected] = useState(socket.connected);
  const [sipUser,   setSipUser]   = useState('');

  useEffect(() => {
    const onConnect    = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect',    onConnect);
    socket.on('disconnect', onDisconnect);

    getSipAccounts()
      .then(accounts => {
        const active = accounts.find(a => a.is_active) || accounts[0];
        if (active) setSipUser(active.username);
      })
      .catch(() => {});

    return () => {
      socket.off('connect',    onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return (
    <header className="h-14 shrink-0 bg-white border-b border-black/[0.07] flex items-center px-5 gap-4 z-20 shadow-sm">
      <div className="flex items-center select-none">
        <img src="/logo.png" alt="CyberX Calls" className="h-9 w-auto" />
      </div>

      {/* Active SIP pill */}
      {sipUser && (
        <div className="flex items-center gap-2 bg-gray-100 border border-black/[0.07] rounded-full px-3 py-1 text-xs text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span>SIP: <span className="text-gray-900 font-semibold">{sipUser}</span></span>
        </div>
      )}

      <div className="flex-1" />

      {/* Socket status */}
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${connected
          ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]'
          : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]'}`}
        />
        <span className={`text-xs font-medium ${connected ? 'text-green-600' : 'text-red-500'}`}>
          {connected ? 'Connected' : 'Offline'}
        </span>
      </div>

      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-red-50 border border-red-200 flex items-center justify-center">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500">
          <circle cx="12" cy="8" r="4"/>
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
        </svg>
      </div>
    </header>
  );
}
