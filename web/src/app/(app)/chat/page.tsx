'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

interface Source {
  n: number;
  documentId: string;
  title: string;
  similarity: number;
  snippet: string;
}
interface Msg {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  error?: boolean;
}
interface DocOpt {
  id: string;
  title: string;
  status: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [docs, setDocs] = useState<DocOpt[] | null>(null);
  const [docId, setDocId] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<DocOpt[]>('/documents')
      .then((d) => setDocs(d.filter((x) => x.status === 'done')))
      .catch(() => setDocs([]));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;

    // Build history from completed question/answer pairs (backend accepts up to 6 messages)
    const history: { role: 'user' | 'assistant'; content: string }[] = [];
    for (let i = 0; i < messages.length - 1; i += 2) {
      const u = messages[i];
      const a = messages[i + 1];
      if (u?.role === 'user' && a?.role === 'assistant' && a.content && !a.error) {
        history.push(
          { role: 'user', content: u.content.slice(0, 4000) },
          { role: 'assistant', content: a.content.slice(0, 4000) },
        );
      }
    }

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: question },
      { role: 'assistant', content: '' },
    ]);
    setInput('');
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const updateLast = (fn: (m: Msg) => Msg) =>
      setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? fn(m) : m)));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          documentId: docId || undefined,
          history: history.slice(-6),
        }),
        signal: controller.signal,
      });

      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => null);
        const m = d?.message;
        throw new Error(Array.isArray(m) ? m.join(', ') : (m ?? 'Request failed'));
      }

      // Read the server-sent events stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const blocks = buf.split('\n\n');
        buf = blocks.pop() ?? '';
        for (const block of blocks) {
          let event = 'message';
          let data = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (!data) continue;
          let parsed: any;
          try {
            parsed = JSON.parse(data);
          } catch {
            continue;
          }
          if (event === 'sources') updateLast((m) => ({ ...m, sources: parsed }));
          else if (event === 'token') updateLast((m) => ({ ...m, content: m.content + parsed.t }));
          else if (event === 'error') updateLast((m) => ({ ...m, content: parsed.message, error: true }));
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        updateLast((m) => ({
          ...m,
          content: err instanceof Error ? err.message : 'Something went wrong',
          error: true,
        }));
      }
    } finally {
      setBusy(false);
    }
  }

  const noDocs = docs !== null && docs.length === 0;

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Chat</h1>
        <select
          value={docId}
          onChange={(e) => setDocId(e.target.value)}
          className="max-w-xs rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
        >
          <option value="">All documents</option>
          {docs?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4">
        {messages.length === 0 && (
          <p className="py-10 text-center text-zinc-500">
            {noDocs ? (
              <>
                No processed documents yet.{' '}
                <Link href="/documents" className="underline">
                  Upload one
                </Link>{' '}
                first.
              </>
            ) : (
              'Ask a question about your documents.'
            )}
          </p>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                m.role === 'user'
                  ? 'max-w-[85%] rounded-2xl bg-zinc-900 px-4 py-2 text-sm text-white'
                  : `max-w-[85%] rounded-2xl border px-4 py-2 text-sm ${
                      m.error ? 'border-red-200 bg-red-50 text-red-700' : 'border-zinc-200 bg-zinc-50'
                    }`
              }
            >
              <p className="whitespace-pre-wrap">
                {m.content || (busy && i === messages.length - 1 ? 'Thinking…' : '')}
              </p>
              {m.sources && m.sources.length > 0 && (
                <details className="mt-3 text-xs text-zinc-500">
                  <summary className="cursor-pointer">Sources ({m.sources.length})</summary>
                  <ul className="mt-2 space-y-2">
                    {m.sources.map((s) => (
                      <li key={s.n} className="rounded-md bg-white p-2">
                        <span className="font-medium text-zinc-700">
                          [{s.n}] {s.title}
                        </span>{' '}
                        <span>· match {Math.round(s.similarity * 100)}%</span>
                        <p className="mt-1">{s.snippet}…</p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="mt-4 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          rows={1}
          maxLength={1000}
          placeholder="Ask about your documents…"
          className="flex-1 resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
        />
        {busy ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm"
          >
            Stop
          </button>
        ) : (
          <button
            disabled={!input.trim() || noDocs}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Send
          </button>
        )}
      </form>
    </div>
  );
}