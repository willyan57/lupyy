-- Remove políticas RLS duplicadas em conversation_deletions / conversations
-- (Supabase linter: multiple_permissive_policies após migration 20260408120001).
-- Mantém as políticas conversation_deletions_*_own e conversations_update_as_participant.

DROP POLICY IF EXISTS "Users can view own conversation deletions" ON public.conversation_deletions;
DROP POLICY IF EXISTS "Users can create own conversation deletions" ON public.conversation_deletions;
DROP POLICY IF EXISTS "Users can update own conversation deletions" ON public.conversation_deletions;
DROP POLICY IF EXISTS "Users can delete own conversation deletions" ON public.conversation_deletions;

DROP POLICY IF EXISTS "Users can update own conversations" ON public.conversations;
