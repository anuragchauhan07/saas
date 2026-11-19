import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PDFParse } from 'pdf-parse';
import { SupabaseService } from '../supabase/supabase.service';
import { AiService } from '../ai/ai.service';
import { chunkText } from './chunker';
import { BUCKET } from './documents.service';

interface DocJob {
  documentId: string;
  orgId: string;
  userId: string;
}

// drainDelay makes the worker poll Redis less often when idle (saves Upstash commands)
@Processor('documents', { concurrency: 2, drainDelay: 30 })
export class DocumentsProcessor extends WorkerHost {
  constructor(
    private supabase: SupabaseService,
    private ai: AiService,
  ) {
    super();
  }

  async process(job: Job<DocJob>) {
    const { documentId, orgId, userId } = job.data;
    const db = this.supabase.client;

    await db
      .from('documents')
      .update({ status: 'processing', error: null })
      .eq('id', documentId);

    try {
      const { data: doc } = await db
        .from('documents')
        .select('storage_path, mime_type, title')
        .eq('id', documentId)
        .single();
      if (!doc) throw new Error('Document not found');

      // 1. Download
      const { data: blob, error: dlErr } = await db.storage
        .from(BUCKET)
        .download(doc.storage_path);
      if (dlErr || !blob) throw new Error(`Download failed: ${dlErr?.message}`);
      const buffer = Buffer.from(await blob.arrayBuffer());

      // 2. Extract text
      const text = await this.extractText(buffer, doc.mime_type);
      if (text.trim().length < 20) {
        throw new Error('No readable text found (scanned PDFs are not supported)');
      }

      // 3. Chunk + embed (local model)
      const chunks = chunkText(text, 800, 120);
      const vectors = await this.ai.embed(chunks);

      // 4. Store (delete first so retries are idempotent)
      await db.from('chunks').delete().eq('document_id', documentId);
      const rows = chunks.map((content, i) => ({
        document_id: documentId,
        org_id: orgId,
        chunk_index: i,
        content,
        embedding: JSON.stringify(vectors[i]),
      }));
      for (let i = 0; i < rows.length; i += 50) {
        const { error } = await db.from('chunks').insert(rows.slice(i, i + 50));
        if (error) throw new Error(`Chunk insert failed: ${error.message}`);
      }

      // 5. Summary via Groq (best effort: don't fail the document if this errors)
      let summary: string | null = null;
      try {
        summary = await this.ai.generate(
          `Summarize this document in 4-6 concise sentences.\n\n${text.slice(0, 8000)}`,
        );
      } catch {
        summary = null;
      }

      await db
        .from('documents')
        .update({ status: 'done', summary, error: null })
        .eq('id', documentId);

      // 6. Usage tracking (used for plan limits on Day 5)
      await db.from('usage_logs').insert([
        { org_id: orgId, user_id: userId, kind: 'document', tokens: 0 },
        {
          org_id: orgId,
          user_id: userId,
          kind: 'embedding',
          tokens: Math.ceil(text.length / 4),
        },
      ]);

      return { chunks: chunks.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isFinalAttempt) {
        await db
          .from('documents')
          .update({ status: 'failed', error: message.slice(0, 500) })
          .eq('id', documentId);
      }
      throw err; // lets BullMQ retry with backoff
    }
  }

  private async extractText(buffer: Buffer, mime: string | null): Promise<string> {
    if (mime === 'application/pdf') {
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        return result.text;
      } finally {
        await parser.destroy();
      }
    }
    return buffer.toString('utf-8');
  }
}