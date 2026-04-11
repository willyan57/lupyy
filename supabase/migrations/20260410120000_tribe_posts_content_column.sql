-- tribe_posts: coluna de texto do mural (o app usa "content"; PostgREST falha se não existir)
-- Erro típico: PGRST204 — Could not find the 'content' column of 'tribe_posts' in the schema cache

-- 1) Ver estrutura atual (executar no SQL Editor do Supabase para inspecionar)
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'tribe_posts'
-- ORDER BY ordinal_position;

ALTER TABLE public.tribe_posts
  ADD COLUMN IF NOT EXISTS content text;

COMMENT ON COLUMN public.tribe_posts.content IS 'Texto do post no mural; pode ser null se for só mídia.';
