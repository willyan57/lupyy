-- RLS em tribe_posts: permitir membros a publicar no mural e leitura conforme visibilidade da tribo
-- Erro típico: 42501 — new row violates row-level security policy for table "tribe_posts"
-- auth.uid() em (select ...) — alinha com lints de performance do Supabase

ALTER TABLE public.tribe_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tribe_posts_select_visible" ON public.tribe_posts;
DROP POLICY IF EXISTS "tribe_posts_insert_member" ON public.tribe_posts;
DROP POLICY IF EXISTS "tribe_posts_update_own" ON public.tribe_posts;
DROP POLICY IF EXISTS "tribe_posts_delete_own" ON public.tribe_posts;

-- Ler: tribo pública OU utilizador é membro da tribo
CREATE POLICY "tribe_posts_select_visible"
  ON public.tribe_posts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tribes tr
      WHERE tr.id = tribe_posts.tribe_id
        AND (
          tr.is_public = true
          OR EXISTS (
            SELECT 1
            FROM public.tribe_members tm
            WHERE tm.tribe_id = tr.id
              AND tm.user_id = (SELECT auth.uid())
          )
        )
    )
  );

-- Inserir: só como o próprio utilizador e tem de ser membro da tribo do post
CREATE POLICY "tribe_posts_insert_member"
  ON public.tribe_posts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.tribe_members tm
      WHERE tm.tribe_id = tribe_posts.tribe_id
        AND tm.user_id = (SELECT auth.uid())
    )
  );

-- Atualizar / apagar: só o autor (moderadores podem ser acrescentados depois com política extra)
CREATE POLICY "tribe_posts_update_own"
  ON public.tribe_posts
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "tribe_posts_delete_own"
  ON public.tribe_posts
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));
