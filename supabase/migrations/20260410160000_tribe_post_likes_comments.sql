-- Curtidas e comentários no mural da tribo (paridade com o feed principal)

CREATE TABLE IF NOT EXISTS public.tribe_post_likes (
  tribe_post_id uuid NOT NULL REFERENCES public.tribe_posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tribe_post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tribe_post_likes_user ON public.tribe_post_likes (user_id);

CREATE TABLE IF NOT EXISTS public.tribe_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_post_id uuid NOT NULL REFERENCES public.tribe_posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  content text NOT NULL,
  parent_id uuid REFERENCES public.tribe_post_comments (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tribe_post_comments_post ON public.tribe_post_comments (tribe_post_id);

ALTER TABLE public.tribe_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tribe_post_comments ENABLE ROW LEVEL SECURITY;

-- Mesma visibilidade que tribe_posts: ver se consegue ler o post
DROP POLICY IF EXISTS "tribe_post_likes_select" ON public.tribe_post_likes;
DROP POLICY IF EXISTS "tribe_post_likes_insert" ON public.tribe_post_likes;
DROP POLICY IF EXISTS "tribe_post_likes_delete" ON public.tribe_post_likes;

CREATE POLICY "tribe_post_likes_select"
  ON public.tribe_post_likes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tribe_posts tp
      JOIN public.tribes tr ON tr.id = tp.tribe_id
      WHERE tp.id = tribe_post_likes.tribe_post_id
        AND (tr.is_public = true OR EXISTS (
          SELECT 1 FROM public.tribe_members tm
          WHERE tm.tribe_id = tr.id AND tm.user_id = (SELECT auth.uid())
        ))
    )
  );

CREATE POLICY "tribe_post_likes_insert"
  ON public.tribe_post_likes FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.tribe_members tm
      JOIN public.tribe_posts tp ON tp.tribe_id = tm.tribe_id AND tp.id = tribe_post_likes.tribe_post_id
      WHERE tm.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "tribe_post_likes_delete"
  ON public.tribe_post_likes FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "tribe_post_comments_select" ON public.tribe_post_comments;
DROP POLICY IF EXISTS "tribe_post_comments_insert" ON public.tribe_post_comments;
DROP POLICY IF EXISTS "tribe_post_comments_delete" ON public.tribe_post_comments;

CREATE POLICY "tribe_post_comments_select"
  ON public.tribe_post_comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tribe_posts tp
      JOIN public.tribes tr ON tr.id = tp.tribe_id
      WHERE tp.id = tribe_post_comments.tribe_post_id
        AND (tr.is_public = true OR EXISTS (
          SELECT 1 FROM public.tribe_members tm
          WHERE tm.tribe_id = tr.id AND tm.user_id = (SELECT auth.uid())
        ))
    )
  );

CREATE POLICY "tribe_post_comments_insert"
  ON public.tribe_post_comments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.tribe_members tm
      JOIN public.tribe_posts tp ON tp.tribe_id = tm.tribe_id AND tp.id = tribe_post_comments.tribe_post_id
      WHERE tm.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "tribe_post_comments_delete"
  ON public.tribe_post_comments FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));
