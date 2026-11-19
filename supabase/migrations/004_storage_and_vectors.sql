-- Private bucket, 10 MB limit, only the file types we can parse
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 10485760,
  array['application/pdf', 'text/plain', 'text/markdown']
)
on conflict (id) do nothing;

-- Add an 'uploading' status (row exists, file not confirmed yet)
alter table public.documents drop constraint if exists documents_status_check;
alter table public.documents add constraint documents_status_check
  check (status in ('uploading', 'queued', 'processing', 'done', 'failed'));

-- Local embedding model outputs 384 dimensions (schema was created with 768)
delete from public.chunks;
delete from public.documents;
drop index if exists public.chunks_embedding_idx;
alter table public.chunks alter column embedding type extensions.vector(384);
create index on public.chunks using hnsw (embedding extensions.vector_cosine_ops);