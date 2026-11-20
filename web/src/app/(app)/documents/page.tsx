'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useSession } from '@/components/session-provider';

type Status = 'uploading' | 'queued' | 'processing' | 'done' | 'failed';

interface Doc {
  id: string;
  title: string;
  status: Status;
  created_at: string;
  summary: string | null;
  error: string | null;
}

const BADGE: Record<Status, string> = {
  uploading: 'bg-zinc-100 text-zinc-700',
  queued: 'bg-amber-100 text-amber-800',
  processing: 'bg-blue-100 text-blue-800',
  done: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

const MAX_BYTES = 10 * 1024 * 1024;

function mimeFor(file: File) {
  if (file.type) return file.type;
  return file.name.toLowerCase().endsWith('.md') ? 'text/markdown' : 'text/plain';
}

export default function DocumentsPage() {
  const { role } = useSession();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setDocs(await api<Doc[]>('/documents'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll every 3s while anything is still being processed
  const pending = docs.some((d) => d.status === 'queued' || d.status === 'processing');
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [pending, refresh]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError('File is larger than 10 MB');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const mime = mimeFor(file);
      const { documentId, uploadUrl } = await api<{ documentId: string; uploadUrl: string }>(
        '/documents/upload-url',
        { method: 'POST', json: { filename: file.name, mimeType: mime, size: file.size } },
      );
      // The file goes straight to Supabase Storage, not through our API
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mime },
        body: file,
      });
      if (!put.ok) throw new Error('Upload to storage failed');
      await api(`/documents/${documentId}/complete`, { method: 'POST' });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this document?')) return;
    try {
      await api(`/documents/${id}`, { method: 'DELETE' });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  const canDelete = role === 'owner' || role === 'admin';

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Documents</h1>
          <p className="text-sm text-zinc-500">PDF, TXT or Markdown, up to 10 MB.</p>
        </div>
        <div>
          <input ref={inputRef} type="file" accept=".pdf,.txt,.md" className="hidden" onChange={onFile} />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {uploading ? 'Uploading…' : 'Upload document'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-zinc-500">
          No documents yet. Upload one to get started.
        </div>
      ) : (
        <ul className="space-y-3">
          {docs.map((d) => (
            <li key={d.id} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.title}</p>
                  <p className="text-xs text-zinc-500">{new Date(d.created_at).toLocaleString()}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[d.status]}`}>
                    {d.status}
                  </span>
                  {canDelete && (
                    <button onClick={() => remove(d.id)} className="text-sm text-zinc-400 hover:text-red-600">
                      Delete
                    </button>
                  )}
                </div>
              </div>
              {d.summary && <p className="mt-3 text-sm text-zinc-700">{d.summary}</p>}
              {d.status === 'failed' && d.error && <p className="mt-3 text-sm text-red-600">{d.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}