'use client';
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { addToast } from './Toast';
import { format } from 'date-fns';

interface Upload {
  id: string;
  title: string;
  description: string;
  privacy: string;
  file_name: string;
  status: 'pending' | 'scheduled' | 'uploading' | 'done' | 'error';
  youtube_id: string;
  youtube_url: string;
  error: string;
  created_at: string;
  scheduled_time?: string;
}

const STATUS_ICONS: Record<string, string> = {
  pending: '⏳',
  scheduled: '📅',
  uploading: '⬆',
  done: '✅',
  error: '❌',
};

const PRIVACY_ICONS: Record<string, string> = {
  public: '🌍',
  unlisted: '🔗',
  private: '🔒',
};

export default function UploadHistory({ refreshKey }: { refreshKey: number }) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadUploads = async () => {
    try {
      const data = await api.listUploads();
      setUploads(data.reverse()); // newest first
    } catch (e) {
      addToast('Failed to load uploads', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUploads(); }, [refreshKey]);

  // Auto-refresh while any upload is in progress
  useEffect(() => {
    const hasActive = uploads.some(u => u.status === 'uploading' || u.status === 'pending');
    if (!hasActive) return;
    const timer = setInterval(loadUploads, 3000);
    return () => clearInterval(timer);
  }, [uploads]);

  const handleDelete = async (id: string) => {
    try {
      await api.deleteUpload(id);
      setUploads(p => p.filter(u => u.id !== id));
      addToast('Upload removed', 'info');
    } catch {
      addToast('Failed to remove upload', 'error');
    }
  };

  const statuses = ['all', 'pending', 'scheduled', 'uploading', 'done', 'error'];
  const filtered = filter === 'all' ? uploads : uploads.filter(u => u.status === filter);

  // Stats
  const stats = {
    total: uploads.length,
    done: uploads.filter(u => u.status === 'done').length,
    pending: uploads.filter(u => u.status === 'pending' || u.status === 'uploading').length,
    scheduled: uploads.filter(u => u.status === 'scheduled').length,
    error: uploads.filter(u => u.status === 'error').length,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Total', value: stats.total, color: '#6366f1', icon: '📊' },
          { label: 'Uploaded', value: stats.done, color: '#10b981', icon: '✅' },
          { label: 'Queued', value: stats.pending, color: '#f59e0b', icon: '⏳' },
          { label: 'Failed', value: stats.error, color: '#ef4444', icon: '❌' },
        ].map(s => (
          <div key={s.label} className="card" style={{ textAlign: 'center', padding: '14px' }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              padding: '6px 14px',
              borderRadius: 999,
              border: `1px solid ${filter === s ? 'var(--accent)' : 'var(--border)'}`,
              background: filter === s ? 'rgba(99,102,241,0.15)' : 'var(--bg-secondary)',
              color: filter === s ? '#818cf8' : 'var(--text-secondary)',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
              transition: 'all 0.15s',
              textTransform: 'capitalize',
            }}
          >
            {STATUS_ICONS[s] || '📋'} {s}
          </button>
        ))}
        <button
          onClick={loadUploads}
          style={{
            padding: '6px 14px',
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'Inter, sans-serif',
            marginLeft: 'auto',
          }}
        >
          🔄 Refresh
        </button>
      </div>

      {/* Upload list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="shimmer" style={{ height: 72, borderRadius: 10 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          padding: 48,
          textAlign: 'center',
          background: 'var(--bg-secondary)',
          borderRadius: 12,
          border: '1px dashed var(--border)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎬</div>
          <div style={{ fontSize: 15, color: 'var(--text-secondary)', fontWeight: 600 }}>
            {filter === 'all' ? 'No uploads yet' : `No ${filter} uploads`}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
            Use the Upload tab to queue your first video
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(u => (
            <div key={u.id} className="card animate-slide-up" style={{ padding: '14px 16px' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}
                onClick={() => setExpanded(expanded === u.id ? null : u.id)}
              >
                {/* Status icon */}
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: u.status === 'uploading' ? 'rgba(59,130,246,0.15)' : 'var(--bg-secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20,
                  animation: u.status === 'uploading' ? 'pulse-glow 2s ease-in-out infinite' : 'none',
                }}>
                  {u.status === 'uploading' ? (
                    <span className="animate-spin-slow" style={{ display: 'inline-block' }}>⟳</span>
                  ) : STATUS_ICONS[u.status]}
                </div>

                {/* Info */}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{
                    fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {u.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {PRIVACY_ICONS[u.privacy]} {u.file_name} · {format(new Date(u.created_at), 'MMM d, h:mm a')}
                  </div>
                </div>

                {/* Status badge */}
                <span className={`badge badge-${u.status}`}>{u.status}</span>

                {/* Expand chevron */}
                <span style={{ color: 'var(--text-muted)', fontSize: 12, transition: 'transform 0.2s', transform: expanded === u.id ? 'rotate(180deg)' : 'none' }}>
                  ▾
                </span>
              </div>

              {/* Expanded details */}
              {expanded === u.id && (
                <div style={{
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  animation: 'slide-up 0.2s ease',
                }}>
                  {u.youtube_url && (
                    <a
                      href={u.youtube_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-success"
                      style={{ alignSelf: 'flex-start', textDecoration: 'none', fontSize: 13 }}
                    >
                      ▶ Watch on YouTube
                    </a>
                  )}
                  {u.scheduled_time && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      📅 Scheduled for: <strong style={{ color: '#818cf8' }}>
                        {format(new Date(u.scheduled_time), 'PPpp')}
                      </strong>
                    </div>
                  )}
                  {u.error && (
                    <div style={{
                      padding: '8px 12px',
                      background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.25)',
                      borderRadius: 8,
                      fontSize: 12,
                      color: '#f87171',
                    }}>
                      ⚠ {u.error}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button
                      className="btn btn-danger"
                      style={{ fontSize: 12, padding: '6px 14px' }}
                      onClick={() => handleDelete(u.id)}
                    >
                      🗑 Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
