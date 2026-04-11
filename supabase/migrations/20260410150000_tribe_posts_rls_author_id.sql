-- tribe_posts: políticas RLS alinhadas à coluna author_id (schema real do projeto)
-- Substituem políticas que usavam user_id — sem isso o INSERT preenche author_id mas o WITH CHECK falha

DROP POLICY IF EXISTS "tribe_posts_insert_member" ON public.tribe_posts;
DROP POLICY IF EXISTS "tribe_posts_update_own" ON public.tribe_posts;
DROP POLICY IF EXISTS "tribe_posts_delete_own" ON public.tribe_posts;

CREATE POLICY "tribe_posts_insert_member"
  ON public.tribe_posts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.tribe_members tm
      WHERE tm.tribe_id = tribe_posts.tribe_id
        AND tm.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "tribe_posts_update_own"
  ON public.tribe_posts
  FOR UPDATE
  TO authenticated
  USING (author_id = (SELECT auth.uid()))
  WITH CHECK (author_id = (SELECT auth.uid()));

CREATE POLICY "tribe_posts_delete_own"
  ON public.tribe_posts
  FOR DELETE
  TO authenticated
  USING (author_id = (SELECT auth.uid()));
