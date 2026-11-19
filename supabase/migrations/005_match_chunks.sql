create or replace function public.match_chunks(
  query_embedding extensions.vector(384),
  match_org_id uuid,
  match_count int default 5,
  match_document_id uuid default null
)
returns table (id uuid, document_id uuid, content text, similarity float)
language sql
stable
set search_path = public, extensions
as $$
  select c.id, c.document_id, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  where c.org_id = match_org_id
    and (match_document_id is null or c.document_id = match_document_id)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Only your server (secret key) may call it; never the browser keys
revoke execute on function public.match_chunks(extensions.vector, uuid, int, uuid)
  from public, anon, authenticated;
grant execute on function public.match_chunks(extensions.vector, uuid, int, uuid)
  to service_role;