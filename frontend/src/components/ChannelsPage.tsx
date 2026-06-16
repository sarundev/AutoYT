'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { addToast } from './Toast';
import { format, formatDistanceToNow } from 'date-fns';

interface Channel {
  id: string;
  name: string;
  connected: boolean;
  watch_folder: string;
  delay_days: number;
  post_hour: number;
  post_minute: number;
  active: boolean;
  default_privacy: string;
  default_tags: string;
  default_description: string;
  last_posted_at: string | null;
  last_posted_file: string | null;
  next_post_at: string | null;
  pending_count: number;
  posted_count: number;
  created_at: string;
}

const COLORS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6'];
const getColor = (name: string) => COLORS[name.charCodeAt(0) % COLORS.length];

function fmt(n: number) { return n.toString().padStart(2, '0'); }

// ── Add/Edit Channel Modal ────────────────────────────────────────────────────
function ChannelModal({
  channel, onClose, onSaved,
}: { channel?: Channel; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!channel;
  const [name, setName]         = useState(channel?.name || '');
  const [folder, setFolder]     = useState(channel?.watch_folder || '');
  const [days, setDays]         = useState(channel?.delay_days ?? 1);
  const [hour, setHour]         = useState(channel?.post_hour ?? 10);
  const [minute, setMinute]     = useState(channel?.post_minute ?? 0);
  const [privacy, setPrivacy]   = useState(channel?.default_privacy || 'public');
  const [tags, setTags]         = useState(channel?.default_tags || '');
  const [desc, setDesc]         = useState(channel?.default_description || '');
  const [saving, setSaving]     = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { addToast('Channel name is required', 'error'); return; }
    setSaving(true);
    try {
      if (isEdit) {
        await api.updateChannel(channel.id, {
          name: name.trim(), watch_folder: folder.trim(),
          delay_days: days, post_hour: hour, post_minute: minute,
          default_privacy: privacy, default_tags: tags.trim(),
          default_description: desc.trim(),
        });
        addToast('Channel updated ✓', 'success');
      } else {
        await api.createChannel(name.trim());
        addToast('Channel created! Configure the folder and schedule.', 'success');
      }
      onSaved();
      onClose();
    } catch (e: any) {
      addToast(e.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16,
        border: '1px solid var(--border)', width: '100%', maxWidth: 520,
        overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        animation: 'slide-up 0.25s ease',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{isEdit ? `✏️ Edit ${channel.name}` : '➕ New Channel'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {isEdit ? 'Update settings for this channel' : 'Create a new YouTube auto-posting channel'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Name */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
              Channel Name *
            </label>
            <input className="input-base" value={name} onChange={e => setName(e.target.value)} placeholder="My Gaming Channel" />
          </div>

          {isEdit && (
            <>
              {/* Watch Folder */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
                  📁 Watch Folder
                </label>
                <input
                  className="input-base" value={folder}
                  onChange={e => setFolder(e.target.value)}
                  placeholder="/Users/yourname/Videos/channel1"
                  style={{ fontFamily: 'monospace', fontSize: 13 }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Videos in this folder will be auto-posted in order (A→Z)
                </div>
              </div>

              {/* Schedule */}
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>⏱ Auto-Post Schedule</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>POST EVERY</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        className="input-base" type="number" min={1} max={30}
                        value={days} onChange={e => setDays(Number(e.target.value))}
                        style={{ width: 70, textAlign: 'center' }}
                      />
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>day{days !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>AT TIME</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        className="input-base" type="number" min={0} max={23}
                        value={hour} onChange={e => setHour(Number(e.target.value))}
                        style={{ width: 60, textAlign: 'center' }}
                      />
                      <span style={{ color: 'var(--text-muted)' }}>:</span>
                      <input
                        className="input-base" type="number" min={0} max={59}
                        value={minute} onChange={e => setMinute(Number(e.target.value))}
                        style={{ width: 60, textAlign: 'center' }}
                      />
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>UTC</span>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: '#818cf8', background: 'rgba(99,102,241,0.1)', padding: '6px 10px', borderRadius: 6 }}>
                  📅 Posts every {days} day{days !== 1 ? 's' : ''} at {fmt(hour)}:{fmt(minute)} UTC
                </div>
              </div>

              {/* Defaults */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
                  Default Privacy
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['public','unlisted','private'].map(p => (
                    <button key={p} onClick={() => setPrivacy(p)} style={{
                      flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer',
                      border: `1px solid ${privacy === p ? 'var(--accent)' : 'var(--border)'}`,
                      background: privacy === p ? 'rgba(99,102,241,0.15)' : 'var(--bg-secondary)',
                      color: privacy === p ? '#818cf8' : 'var(--text-secondary)',
                      fontFamily: 'Inter,sans-serif', fontSize: 12, textTransform: 'capitalize',
                    }}>{p}</button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
                  Default Tags
                </label>
                <input className="input-base" value={tags} onChange={e => setTags(e.target.value)} placeholder="shorts, viral, gaming (comma-separated)" />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
                  Default Description
                </label>
                <textarea className="input-base" value={desc} onChange={e => setDesc(e.target.value)} rows={2} style={{ resize: 'vertical' }} placeholder="Subscribe for daily content!" />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? '⟳ Saving…' : isEdit ? '💾 Save Changes' : '➕ Create Channel'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Channel Card ──────────────────────────────────────────────────────────────
function ChannelCard({ ch, onRefresh }: { ch: Channel; onRefresh: () => void }) {
  const [editing, setEditing]         = useState(false);
  const [connecting, setConnecting]   = useState(false);
  const [posting, setPosting]         = useState(false);
  const [showQueue, setShowQueue]     = useState(false);
  const [queue, setQueue]             = useState<{name:string;size:number}[]>([]);
  const color = getColor(ch.name);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { auth_url } = await api.getChannelAuthUrl(ch.id);
      window.open(auth_url, '_blank', 'width=600,height=700');
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setConnecting(false); }
  };

  const handleToggleActive = async () => {
    try {
      await api.updateChannel(ch.id, { active: !ch.active });
      addToast(ch.active ? 'Channel paused' : 'Channel activated ✓', 'info');
      onRefresh();
    } catch (e: any) { addToast(e.message, 'error'); }
  };

  const handlePostNow = async () => {
    setPosting(true);
    try {
      await api.postNow(ch.id);
      addToast('🚀 Posting next video now!', 'success');
      onRefresh();
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setPosting(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${ch.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteChannel(ch.id);
      addToast('Channel deleted', 'info');
      onRefresh();
    } catch (e: any) { addToast(e.message, 'error'); }
  };

  const loadQueue = async () => {
    if (showQueue) { setShowQueue(false); return; }
    const q = await api.getChannelQueue(ch.id);
    setQueue(q);
    setShowQueue(true);
  };

  return (
    <>
      {editing && <ChannelModal channel={ch} onClose={() => setEditing(false)} onSaved={onRefresh} />}
      <div className="card animate-slide-up" style={{ padding: 0, overflow: 'hidden', transition: 'all 0.2s' }}>
        {/* Card header */}
        <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Avatar */}
          <div style={{
            width: 46, height: 46, borderRadius: 12, flexShrink: 0,
            background: `linear-gradient(135deg, ${color}33, ${color}22)`,
            border: `2px solid ${color}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 800, color,
          }}>
            {ch.name[0]?.toUpperCase()}
          </div>

          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ch.name}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              {/* Connection status */}
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                background: ch.connected ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.1)',
                color: ch.connected ? '#10b981' : '#f87171',
                border: `1px solid ${ch.connected ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.2)'}`,
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                {ch.connected ? '● Connected' : '○ Not connected'}
              </span>
              {/* Active badge */}
              {ch.connected && (
                <span className={`badge ${ch.active ? 'badge-done' : 'badge-pending'}`}>
                  {ch.active ? '▶ Active' : '⏸ Paused'}
                </span>
              )}
            </div>
          </div>

          {/* Quick stats */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color }}>{ch.pending_count}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>in queue</div>
          </div>
        </div>

        {/* Info grid */}
        <div style={{
          padding: '12px 20px',
          background: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border)',
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 10,
        }}>
          <InfoRow icon="📁" label="Folder">
            <span style={{ fontSize: 11, color: ch.watch_folder ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
              {ch.watch_folder ? ch.watch_folder.split('/').slice(-2).join('/') : 'Not set'}
            </span>
          </InfoRow>
          <InfoRow icon="⏱" label="Schedule">
            <span style={{ fontSize: 11, color: 'var(--text-primary)' }}>
              Every {ch.delay_days} day{ch.delay_days !== 1 ? 's' : ''} · {fmt(ch.post_hour)}:{fmt(ch.post_minute)} UTC
            </span>
          </InfoRow>
          <InfoRow icon="📅" label="Next post">
            <span style={{ fontSize: 11, color: ch.next_post_at && ch.active ? '#818cf8' : 'var(--text-muted)' }}>
              {ch.next_post_at && ch.active
                ? formatDistanceToNow(new Date(ch.next_post_at), { addSuffix: true })
                : '—'}
            </span>
          </InfoRow>
          <InfoRow icon="✅" label="Last posted">
            <span style={{ fontSize: 11, color: ch.last_posted_at ? 'var(--text-primary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
              {ch.last_posted_file
                ? ch.last_posted_file
                : 'Never'}
            </span>
          </InfoRow>
        </div>

        {/* Stats row */}
        <div style={{ padding: '8px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 20 }}>
          {[
            { label: 'Posted', value: ch.posted_count, color: '#10b981' },
            { label: 'Queued', value: ch.pending_count, color: color },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!ch.connected ? (
            <button className="btn btn-primary" style={{ fontSize: 12, padding: '7px 14px' }} onClick={handleConnect} disabled={connecting}>
              {connecting ? '…' : '🔗 Connect YouTube'}
            </button>
          ) : (
            <button
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '7px 14px', borderColor: ch.active ? 'rgba(245,158,11,0.4)' : 'rgba(16,185,129,0.4)', color: ch.active ? '#f59e0b' : '#10b981' }}
              onClick={handleToggleActive}
            >
              {ch.active ? '⏸ Pause' : '▶ Activate'}
            </button>
          )}

          <button className="btn btn-secondary" style={{ fontSize: 12, padding: '7px 14px' }} onClick={() => setEditing(true)}>
            ✏️ Edit
          </button>

          {ch.connected && ch.watch_folder && (
            <button className="btn btn-secondary" style={{ fontSize: 12, padding: '7px 14px' }} onClick={handlePostNow} disabled={posting}>
              {posting ? '⟳' : '⚡ Post Now'}
            </button>
          )}

          {ch.pending_count > 0 && (
            <button className="btn btn-secondary" style={{ fontSize: 12, padding: '7px 14px' }} onClick={loadQueue}>
              {showQueue ? '▲ Hide Queue' : `📋 Queue (${ch.pending_count})`}
            </button>
          )}

          <button className="btn btn-danger" style={{ fontSize: 12, padding: '7px 14px', marginLeft: 'auto' }} onClick={handleDelete}>
            🗑
          </button>
        </div>

        {/* Queue preview */}
        {showQueue && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px', background: 'rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Upcoming videos (in order)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {queue.slice(0, 8).map((v, i) => (
                <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 6, background: i === 0 ? 'rgba(99,102,241,0.1)' : 'transparent' }}>
                  <span style={{ fontSize: 11, color: i === 0 ? '#818cf8' : 'var(--text-muted)', width: 18, textAlign: 'right', fontWeight: i === 0 ? 700 : 400 }}>
                    {i === 0 ? '▶' : `${i + 1}`}
                  </span>
                  <span style={{ fontSize: 12, color: i === 0 ? 'var(--text-primary)' : 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.name}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {(v.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
              ))}
              {queue.length > 8 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 8px' }}>
                  +{queue.length - 8} more videos
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function InfoRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
        {icon} {label}
      </div>
      {children}
    </div>
  );
}

// ── Main Channels Page ────────────────────────────────────────────────────────
export default function ChannelsPage({ onRefreshNeeded }: { onRefreshNeeded?: () => void }) {
  const [channels, setChannels]   = useState<Channel[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showAdd, setShowAdd]     = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.listChannels();
      setChannels(data);
    } catch { addToast('Failed to load channels', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll active channels every 10s for live next-post countdown
  useEffect(() => {
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  // Stats
  const stats = {
    total:   channels.length,
    active:  channels.filter(c => c.active).length,
    posted:  channels.reduce((s, c) => s + c.posted_count, 0),
    queued:  channels.reduce((s, c) => s + c.pending_count, 0),
  };

  return (
    <>
      {showAdd && <ChannelModal onClose={() => setShowAdd(false)} onSaved={load} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {[
            { label: 'Channels',       value: stats.total,  icon: '📡', color: '#6366f1' },
            { label: 'Active',         value: stats.active, icon: '▶',  color: '#10b981' },
            { label: 'Total Posted',   value: stats.posted, icon: '✅', color: '#8b5cf6' },
            { label: 'Total Queued',   value: stats.queued, icon: '⏳', color: '#f59e0b' },
          ].map(s => (
            <div key={s.label} className="card" style={{ textAlign: 'center', padding: 16 }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {channels.length === 0 ? 'No channels yet — add your first one!' : `${channels.length} channel${channels.length !== 1 ? 's' : ''} configured`}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" style={{ fontSize: 12, padding: '7px 14px' }} onClick={load}>🔄 Refresh</button>
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}>➕ Add Channel</button>
          </div>
        </div>

        {/* Channel cards */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1,2,3].map(i => <div key={i} className="shimmer" style={{ height: 200, borderRadius: 12 }} />)}
          </div>
        ) : channels.length === 0 ? (
          <div style={{
            padding: 60, textAlign: 'center',
            background: 'var(--bg-secondary)', borderRadius: 16,
            border: '2px dashed var(--border)',
          }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>📡</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No channels yet</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
              Add a channel, connect it to YouTube, set a folder and schedule — it will auto-post for you!
            </div>
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}>➕ Add Your First Channel</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(400px,1fr))', gap: 16 }}>
            {channels.map(ch => <ChannelCard key={ch.id} ch={ch} onRefresh={load} />)}
          </div>
        )}

        {/* How it works */}
        {channels.length === 0 && (
          <div className="card" style={{ padding: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>⚡ How Auto-Posting Works</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
              {[
                { icon: '➕', step: '1', text: 'Add a channel and give it a name' },
                { icon: '🔗', step: '2', text: 'Connect it to a YouTube account via Google' },
                { icon: '📁', step: '3', text: 'Set a local folder with your video files' },
                { icon: '⏱', step: '4', text: 'Set delay (e.g. every 1 day at 10:00)' },
                { icon: '▶', step: '5', text: 'Activate — it posts videos automatically!' },
              ].map(s => (
                <div key={s.step} style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: 14, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
                  <div style={{ fontSize: 10, color: '#6366f1', fontWeight: 700, marginBottom: 4 }}>STEP {s.step}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
