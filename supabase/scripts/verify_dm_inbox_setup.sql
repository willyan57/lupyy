-- =============================================================================
-- Verificação: pedidos de DM (conversation_dm_requests) + intro em follows
-- Rode no Supabase → SQL Editor (role: postgres ou service_role para ver tudo).
-- =============================================================================

-- 1) Tabela conversation_dm_requests existe e colunas esperadas
SELECT
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name = 'conversation_dm_requests'
ORDER BY c.ordinal_position;

-- Esperado: conversation_id, sender_id, recipient_id, status, created_at, updated_at, id

-- 2) Constraint UNIQUE (conversation_id, recipient_id)
SELECT tc.constraint_name, tc.constraint_type, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'conversation_dm_requests'
ORDER BY tc.constraint_type, kcu.ordinal_position;

-- 3) RLS ativo e políticas
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'conversation_dm_requests';

SELECT pol.polname AS policy_name, pol.polcmd AS cmd, pol.polpermissive AS permissive
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'conversation_dm_requests'
ORDER BY pol.polname;

-- Esperado: conversation_dm_requests_select_parties, _insert_sender, _update_recipient

-- 4) Funções RPC usadas pelo app
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  CASE p.prosecdef WHEN true THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_user_message_requests',
    'get_user_conversations_full',
    'accept_message_request',
    'decline_message_request'
  )
ORDER BY p.proname;

-- Esperado: 4 linhas; get_user_* com SECURITY INVOKER (prosecdef = false)

-- 5) GRANT EXECUTE nas funções (authenticated)
SELECT
  routine_name,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_user_message_requests',
    'get_user_conversations_full',
    'accept_message_request',
    'decline_message_request'
  )
  AND grantee IN ('authenticated', 'PUBLIC', 'postgres', 'service_role')
GROUP BY routine_name
ORDER BY routine_name;

-- 6) Coluna friend_dm_intro_used em follows
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'follows'
  AND column_name = 'friend_dm_intro_used';

-- Esperado: boolean, default false, NOT NULL

-- 7) Política UPDATE em follows (seguidor atualiza própria linha) — se RLS estiver ativo
SELECT pol.polname
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'follows'
  AND pol.polname = 'follows_update_own_follower_row';

-- (Pode retornar 0 linhas se RLS em follows não estiver habilitado — aí o DO da migration não criou a policy)

-- =============================================================================
-- 8) Dados recentes (diagnóstico — ajuste LIMIT ou filtre por user)
-- =============================================================================
SELECT
  r.id,
  r.conversation_id,
  r.sender_id,
  r.recipient_id,
  r.status,
  r.created_at,
  c.last_message,
  c.last_message_at
FROM public.conversation_dm_requests r
LEFT JOIN public.conversations c ON c.id = r.conversation_id
ORDER BY r.created_at DESC
LIMIT 25;

-- =============================================================================
-- 9) Consistência: pedido pending sem conversa (não deveria existir)
-- =============================================================================
SELECT r.id, r.conversation_id
FROM public.conversation_dm_requests r
LEFT JOIN public.conversations c ON c.id = r.conversation_id
WHERE c.id IS NULL;

-- Esperado: 0 linhas

-- =============================================================================
-- 10) Duplicata por (conversation_id, recipient_id) — não deveria existir
-- =============================================================================
SELECT conversation_id, recipient_id, COUNT(*) AS cnt
FROM public.conversation_dm_requests
GROUP BY conversation_id, recipient_id
HAVING COUNT(*) > 1;

-- Esperado: 0 linhas
