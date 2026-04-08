-- "digitando..." usa a tabela conversation_typing — sem políticas RLS o PostgREST retorna 403
-- a cada upsert (debounce), parecendo erro a cada letra.
--
-- Se o upsert no app falhar por falta de UNIQUE em (conversation_id, user_id), crie no Dashboard:
--   ALTER TABLE public.conversation_typing
--   ADD CONSTRAINT conversation_typing_conversation_user_unique UNIQUE (conversation_id, user_id);

ALTER TABLE public.conversation_typing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversation_typing_select_participants" ON public.conversation_typing;
DROP POLICY IF EXISTS "conversation_typing_insert_participant" ON public.conversation_typing;
DROP POLICY IF EXISTS "conversation_typing_update_own" ON public.conversation_typing;
DROP POLICY IF EXISTS "conversation_typing_delete_own" ON public.conversation_typing;

CREATE POLICY "conversation_typing_select_participants"
  ON public.conversation_typing FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_typing.conversation_id
        AND (c.user1 = (select auth.uid()) OR c.user2 = (select auth.uid()))
    )
  );

CREATE POLICY "conversation_typing_insert_participant"
  ON public.conversation_typing FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_typing.conversation_id
        AND (c.user1 = (select auth.uid()) OR c.user2 = (select auth.uid()))
    )
  );

CREATE POLICY "conversation_typing_update_own"
  ON public.conversation_typing FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "conversation_typing_delete_own"
  ON public.conversation_typing FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));
