-- tribe_posts: coluna do autor (o app envia user_id)
-- Erro: PGRST204 — Could not find the 'user_id' column of 'tribe_posts' in the schema cache

ALTER TABLE public.tribe_posts
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tribe_posts_user_id_idx ON public.tribe_posts (user_id);

COMMENT ON COLUMN public.tribe_posts.user_id IS 'Autor do post (auth.users.id).';

-- Se já existia outra coluna com o mesmo significado, copiar uma vez (ajusta o nome se for o caso):
-- UPDATE public.tribe_posts SET user_id = author_id WHERE user_id IS NULL AND author_id IS NOT NULL;
