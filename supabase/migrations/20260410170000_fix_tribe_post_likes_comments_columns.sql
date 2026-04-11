-- Corrige drift: se `tribe_post_*` já existiam com coluna `post_id`, o `CREATE TABLE IF NOT EXISTS`
-- da migration anterior não recriou a tabela — o PostgREST falha com
-- "column tribe_post_comments.tribe_post_id does not exist".

DO $$
BEGIN
  -- tribe_post_likes: alinhar nome da FK ao esperado pelo app
  IF to_regclass('public.tribe_post_likes') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tribe_post_likes' AND column_name = 'tribe_post_id'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tribe_post_likes' AND column_name = 'post_id'
    ) THEN
      ALTER TABLE public.tribe_post_likes RENAME COLUMN post_id TO tribe_post_id;
    END IF;
  END IF;

  -- tribe_post_comments
  IF to_regclass('public.tribe_post_comments') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tribe_post_comments' AND column_name = 'tribe_post_id'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tribe_post_comments' AND column_name = 'post_id'
    ) THEN
      ALTER TABLE public.tribe_post_comments RENAME COLUMN post_id TO tribe_post_id;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tribe_post_comments' AND column_name = 'tribe_post_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_tribe_post_comments_post ON public.tribe_post_comments (tribe_post_id);
  END IF;
END $$;
