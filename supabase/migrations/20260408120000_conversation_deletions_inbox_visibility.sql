-- Instagram-style: "apagar conversa" esconde da lista; reabrir mostra de novo o thread
-- sem trazer mensagens antigas (usa messages_hidden_before), sem violar NOT NULL em deleted_at.
--
-- Rode no Supabase SQL Editor antes de usar o app com hidden_from_inbox.

ALTER TABLE public.conversation_deletions
ADD COLUMN IF NOT EXISTS hidden_from_inbox boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.conversation_deletions.hidden_from_inbox IS
  'true = conversa oculta da lista do usuário; false = aparece na lista (mensagens anteriores a messages_hidden_before continuam ocultas).';

-- Linhas antigas: eram exclusões da lista
UPDATE public.conversation_deletions
SET hidden_from_inbox = true
WHERE hidden_from_inbox IS DISTINCT FROM true;

-- ── Ajuste obrigatório na RPC get_user_conversations_full ─────────────────────
-- Hoje ela provavelmente esconde a conversa se existir QUALQUER linha em
-- conversation_deletions. Depois desta migration, precisa passar a incluir
-- conversas onde hidden_from_inbox = false (thread reaberto, lista visível).
--
-- Exemplo de condição no WHERE / JOIN (adapte ao SQL real da sua função):
--
--   LEFT JOIN conversation_deletions cd
--     ON cd.conversation_id = c.id AND cd.user_id = auth.uid()
--   WHERE (cd.id IS NULL OR cd.hidden_from_inbox = false)
--
-- Ou, se usa NOT EXISTS:
--   AND NOT EXISTS (
--     SELECT 1 FROM conversation_deletions cd2
--     WHERE cd2.conversation_id = c.id AND cd2.user_id = auth.uid()
--       AND cd2.hidden_from_inbox = true
--   )
