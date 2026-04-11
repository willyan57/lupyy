-- Base real (CSV Supabase): tribe_post_comments tem id, tribe_post_id, user_id, content,
-- created_at, is_deleted — falta parent_id (threads / respostas), que o CommentsSheet usa.
-- tribe_post_likes: PK em id bigint + UNIQUE (tribe_post_id, user_id) — ok para o app.
--
-- Isto adiciona parent_id e permite apagar o próprio comentário (não havia política DELETE).

ALTER TABLE public.tribe_post_comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.tribe_post_comments (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tribe_post_comments_parent_id
  ON public.tribe_post_comments (parent_id)
  WHERE parent_id IS NOT NULL;

-- Apagar comentário próprio (CommentsSheet.delete)
DROP POLICY IF EXISTS "tribe_post_comments_delete_own" ON public.tribe_post_comments;

CREATE POLICY "tribe_post_comments_delete_own"
  ON public.tribe_post_comments
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));
