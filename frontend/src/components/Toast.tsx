'use client';
import { useState, useEffect } from 'react';
import api from '@/lib/api';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

let toastHandlers: ((t: Toast) => void)[] = [];

export function addToast(message: string, type: Toast['type'] = 'info') {
  const t: Toast = { id: Date.now().toString(), message, type };
  toastHandlers.forEach(h => h(t));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    const handler = (t: Toast) => {
      setToasts(p => [...p, t]);
      setTimeout(() => setToasts(p => p.filter(x => x.id !== t.id)), 4000);
    };
    toastHandlers.push(handler);
    return () => { toastHandlers = toastHandlers.filter(h => h !== handler); };
  }, []);

  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{icons[t.type]}</span>
          <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
