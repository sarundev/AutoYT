'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import api from '@/lib/api';
import { addToast } from './Toast';

interface Channel { id: string; name: string; connected: boolean; }

interface UploadFormProps {
  onSuccess?: () => void;
}

const VIDEO_EXTS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.flv'];
const PRIVACY_OPTIONS = [
  { value: 'public',   label: '🌍 Public',   desc: 'Anyone can see this' },
  { value: 'unlisted', label: '🔗 Unlisted',  desc: 'Only with the link'  },
  { value: 'private',  label: '🔒 Private',   desc: 'Only you'            },
];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function UploadForm({ onSuccess }: UploadFormProps) {
  const [mode, setMode]                   = useState<'single' | 'bulk'>('single');
  const [channels, setChannels]           = useState<Channel[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  
  // Single mode state
  const [file, setFile]                   = useState<File | null>(null);
  const [dragging, setDragging]           = useState(false);
  const [title, setTitle]                 = useState('');
  const [description, setDescription]     = useState('');
  const [tags, setTags]                   = useState('');
  const [privacy, setPrivacy]             = useState('public');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');
  const [uploading, setUploading]         = useState(false);
  const [uploadPct, setUploadPct]         = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Bulk mode state
  const [bulkFiles, setBulkFiles]         = useState<File[]>([]);
  const [bulkFolderName, setBulkFolderName] = useState('');
  const [bulkInterval, setBulkInterval]   = useState(60);
  const [bulkStartTime, setBulkStartTime] = useState('');
  const [bulkProgressText, setBulkProgressText] = useState('');
  const bulkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.listChannels().then((chs: Channel[]) => {
      const connected = chs.filter(c => c.connected);
      setChannels(connected);
      if (connected.length === 1) setSelectedChannelIds([connected[0].id]);
    }).catch(() => {});
  }, []);

  // ── File selection helpers ───────────────────────────────────────────────
  const applyFile = (f: File) => {
    const ext = '.' + f.name.split('.').pop()?.toLowerCase();
    if (!VIDEO_EXTS.includes(ext)) {
      addToast(`Unsupported file type: ${ext}`, 'error');
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) applyFile(f);
  };

  const onBulkFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const videos = files.filter(f => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      return VIDEO_EXTS.includes(ext);
    });
    
    if (videos.length === 0) {
      addToast('No videos found in selected folder', 'error');
      return;
    }
    
    // Sort alphabetically by name
    videos.sort((a, b) => a.name.localeCompare(b.name));
    setBulkFiles(videos);
    
    // Extract folder name from webkitRelativePath
    if (videos[0].webkitRelativePath) {
      setBulkFolderName(videos[0].webkitRelativePath.split('/')[0]);
    } else {
      setBulkFolderName('Folder');
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) applyFile(f);
  }, []);

  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  // ── Submit Single ────────────────────────────────────────────────────────
  const handleSubmitSingle = async () => {
    if (selectedChannelIds.length === 0) { addToast('Please select at least one channel', 'error'); return; }
    if (!file)           { addToast('Please select a video file', 'error'); return; }
    if (!title.trim())   { addToast('Please enter a title',       'error'); return; }

    setUploading(true);
    setUploadPct(0);
    try {
      for (const cid of selectedChannelIds) {
        setUploadPct(0);
        await api.queueUpload(
          file,
          {
            channel_id:     cid,
            title:          title.trim(),
            description:    description.trim(),
            tags:           tags.trim(),
            privacy,
            scheduled_time: scheduleEnabled && scheduledTime
              ? new Date(scheduledTime).toISOString()
              : undefined,
          },
          (pct) => setUploadPct(pct),
        );
      }

      addToast(scheduleEnabled ? '📅 Video scheduled!' : '🚀 Upload started!', 'success');
      setFile(null);
      setTitle('');
      setDescription('');
      setTags('');
      setPrivacy('public');
      setScheduleEnabled(false);
      setScheduledTime('');
      if (inputRef.current) inputRef.current.value = '';
      onSuccess?.();
    } catch (e: any) {
      addToast(e.message || 'Failed to upload', 'error');
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  };

  // ── Submit Bulk ──────────────────────────────────────────────────────────
  const handleSubmitBulk = async () => {
    if (selectedChannelIds.length === 0) { addToast('Please select at least one channel', 'error'); return; }
    if (bulkFiles.length === 0) { addToast('Please select a folder with videos', 'error'); return; }
    if (!bulkStartTime)      { addToast('Please select a start time', 'error'); return; }

    setUploading(true);
    let successCount = 0;
    const startMs = new Date(bulkStartTime).getTime();
    const intervalMs = bulkInterval * 60 * 1000; // minutes to ms

    try {
      for (const cid of selectedChannelIds) {
        const ch = channels.find(c => c.id === cid);
        for (let i = 0; i < bulkFiles.length; i++) {
          const f = bulkFiles[i];
          setBulkProgressText(`[${ch?.name || 'Channel'}] Uploading ${i + 1} of ${bulkFiles.length}: ${f.name}`);
          setUploadPct(0);
          
          const scheduleMs = startMs + (i * intervalMs);
          const stitle = f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');

          await api.queueUpload(
            f,
            {
              channel_id: cid,
              title: stitle,
              description: description.trim(),
              tags: tags.trim(),
              privacy,
              scheduled_time: new Date(scheduleMs).toISOString(),
            },
            (pct) => setUploadPct(pct)
          );
          successCount++;
        }
      }

      addToast(`📅 Successfully queued ${successCount} videos!`, 'success');
      setBulkFiles([]);
      setBulkStartTime('');
      if (bulkInputRef.current) bulkInputRef.current.value = '';
      onSuccess?.();
      setMode('single'); // switch back to see history usually
    } catch (e: any) {
      addToast(e.message || 'Failed during bulk upload', 'error');
    } finally {
      setUploading(false);
      setBulkProgressText('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* ── Mode selector ── */}
      <div style={{ display: 'flex', gap: 10, background: 'var(--bg-secondary)', padding: 6, borderRadius: 12 }}>
        <button
          onClick={() => setMode('single')}
          style={{
            flex: 1, padding: '10px 0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, border: 'none',
            background: mode === 'single' ? 'var(--bg-card)' : 'transparent',
            color: mode === 'single' ? 'var(--text-primary)' : 'var(--text-muted)',
            boxShadow: mode === 'single' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
            transition: 'all 0.2s',
          }}
        >
          🎬 Single Video
        </button>
        <button
          onClick={() => setMode('bulk')}
          style={{
            flex: 1, padding: '10px 0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, border: 'none',
            background: mode === 'bulk' ? 'var(--bg-card)' : 'transparent',
            color: mode === 'bulk' ? 'var(--text-primary)' : 'var(--text-muted)',
            boxShadow: mode === 'bulk' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
            transition: 'all 0.2s',
          }}
        >
          📁 Bulk from Folder
        </button>
      </div>

      {/* ── Channel selector ── */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Upload to Channels (select multiple) *
        </label>
        {channels.length === 0 ? (
          <div style={{ padding: '12px 16px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, fontSize: 13, color: '#fbbf24' }}>
            ⚠ No connected channels. Go to the <strong>Channels</strong> tab to add one.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {channels.map(ch => {
              const isSelected = selectedChannelIds.includes(ch.id);
              return (
                <button key={ch.id} onClick={() => {
                  if (isSelected) setSelectedChannelIds(prev => prev.filter(id => id !== ch.id));
                  else setSelectedChannelIds(prev => [...prev, ch.id]);
                }} style={{
                  padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                  background: isSelected ? 'rgba(99,102,241,0.15)' : 'var(--bg-secondary)',
                  color: isSelected ? '#818cf8' : 'var(--text-secondary)',
                  fontFamily: 'Inter,sans-serif', transition: 'all 0.15s',
                }}>
                  📡 {ch.name} {isSelected && '✓'}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {mode === 'single' ? (
        <>
          {/* ── Drop zone ── */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => !file && inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? '#6366f1' : file ? 'rgba(16,185,129,0.5)' : 'var(--border)'}`,
              borderRadius: 14,
              background: dragging
                ? 'rgba(99,102,241,0.07)'
                : file
                ? 'rgba(16,185,129,0.05)'
                : 'var(--bg-secondary)',
              padding: '32px 24px',
              textAlign: 'center',
              cursor: file ? 'default' : 'pointer',
              transition: 'all 0.2s',
              boxShadow: dragging ? '0 0 0 4px rgba(99,102,241,0.15)' : 'none',
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept="video/mp4,video/mov,video/quicktime,video/avi,video/x-matroska,video/webm,video/x-m4v,.mp4,.mov,.avi,.mkv,.webm,.m4v,.flv"
              style={{ display: 'none' }}
              onChange={onInputChange}
            />

            {file ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 14,
                  background: 'linear-gradient(135deg,rgba(16,185,129,0.2),rgba(5,150,105,0.2))',
                  border: '1px solid rgba(16,185,129,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28,
                }}>🎬</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {file.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {formatBytes(file.size)}
                </div>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 12, padding: '5px 14px', marginTop: 4 }}
                  onClick={(e) => { e.stopPropagation(); setFile(null); setTitle(''); if (inputRef.current) inputRef.current.value = ''; }}
                >
                  ✕ Remove
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 16,
                  background: dragging
                    ? 'linear-gradient(135deg,rgba(99,102,241,0.25),rgba(139,92,246,0.25))'
                    : 'rgba(99,102,241,0.1)',
                  border: `1px solid ${dragging ? 'rgba(99,102,241,0.5)' : 'rgba(99,102,241,0.2)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 30,
                  transition: 'all 0.2s',
                  animation: dragging ? 'none' : 'float 3s ease-in-out infinite',
                }}>
                  {dragging ? '📂' : '🎬'}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {dragging ? 'Drop your video here' : 'Select or drop a video'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  MP4, MOV, AVI, MKV, WEBM, M4V, FLV
                </div>
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 6, fontSize: 13 }}
                  onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                >
                  📁 Browse files
                </button>
              </div>
            )}
          </div>

          {file && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Title *
                </label>
                <input
                  className="input-base" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="My awesome YouTube Short" maxLength={100} autoFocus
                />
                <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  {title.length}/100
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</label>
                <textarea className="input-base" value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe your video..." rows={3} style={{ resize: 'vertical' }} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tags</label>
                <input className="input-base" value={tags} onChange={e => setTags(e.target.value)} placeholder="shorts, viral, trending (comma-separated)" />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Privacy</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {PRIVACY_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setPrivacy(opt.value)} style={{
                      flex: 1, padding: '10px 8px', borderRadius: 8, cursor: 'pointer',
                      border: `1px solid ${privacy === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                      background: privacy === opt.value ? 'rgba(99,102,241,0.15)' : 'var(--bg-secondary)',
                      color: privacy === opt.value ? '#818cf8' : 'var(--text-secondary)',
                      fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 500, transition: 'all 0.15s', textAlign: 'center',
                    }}>
                      <div>{opt.label}</div>
                      <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: scheduleEnabled ? 12 : 0 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>📅 Schedule Post</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Post at a specific date & time</div>
                  </div>
                  <button onClick={() => setScheduleEnabled(v => !v)} style={{
                    width: 44, height: 24, borderRadius: 12, background: scheduleEnabled ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'var(--border)',
                    border: 'none', cursor: 'pointer', position: 'relative', transition: 'all 0.2s',
                  }}>
                    <div style={{ position: 'absolute', top: 2, left: scheduleEnabled ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
                  </button>
                </div>
                {scheduleEnabled && (
                  <input className="input-base" type="datetime-local" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} min={new Date().toISOString().slice(0, 16)} />
                )}
              </div>

              {uploading && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                    <span>⬆ Sending to server…</span>
                    <span>{uploadPct}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${uploadPct}%` }} />
                  </div>
                </div>
              )}

              <button
                className="btn btn-primary" onClick={handleSubmitSingle}
                disabled={uploading || !title.trim()}
                style={{ width: '100%', justifyContent: 'center', padding: '13px', fontSize: 15 }}
              >
                {uploading ? <><span className="animate-spin-slow" style={{ display: 'inline-block' }}>⟳</span> Uploading… {uploadPct}%</> : scheduleEnabled ? '📅 Schedule Upload' : '🚀 Upload to YouTube'}
              </button>
            </div>
          )}
        </>
      ) : (
        /* ── BULK MODE ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'slide-up 0.2s ease-out' }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              📁 Select Local Folder *
            </label>
            <div style={{
              border: `2px dashed ${bulkFiles.length > 0 ? 'rgba(16,185,129,0.5)' : 'var(--border)'}`,
              borderRadius: 14, background: bulkFiles.length > 0 ? 'rgba(16,185,129,0.05)' : 'var(--bg-secondary)',
              padding: '24px', textAlign: 'center', transition: 'all 0.2s',
            }}>
              <input
                ref={bulkInputRef} type="file"
                // @ts-ignore - React doesn't perfectly type webkitdirectory
                webkitdirectory="" directory="" multiple
                style={{ display: 'none' }} onChange={onBulkFolderChange}
              />
              {bulkFiles.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 32 }}>📂</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Selected {bulkFiles.length} videos from {bulkFolderName}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {formatBytes(bulkFiles.reduce((sum, f) => sum + f.size, 0))} total
                  </div>
                  <button className="btn btn-secondary" style={{ fontSize: 12, padding: '5px 14px', marginTop: 4 }}
                    onClick={() => { setBulkFiles([]); if (bulkInputRef.current) bulkInputRef.current.value = ''; }}>
                    ✕ Clear Selection
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 32 }}>📁</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Select a folder</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>All MP4, MOV, etc. will be queued alphabetically</div>
                  <button className="btn btn-primary" onClick={() => bulkInputRef.current?.click()}>Choose Folder</button>
                </div>
              )}
            </div>
          </div>

          {bulkFiles.length > 0 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    📅 First Post Time *
                  </label>
                  <input
                    className="input-base" type="datetime-local" value={bulkStartTime} onChange={e => setBulkStartTime(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    ⏱ Interval Between Posts
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      className="input-base" type="number" min={1}
                      value={bulkInterval} onChange={e => setBulkInterval(Number(e.target.value))}
                      style={{ width: 80 }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>minutes</span>
                  </div>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Privacy applied to all</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {PRIVACY_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setPrivacy(opt.value)} style={{
                      flex: 1, padding: '10px 8px', borderRadius: 8, cursor: 'pointer',
                      border: `1px solid ${privacy === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                      background: privacy === opt.value ? 'rgba(99,102,241,0.15)' : 'var(--bg-secondary)',
                      color: privacy === opt.value ? '#818cf8' : 'var(--text-secondary)',
                      fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 500, transition: 'all 0.15s', textAlign: 'center',
                    }}>
                      <div>{opt.label}</div>
                      <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Default Tags for all</label>
                <input className="input-base" value={tags} onChange={e => setTags(e.target.value)} placeholder="shorts, viral (comma-separated)" />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Default Description for all</label>
                <textarea className="input-base" value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe your videos..." rows={2} style={{ resize: 'vertical' }} />
              </div>

              {uploading && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                    <span>⬆ {bulkProgressText}</span>
                    <span>{uploadPct}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${uploadPct}%` }} />
                  </div>
                </div>
              )}

              <button
                className="btn btn-primary" onClick={handleSubmitBulk}
                disabled={uploading || !bulkStartTime}
                style={{ width: '100%', justifyContent: 'center', padding: '13px', fontSize: 15, marginTop: 8 }}
              >
                {uploading ? <><span className="animate-spin-slow" style={{ display: 'inline-block' }}>⟳</span> Queuing videos…</> : `🚀 Queue ${bulkFiles.length} Videos`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
