import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { SupabaseService } from '../supabase/supabase.service';
import { AiService } from '../ai/ai.service';
import type { ChatMessage } from '../ai/ai.service';
import type { OrgContext } from '../orgs/current-org.decorator';
import { ChatDto } from './dto/chat.dto';

const TOP_K = 5;
const MIN_SIMILARITY = 0.2; // tune this after testing with your own documents

const SYSTEM_PROMPT =
  "You answer questions using ONLY the provided context from the user's documents. " +
  "If the answer is not in the context, say you don't know. " +
  'Cite sources inline like [1] or [2]. Be concise.';

interface MatchRow {
  id: string;
  document_id: string;
  content: string;
  similarity: number;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private supabase: SupabaseService,
    private ai: AiService,
  ) {}

  private get db() {
    return this.supabase.client;
  }

  async stream(org: OrgContext, userId: string, dto: ChatDto, res: Response) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Stop the Groq call if the browser disconnects mid-answer
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    const send = (event: string, data: unknown) => {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    let answer = '';
    let tokens = 0;
    let promptChars = dto.question.length;
    let countable = false;

    try {
      // 1. Embed the question (local model)
      const [queryVec] = await this.ai.embed([dto.question]);

      // 2. Org-scoped vector search
      const { data, error } = await this.db.rpc('match_chunks', {
        query_embedding: JSON.stringify(queryVec),
        match_org_id: org.id,
        match_count: TOP_K,
        match_document_id: dto.documentId ?? null,
      });
      if (error) throw new Error(`Search failed: ${error.message}`);
      countable = true;

      const matches = ((data ?? []) as MatchRow[]).filter(
        (m) => m.similarity >= MIN_SIMILARITY,
      );

      if (!matches.length) {
        answer = "I couldn't find anything relevant in your documents.";
        send('sources', []);
        send('token', { t: answer });
        return;
      }

      // 3. Look up document titles (also scoped by org)
      const docIds = [...new Set(matches.map((m) => m.document_id))];
      const { data: docs } = await this.db
        .from('documents')
        .select('id, title')
        .eq('org_id', org.id)
        .in('id', docIds);
      const titles = new Map<string, string>(
        (docs ?? []).map((d: { id: string; title: string }) => [d.id, d.title]),
      );

      send(
        'sources',
        matches.map((m, i) => ({
          n: i + 1,
          documentId: m.document_id,
          title: titles.get(m.document_id) ?? 'Untitled',
          similarity: Number(m.similarity.toFixed(3)),
          snippet: m.content.slice(0, 200),
        })),
      );

      // 4. Build the prompt
      const context = matches
        .map((m, i) => `[${i + 1}] (${titles.get(m.document_id) ?? 'Untitled'})\n${m.content}`)
        .join('\n\n');
      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...(dto.history ?? []).map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: `Context:\n${context}\n\nQuestion: ${dto.question}` },
      ];
      promptChars = SYSTEM_PROMPT.length + context.length + dto.question.length;

      // 5. Stream the answer
      for await (const part of this.ai.streamChat(messages, controller.signal)) {
        if (part.token) {
          answer += part.token;
          send('token', { t: part.token });
        }
        if (part.usage) tokens = part.usage;
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(msg);
      send('error', {
        message: msg.includes('429')
          ? 'The AI service is busy. Please try again in a moment.'
          : 'Something went wrong. Please try again.',
      });
    } finally {
      const used = tokens || Math.ceil((promptChars + answer.length) / 4);
      if (countable) {
        await this.db
          .from('usage_logs')
          .insert({ org_id: org.id, user_id: userId, kind: 'query', tokens: used });
      }
      send('done', { tokens: used });
      res.end();
    }
  }
}