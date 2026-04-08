-- Corrige 403 Forbidden no cliente ao fazer POST/PATCH em conversation_deletions e conversations.
-- Rode no SQL Editor do Supabase depois da migration hidden_from_inbox.
--
-- Se já existirem políticas com os mesmos nomes, o DROP abaixo evita duplicata.

-- ── conversation_deletions: cada usuário só acessa as próprias linhas ─────────
ALTER TABLE public.conversation_deletions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversation_deletions_select_own" ON public.conversation_deletions;
DROP POLICY IF EXISTS "conversation_deletions_insert_own" ON public.conversation_deletions;
DROP POLICY IF EXISTS "conversation_deletions_update_own" ON public.conversation_deletions;
DROP POLICY IF EXISTS "conversation_deletions_delete_own" ON public.conversation_deletions;
DROP POLICY IF EXISTS "conversation_deletions_all_own" ON public.conversation_deletions;

CREATE POLICY "conversation_deletions_select_own"
  ON public.conversation_deletions FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "conversation_deletions_insert_own"
  ON public.conversation_deletions FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "conversation_deletions_update_own"
  ON public.conversation_deletions FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "conversation_deletions_delete_own"
  ON public.conversation_deletions FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- ── conversations: participantes atualizam last_message (só se RLS já estiver ativo)
-- Não habilitamos RLS aqui para não bloquear SELECT sem políticas extras.

DO $rls_conv$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'conversations'
      AND c.relrowsecurity
  ) THEN
    DROP POLICY IF EXISTS "conversations_update_as_participant" ON public.conversations;
    CREATE POLICY "conversations_update_as_participant"
      ON public.conversations FOR UPDATE TO authenticated
      USING (user1 = (select auth.uid()) OR user2 = (select auth.uid()))
      WITH CHECK (user1 = (select auth.uid()) OR user2 = (select auth.uid()));
  END IF;
END
$rls_conv$;
