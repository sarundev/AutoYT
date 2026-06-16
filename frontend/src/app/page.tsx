'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import AuthPanel from '@/components/AuthPanel';
import UploadForm from '@/components/UploadForm';
import UploadHistory from '@/components/UploadHistory';
import SettingsPanel from '@/components/SettingsPanel';
import ChannelsPage from '@/components/ChannelsPage';
import { ToastContainer, addToast } from '@/components/Toast';

type Tab = 'channels' | 'upload' | 'history' | 'settings';

export default function Home() {
  const [tab, setTab]           = useState<Tab>('channels');
  const [historyKey, setHistoryKey] = useState(0);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('auth') === 'success') {
      const ch = searchParams.get('channel');
      addToast(ch ? '🎉 Channel connected successfully!' : '🎉 YouTube connected!', 'success');
      window.history.replaceState({}, '', '/');
    }
  }, [searchParams]);

  const NAV: { id: Tab; icon: string; label: string }[] = [
    { id: 'channels', icon: '📡', label: 'Channels' },
    { id: 'upload',   icon: '⬆',  label: 'Upload'   },
    { id: 'history',  icon: '📊',  label: 'History'  },
    { id: 'settings', icon: '⚙️', label: 'Settings' },
  ];

  const TITLES: Record<Tab, { title: string; sub: string }> = {
    channels: { title: 'Channels',       sub: 'Manage your YouTube channels, folders, and auto-post schedules.' },
    upload:   { title: 'Manual Upload',  sub: 'Pick a channel, select a video, and post it right now or schedule it.' },
    history:  { title: 'Upload History', sub: 'Track the status of all queued and published videos.' },
    settings: { title: 'Settings',       sub: 'Enter your Google OAuth credentials — no JSON file required.' },
  };

  return (
    <>
      {/* Ambient background */}
      <div style={{ position: 'fixed', inset: 0, zIndex: -1, background: 'var(--bg-primary)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-20%', left: '30%', width: 600, height: 600, background: 'radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)', borderRadius: '50%', animation: 'float 8s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '-10%', right: '10%', width: 400, height: 400, background: 'radial-gradient(circle, rgba(236,72,153,0.07) 0%, transparent 70%)', borderRadius: '50%', animation: 'float 12s ease-in-out infinite reverse' }} />
      </div>

      {/* Sidebar */}
      <nav className="sidebar">
        {/* Logo */}
        <div style={{ padding: '26px 20px 22px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, boxShadow: '0 4px 16px rgba(99,102,241,0.4)' }}>🎬</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }} className="gradient-text">AutoYT</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Multi-Channel</div>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <div style={{ padding: '14px 12px', flex: 1 }}>
          {NAV.map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 14px', borderRadius: 10, border: 'none',
                background: tab === item.id ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: tab === item.id ? '#818cf8' : 'var(--text-secondary)',
                fontSize: 14, fontWeight: tab === item.id ? 600 : 400,
                cursor: 'pointer', fontFamily: 'Inter,sans-serif',
                transition: 'all 0.15s', textAlign: 'left', marginBottom: 4,
                borderLeft: tab === item.id ? '2px solid #6366f1' : '2px solid transparent',
              }}
            >
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', padding: '5px 10px', background: 'var(--bg-card)', borderRadius: 6, border: '1px solid var(--border)' }}>
            API: localhost:8000
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="main-content">
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          {/* Page header */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>
              <span className="gradient-text">{TITLES[tab].title.split(' ')[0]}</span>
              {TITLES[tab].title.includes(' ') ? ' ' + TITLES[tab].title.split(' ').slice(1).join(' ') : ''}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{TITLES[tab].sub}</p>
          </div>

          {/* Auth bar (only on upload/history) */}
          {(tab === 'upload' || tab === 'history') && (
            <div style={{ marginBottom: 20 }}><AuthPanel /></div>
          )}

          {/* Tab content */}
          {tab === 'channels' && <ChannelsPage />}

          {tab === 'upload' && (
            <div className="card gradient-border" style={{ padding: 28 }}>
              <UploadForm onSuccess={() => { setHistoryKey(k => k + 1); }} />
            </div>
          )}

          {tab === 'history' && <UploadHistory refreshKey={historyKey} />}

          {tab === 'settings' && <SettingsPanel />}
        </div>
      </main>

      <ToastContainer />
    </>
  );
}
