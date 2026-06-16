'use client';
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { addToast } from './Toast';

interface Settings {
  client_id: string;
  client_secret_masked: string;
  configured: boolean;
}

export default function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = async () => {
    try {
      const data = await api.getSettings();
      setSettings(data);
      setClientId(data.client_id || '');
      if (!data.configured) setEditing(true);
    } catch {
      addToast('Could not load settings', 'error');
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      addToast('Both fields are required', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.saveSettings(clientId.trim(), clientSecret.trim());
      addToast('✓ Credentials saved! You can now connect YouTube.', 'success');
      setClientSecret('');
      setEditing(false);
      load();
    } catch (e: any) {
      addToast(e.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Status card */}
      <div style={{
        padding: '16px 20px',
        borderRadius: 12,
        border: `1px solid ${settings?.configured ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}`,
        background: settings?.configured ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}>
        <span style={{ fontSize: 28 }}>{settings?.configured ? '✅' : '⚙️'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            {settings?.configured ? 'Google API credentials saved' : 'No credentials yet'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
            {settings?.configured
              ? `Client ID: ${settings.client_id.slice(0, 24)}…`
              : 'Enter your Client ID and Secret from Google Cloud Console'}
          </div>
        </div>
        {settings?.configured && !editing && (
          <button
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '6px 14px' }}
            onClick={() => setEditing(true)}
          >
            ✏️ Edit
          </button>
        )}
      </div>

      {/* Credential form */}
      {(editing || !settings?.configured) && (
        <div className="card gradient-border" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Enter Google OAuth Credentials</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Get these from{' '}
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer"
                style={{ color: '#818cf8', textDecoration: 'none' }}>
                Google Cloud Console → APIs &amp; Services → Credentials
              </a>
            </p>
          </div>

          {/* Client ID */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Client ID
            </label>
            <input
              className="input-base"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              placeholder="123456789-abcdefg.apps.googleusercontent.com"
              spellCheck={false}
            />
          </div>

          {/* Client Secret */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Client Secret
            </label>
            <input
              className="input-base"
              type="password"
              value={clientSecret}
              onChange={e => setClientSecret(e.target.value)}
              placeholder={settings?.configured ? `Current: ${settings.client_secret_masked}` : 'GOCSPX-…'}
              spellCheck={false}
            />
            {settings?.configured && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Leave blank to keep the existing secret
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            {settings?.configured && (
              <button className="btn btn-secondary" onClick={() => { setEditing(false); setClientSecret(''); }}>
                Cancel
              </button>
            )}
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || !clientId.trim() || (!clientSecret.trim() && !settings?.configured)}
            >
              {saving ? '⟳ Saving...' : '💾 Save Credentials'}
            </button>
          </div>
        </div>
      )}

      {/* How to get credentials */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: 'var(--text-primary)' }}>
          📋 How to get your credentials
        </h3>
        <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            <>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8' }}>console.cloud.google.com</a> and create or select a project</>,
            <>In the sidebar, go to <strong>APIs &amp; Services → Library</strong> and enable <strong>YouTube Data API v3</strong></>,
            <>Go to <strong>APIs &amp; Services → Credentials → Create Credentials → OAuth 2.0 Client ID</strong></>,
            <>Choose <strong>Web Application</strong>, then add this Authorized Redirect URI:<br />
              <code style={{ fontSize: 12, color: '#a78bfa', background: 'var(--bg-secondary)', padding: '3px 8px', borderRadius: 4, display: 'inline-block', marginTop: 4 }}>
                http://localhost:8000/auth/callback
              </code>
            </>,
            <>Copy the <strong>Client ID</strong> and <strong>Client Secret</strong> shown and paste them above</>,
          ].map((step, i) => (
            <li key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
