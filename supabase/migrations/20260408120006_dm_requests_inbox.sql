-- Inbox de pedidos de mensagem (estilo Instagram): 1ª DM sem mútuo gera pedido para o destinatário.

CREATE TABLE IF NOT EXISTS public.conversation_dm_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_dm_requests_unique_recipient UNIQUE (conversation_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS conversation_dm_requests_recipient_pending
  ON public.conversation_dm_requests (recipient_id)
  WHERE status = 'pending';

COMMENT ON TABLE public.conversation_dm_requests IS
  'Pedido de DM: após intro (friend sem mútuo), destinatário vê em Pedidos até aceitar/recusar.';

ALTER TABLE public.conversation_dm_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversation_dm_requests_select_parties" ON public.conversation_dm_requests;
DROP POLICY IF EXISTS "conversation_dm_requests_insert_sender" ON public.conversation_dm_requests;
DROP POLICY IF EXISTS "conversation_dm_requests_update_recipient" ON public.conversation_dm_requests;

CREATE POLICY "conversation_dm_requests_select_parties"
  ON public.conversation_dm_requests FOR SELECT TO authenticated
  USING (sender_id = (select auth.uid()) OR recipient_id = (select auth.uid()));

CREATE POLICY "conversation_dm_requests_insert_sender"
  ON public.conversation_dm_requests FOR INSERT TO authenticated
  WITH CHECK (sender_id = (select auth.uid()));

CREATE POLICY "conversation_dm_requests_update_recipient"
  ON public.conversation_dm_requests FOR UPDATE TO authenticated
  USING (recipient_id = (select auth.uid()))
  WITH CHECK (recipient_id = (select auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.conversation_dm_requests TO authenticated;

-- Aceitar: marca aceito + segue de volta como amigo (mútuo para DMs)
CREATE OR REPLACE FUNCTION public.accept_message_request(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  sid uuid;
BEGIN
  UPDATE public.conversation_dm_requests
  SET status = 'accepted', updated_at = now()
  WHERE conversation_id = p_conversation_id
    AND recipient_id = uid
    AND status = 'pending'
  RETURNING sender_id INTO sid;

  IF sid IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.follows (follower_id, following_id, interest_type)
  VALUES (uid, sid, 'friend')
  ON CONFLICT (follower_id, following_id)
  DO UPDATE SET interest_type = EXCLUDED.interest_type;
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_message_request(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversation_dm_requests
  SET status = 'declined', updated_at = now()
  WHERE conversation_id = p_conversation_id
    AND recipient_id = (select auth.uid())
    AND status = 'pending';
END;
$$;

COMMENT ON FUNCTION public.accept_message_request(uuid) IS
  'Destinatário aceita o pedido; opcionalmente cria follow mútuo como amigo.';

GRANT EXECUTE ON FUNCTION public.accept_message_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_message_request(uuid) TO authenticated;

-- Inbox principal: esconde para o destinatário pedidos pendentes (vão só em get_user_message_requests)
-- e conversas recusadas pelo destinatário.
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
    AND NOT EXISTS (
      SELECT 1
      FROM public.conversation_dm_requests r
      WHERE r.conversation_id = c.id
        AND r.recipient_id = (select auth.uid())
        AND r.status IN ('pending', 'declined')
    )
  ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC;
$$;

-- Pedidos pendentes só para o destinatário
CREATE OR REPLACE FUNCTION public.get_user_message_requests()
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
    AND EXISTS (
      SELECT 1
      FROM public.conversation_dm_requests r
      WHERE r.conversation_id = c.id
        AND r.recipient_id = (select auth.uid())
        AND r.status = 'pending'
    )
  ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_user_message_requests() IS
  'Lista conversas com pedido de DM pendente (destinatário).';

GRANT EXECUTE ON FUNCTION public.get_user_conversations_full() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_message_requests() TO authenticated;
