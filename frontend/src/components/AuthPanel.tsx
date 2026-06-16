'use client';
import { useState, useEffect } from 'react';
import api from '@/lib/api';

export default function AuthPanel() {
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    api.getAuthStatus().then(d => setConfigured(d.configured)).catch(() => setConfigured(false));
  }, []);

  if (configured === null) return (
    <div style={{ padding: '10px 16px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}>
      <div className="shimmer" style={{ height: 14, borderRadius: 4, width: '50%' }} />
    </div>
  );

  if (!configured) return (
    <div style={{
      padding: '12px 18px', borderRadius: 10,
      background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <span style={{ fontSize: 20 }}>⚙️</span>
      <div style={{ fontSize: 13, color: '#fbbf24' }}>
        Google credentials not set — go to <strong>Settings</strong> tab first.
      </div>
    </div>
  );

  return (
    <div style={{
      padding: '12px 18px', borderRadius: 10,
      background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981', animation: 'pulse-glow 2s ease-in-out infinite' }} />
      <div style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }}>
        Google API credentials configured — connect channels via the 📡 <strong>Channels</strong> tab
      </div>
    </div>
  );
}
