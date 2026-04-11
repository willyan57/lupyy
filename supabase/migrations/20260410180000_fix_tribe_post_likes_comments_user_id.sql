-- Alinha nomes de coluna ao app: `user_id` (join com `profiles` e inserts do cliente).
-- Esquemas antigos podem ter `author_id` em vez de `user_id`.

DO $$
BEGIN
  IF to_regclass('public.tribe_post_likes') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tribe_post_likes' AND column_name = 'user_id'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tribe_post_likes' AND column_name = 'author_id'
    ) THEN
      ALTER TABLE public.tribe_post_likes RENAME COLUMN author_id TO user_id;
    END IF;
  END IF;

  IF to_regclass('public.tribe_post_comments') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tribe_post_comments' AND column_name = 'user_id'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tribe_post_comments' AND column_name = 'author_id'
    ) THEN
      ALTER TABLE public.tribe_post_comments RENAME COLUMN author_id TO user_id;
    END IF;
  END IF;
END $$;
