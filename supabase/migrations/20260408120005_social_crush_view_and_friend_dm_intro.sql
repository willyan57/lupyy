-- 1) Uma mensagem de abertura (estilo Instagram) antes de haver follow mútuo como amigos
-- 2) Lista "Interessados": crush silencioso aparece borrado até haver match mútuo (crush ou crush silencioso)

ALTER TABLE public.follows
ADD COLUMN IF NOT EXISTS friend_dm_intro_used boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.follows.friend_dm_intro_used IS
  'Quando interest_type=friend e ainda não há follow de volta como amigo: após a 1ª DM enviada, true bloqueia novas mensagens até o mútuo.';

-- Recria a view usada por PeopleListSheet (mode interested). Inclui silent_crush com identity_hidden.
-- security_invoker=true: evita SECURITY DEFINER (lint Supabase 0010) — RLS do utilizador que consulta.
DROP VIEW IF EXISTS public.view_crush_detailed;

CREATE VIEW public.view_crush_detailed
WITH (security_invoker = true)
AS
WITH base AS (
  SELECT
    f.id AS follow_id,
    f.following_id AS profile_id,
    f.follower_id,
    f.interest_type::text AS interest_type,
    f.created_at,
    EXISTS (
      SELECT 1
      FROM public.follows r
      WHERE r.follower_id = f.following_id
        AND r.following_id = f.follower_id
        AND r.interest_type::text IN ('crush', 'silent_crush', 'super_crush')
    ) AS is_crush_mutual
  FROM public.follows f
  WHERE f.interest_type::text IN ('crush', 'silent_crush', 'super_crush')
)
SELECT
  b.follow_id,
  b.profile_id,
  CASE
    WHEN b.interest_type = 'silent_crush' AND NOT b.is_crush_mutual THEN NULL::uuid
    ELSE b.follower_id
  END AS user_id,
  CASE
    WHEN b.interest_type = 'silent_crush' AND NOT b.is_crush_mutual THEN NULL::text
    ELSE p.username
  END AS username,
  CASE
    WHEN b.interest_type = 'silent_crush' AND NOT b.is_crush_mutual THEN NULL::text
    ELSE p.full_name
  END AS full_name,
  CASE
    WHEN b.interest_type = 'silent_crush' AND NOT b.is_crush_mutual THEN NULL::text
    ELSE p.avatar_url
  END AS avatar_url,
  b.interest_type,
  b.created_at,
  (b.interest_type = 'silent_crush' AND NOT b.is_crush_mutual) AS identity_hidden
FROM base b
LEFT JOIN public.profiles p ON p.id = b.follower_id;

COMMENT ON VIEW public.view_crush_detailed IS
  'Seguidores com interesse crush/silent/super. identity_hidden=true para silent_crush sem match mútuo (UI: borrar).';

GRANT SELECT ON public.view_crush_detailed TO authenticated, anon;

-- Permite ao seguidor marcar friend_dm_intro_used na própria linha (se RLS já estiver ativo em follows)
DO $pol$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'follows'
      AND c.relrowsecurity
  ) THEN
    DROP POLICY IF EXISTS "follows_update_own_follower_row" ON public.follows;
    CREATE POLICY "follows_update_own_follower_row" ON public.follows
      FOR UPDATE TO authenticated
      USING (follower_id = (select auth.uid()))
      WITH CHECK (follower_id = (select auth.uid()));
  END IF;
END
$pol$;
