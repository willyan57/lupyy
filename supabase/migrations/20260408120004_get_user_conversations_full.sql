-- Lista de conversas: só some da inbox quando conversation_deletions.hidden_from_inbox = true
-- (após "excluir conversa"). Se hidden_from_inbox = false ou não há linha, a conversa aparece.
--
-- Rode no SQL Editor. Se der erro de assinatura diferente, faça:
--   DROP FUNCTION IF EXISTS public.get_user_conversations_full();
-- e rode de novo (ou ajuste o RETURNS para bater com o antigo).

CREATE OR REPLACE FUNCTION public.get_user_conversations_full()
RETURNS TABLE (
  id uuid,
  conversation_type text,
  last_message text,
  last_message_at timestamptz,
  created_at timestamptz,
  other_user_id uuid,
  other_user_username text,
  other_user_full_name text,
  other_user_avatar text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.conversation_type::text,
    c.last_message,
    c.last_message_at,
    c.created_at,
    CASE
      WHEN c.user1 = (select auth.uid()) THEN c.user2
      ELSE c.user1
    END AS other_user_id,
    p.username AS other_user_username,
    p.full_name AS other_user_full_name,
    p.avatar_url AS other_user_avatar
  FROM public.conversations c
  INNER JOIN public.profiles p
    ON p.id = CASE
      WHEN c.user1 = (select auth.uid()) THEN c.user2
      ELSE c.user1
    END
  WHERE (c.user1 = (select auth.uid()) OR c.user2 = (select auth.uid()))
    AND NOT EXISTS (
      SELECT 1
      FROM public.conversation_deletions cd
      WHERE cd.conversation_id = c.id
        AND cd.user_id = (select auth.uid())
        AND COALESCE(cd.hidden_from_inbox, true) = true
    )
  ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_user_conversations_full() IS
  'Inbox: oculta só quando hidden_from_inbox (soft-delete da lista). false = conversa visível com histórico cortado por messages_hidden_before no app.';

GRANT EXECUTE ON FUNCTION public.get_user_conversations_full() TO authenticated;
