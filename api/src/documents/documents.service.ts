import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import type { OrgContext } from '../orgs/current-org.decorator';
import { CreateUploadDto } from './dto/documents.dto';

export const BUCKET = 'documents';

@Injectable()
export class DocumentsService {
  constructor(
    private supabase: SupabaseService,
    @InjectQueue('documents') private queue: Queue,
  ) {}

  private get db() {
    return this.supabase.client;
  }

  /** Every lookup is scoped by org_id: this is the tenant isolation. */
  private async getScoped(orgId: string, id: string) {
    const { data } = await this.db
      .from('documents')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle();
    if (!data) throw new NotFoundException('Document not found');
    return data;
  }

  async createUpload(org: OrgContext, userId: string, dto: CreateUploadDto) {
    const id = randomUUID();
    const safeName = dto.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${org.id}/${id}/${safeName}`;

    const { data: signed, error: signErr } = await this.db.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (signErr || !signed) {
      throw new InternalServerErrorException('Could not create upload URL');
    }

    const { error } = await this.db.from('documents').insert({
      id,
      org_id: org.id,
      uploaded_by: userId,
      title: dto.filename,
      storage_path: path,
      mime_type: dto.mimeType,
      status: 'uploading',
    });
    if (error) throw new InternalServerErrorException(error.message);

    return { documentId: id, uploadUrl: signed.signedUrl, path };
  }

  async complete(org: OrgContext, userId: string, id: string) {
    const doc = await this.getScoped(org.id, id);
    if (doc.status !== 'uploading') {
      throw new BadRequestException('Document already submitted');
    }

    const { data: files } = await this.db.storage
      .from(BUCKET)
      .list(`${org.id}/${id}`);
    if (!files?.length) throw new BadRequestException('File has not been uploaded yet');

    await this.db.from('documents').update({ status: 'queued' }).eq('id', id);

    await this.queue.add(
      'process',
      { documentId: id, orgId: org.id, userId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 15000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
    return { id, status: 'queued' };
  }

  async list(orgId: string) {
    const { data, error } = await this.db
      .from('documents')
      .select('id, title, status, mime_type, created_at, summary, error')
      .eq('org_id', orgId)
      .neq('status', 'uploading')
      .order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async get(orgId: string, id: string) {
    const doc = await this.getScoped(orgId, id);
    const { count } = await this.db
      .from('chunks')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', id);
    return {
      id: doc.id,
      title: doc.title,
      status: doc.status,
      summary: doc.summary,
      error: doc.error,
      chunks: count ?? 0,
      createdAt: doc.created_at,
    };
  }

  async remove(orgId: string, id: string) {
    const doc = await this.getScoped(orgId, id);
    await this.db.storage.from(BUCKET).remove([doc.storage_path]);
    const { error } = await this.db.from('documents').delete().eq('id', id);
    if (error) throw new InternalServerErrorException(error.message);
    return { deleted: true };
  }
}