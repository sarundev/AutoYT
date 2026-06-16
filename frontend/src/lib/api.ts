const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const handle = async (r: Response) => {
  if (!r.ok) { const e = await r.json(); throw new Error(e.detail || 'Request failed'); }
  return r.json();
};

export const api = {
  // Settings
  getSettings:  () => fetch(`${API}/settings`).then(r => r.json()),
  saveSettings: (client_id: string, client_secret: string) =>
    fetch(`${API}/settings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id, client_secret }),
    }).then(handle),

  // Auth
  getAuthStatus: () => fetch(`${API}/auth/status`).then(r => r.json()),

  // Channels
  listChannels:      () => fetch(`${API}/channels`).then(r => r.json()),
  createChannel:     (name: string) =>
    fetch(`${API}/channels`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then(handle),
  updateChannel: (id: string, data: Record<string, any>) =>
    fetch(`${API}/channels/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(handle),
  deleteChannel: (id: string) =>
    fetch(`${API}/channels/${id}`, { method: 'DELETE' }).then(handle),
  getChannelAuthUrl: (id: string) =>
    fetch(`${API}/channels/${id}/auth_url`).then(handle),
  getChannelQueue: (id: string) =>
    fetch(`${API}/channels/${id}/queue`).then(r => r.json()),
  postNow: (id: string) =>
    fetch(`${API}/channels/${id}/post_now`, { method: 'POST' }).then(handle),

  // Uploads
  listUploads: (channelId?: string) =>
    fetch(`${API}/uploads${channelId ? `?channel_id=${channelId}` : ''}`).then(r => r.json()),
  deleteUpload: (id: string) =>
    fetch(`${API}/uploads/${id}`, { method: 'DELETE' }).then(r => r.json()),

  queueUpload: (
    file: File,
    meta: { channel_id: string; title: string; description: string;
            tags: string; privacy: string; scheduled_time?: string },
    onProgress?: (pct: number) => void,
  ): Promise<any> => new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file, file.name);
    Object.entries(meta).forEach(([k, v]) => { if (v !== undefined) form.append(k, v); });
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/uploads/queue`);
    xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else { try { reject(new Error(JSON.parse(xhr.responseText).detail)); } catch { reject(new Error('Upload failed')); } }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(form);
  }),

  queueBulkLocal: (data: {
    channel_id: string;
    folder_path: string;
    start_time: string;
    interval_hours: number;
    privacy: string;
    tags: string;
    description: string;
  }) => fetch(`${API}/uploads/bulk_local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(handle),
};

export default api;
