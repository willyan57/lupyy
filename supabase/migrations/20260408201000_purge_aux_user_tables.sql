-- =============================================================================
-- Correção: profile_view_stats é VIEW (GROUP BY), não tabela — DELETE quebrava
-- a purge (55000). Rode após 20260408180000 se o teste ainda falhava nessa linha.
-- Corpo alinhado a 20260408180000 sem DELETE em profile_view_stats.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.purge_user_account_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv_ids uuid[];
  my_post_ids bigint[];
  owned_tribe_ids uuid[];
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- RLS em tabelas public.* pode impedir DELETE mesmo com SECURITY DEFINER.
  PERFORM set_config('row_security', 'off', true);

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO conv_ids
  FROM public.conversations
  WHERE user1 = p_user_id OR user2 = p_user_id;

  SELECT COALESCE(array_agg(id), ARRAY[]::bigint[])
  INTO my_post_ids
  FROM public.posts
  WHERE user_id = p_user_id;

  -- ── DM / conversas ─────────────────────────────────────
  DELETE FROM public.conversation_typing
  WHERE user_id = p_user_id
     OR conversation_id = ANY (conv_ids);

  DELETE FROM public.messages
  WHERE sender = p_user_id
     OR conversation_id = ANY (conv_ids);

  DELETE FROM public.message_reactions
  WHERE user_id = p_user_id;

  DELETE FROM public.message_deletions
  WHERE user_id = p_user_id;

  DELETE FROM public.conversation_participants
  WHERE user_id = p_user_id;

  DELETE FROM public.conversation_dm_requests
  WHERE sender_id = p_user_id
     OR recipient_id = p_user_id
     OR conversation_id = ANY (conv_ids);

  DELETE FROM public.conversation_deletions
  WHERE user_id = p_user_id
     OR conversation_id = ANY (conv_ids);

  DELETE FROM public.conversations
  WHERE id = ANY (conv_ids);

  -- ── Posts / comentários / curtidas ─────────────────────
  DELETE FROM public.comment_likes
  WHERE user_id = p_user_id
     OR comment_id IN (
       SELECT id FROM public.comments WHERE post_id = ANY (my_post_ids)
     );

  DELETE FROM public.comments
  WHERE user_id = p_user_id
     OR post_id = ANY (my_post_ids);

  DELETE FROM public.likes
  WHERE user_id = p_user_id
     OR post_id = ANY (my_post_ids);

  DELETE FROM public.reposts
  WHERE post_id = ANY (my_post_ids)
     OR user_id = p_user_id;

  DELETE FROM public.post_views
  WHERE user_id = p_user_id
     OR post_id = ANY (my_post_ids);

  DELETE FROM public.post_media
  WHERE post_id = ANY (my_post_ids);

  DELETE FROM public.post_boosts
  WHERE user_id = p_user_id;

  DELETE FROM public.posts
  WHERE user_id = p_user_id;

  -- ── Chains / clips (FK → auth.users) ───────────────────
  DELETE FROM public.chain_continuation_requests
  WHERE requester_id = p_user_id;

  DELETE FROM public.chains
  WHERE owner_id = p_user_id;

  DELETE FROM public.clips
  WHERE author_id = p_user_id;

  -- ── Stories (filhos com user_id antes de apagar stories) ─
  DELETE FROM public.muted_stories
  WHERE user_id = p_user_id
     OR muted_user_id = p_user_id;

  DELETE FROM public.story_sticker_responses
  WHERE user_id = p_user_id;

  DELETE FROM public.story_stickers
  WHERE user_id = p_user_id;

  DELETE FROM public.story_highlight_items
  WHERE highlight_id IN (
    SELECT id FROM public.story_highlights WHERE user_id = p_user_id
  );

  DELETE FROM public.story_highlights
  WHERE user_id = p_user_id;

  DELETE FROM public.story_likes
  WHERE user_id = p_user_id;

  DELETE FROM public.story_shares
  WHERE shared_by = p_user_id
     OR shared_to = p_user_id;

  DELETE FROM public.story_views
  WHERE viewer_id = p_user_id
     OR user_id = p_user_id;

  DELETE FROM public.stories
  WHERE user_id = p_user_id;

  -- ── Highlights (perfil) ────────────────────────────────
  DELETE FROM public.profile_highlight_items
  WHERE highlight_id IN (
    SELECT id FROM public.profile_highlights WHERE user_id = p_user_id
  );

  DELETE FROM public.profile_highlights
  WHERE user_id = p_user_id;

  -- ── Tribos (atividade do usuário) ───────────────────────
  DELETE FROM public.tribe_message_reactions
  WHERE user_id = p_user_id;

  DELETE FROM public.tribe_message_deletions
  WHERE deleted_by = p_user_id;

  DELETE FROM public.tribe_messages
  WHERE user_id = p_user_id;

  DELETE FROM public.tribe_post_comments
  WHERE author_id = p_user_id;

  DELETE FROM public.tribe_post_likes
  WHERE user_id = p_user_id;

  DELETE FROM public.tribe_posts
  WHERE author_id = p_user_id;

  DELETE FROM public.tribe_join_requests
  WHERE user_id = p_user_id
     OR reviewed_by = p_user_id;

  DELETE FROM public.tribe_member_roles
  WHERE user_id = p_user_id;

  DELETE FROM public.tribe_member_xp
  WHERE user_id = p_user_id;

  DELETE FROM public.tribe_members
  WHERE user_id = p_user_id;

  -- Tribos onde é dono: remove mensagens/posts de todos e a tribo
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO owned_tribe_ids
  FROM public.tribes
  WHERE owner_id = p_user_id;

  IF cardinality(owned_tribe_ids) > 0 THEN
    DELETE FROM public.tribe_message_reactions
    WHERE message_id IN (
      SELECT id FROM public.tribe_messages WHERE tribe_id = ANY (owned_tribe_ids)
    );

    DELETE FROM public.tribe_message_deletions
    WHERE message_id IN (
      SELECT id FROM public.tribe_messages WHERE tribe_id = ANY (owned_tribe_ids)
    );

    DELETE FROM public.tribe_messages
    WHERE tribe_id = ANY (owned_tribe_ids);

    DELETE FROM public.tribe_post_comments
    WHERE post_id IN (
      SELECT id FROM public.tribe_posts WHERE tribe_id = ANY (owned_tribe_ids)
    );

    DELETE FROM public.tribe_post_likes
    WHERE post_id IN (
      SELECT id FROM public.tribe_posts WHERE tribe_id = ANY (owned_tribe_ids)
    );

    DELETE FROM public.tribe_posts
    WHERE tribe_id = ANY (owned_tribe_ids);

    DELETE FROM public.tribe_join_requests
    WHERE tribe_id = ANY (owned_tribe_ids);

    DELETE FROM public.tribe_member_roles
    WHERE (tribe_id, user_id) IN (
      SELECT tm.tribe_id, tm.user_id
      FROM public.tribe_members tm
      WHERE tm.tribe_id = ANY (owned_tribe_ids)
    );

    DELETE FROM public.tribe_members
    WHERE tribe_id = ANY (owned_tribe_ids);

    DELETE FROM public.tribe_channels
    WHERE tribe_id = ANY (owned_tribe_ids);

    DELETE FROM public.tribes
    WHERE id = ANY (owned_tribe_ids);
  END IF;

  -- ── Social / prefs ─────────────────────────────────────
  DELETE FROM public.follows
  WHERE follower_id = p_user_id OR following_id = p_user_id;

  DELETE FROM public.close_friends
  WHERE user_id = p_user_id OR friend_id = p_user_id;

  DELETE FROM public.restricted_accounts
  WHERE user_id = p_user_id OR restricted_id = p_user_id;

  DELETE FROM public.hidden_story_users
  WHERE user_id = p_user_id OR hidden_user_id = p_user_id;

  DELETE FROM public.saved_posts
  WHERE user_id = p_user_id;

  DELETE FROM public.saved_collections
  WHERE user_id = p_user_id;

  DELETE FROM public.notifications
  WHERE recipient_id = p_user_id OR actor_id = p_user_id;

  DELETE FROM public.status_change_notifications
  WHERE changed_user_id = p_user_id
     OR notified_user_id = p_user_id;

  DELETE FROM public.user_badges
  WHERE user_id = p_user_id;

  DELETE FROM public.user_levels
  WHERE user_id = p_user_id;

  DELETE FROM public.push_tokens
  WHERE user_id = p_user_id;

  DELETE FROM public.user_presence
  WHERE user_id = p_user_id;

  DELETE FROM public.user_settings
  WHERE user_id = p_user_id;

  DELETE FROM public.search_history
  WHERE user_id = p_user_id;

  DELETE FROM public.data_export_requests
  WHERE user_id = p_user_id;

  DELETE FROM public.user_feedback
  WHERE user_id = p_user_id;

  DELETE FROM public.user_interests
  WHERE user_id = p_user_id;

  DELETE FROM public.user_blocks
  WHERE blocker_id = p_user_id OR blocked_id = p_user_id;

  DELETE FROM public.user_reports
  WHERE reporter_id = p_user_id;

  UPDATE public.user_reports
  SET reported_user_id = NULL
  WHERE reported_user_id = p_user_id;

  UPDATE public.user_reports
  SET reviewed_by = NULL
  WHERE reviewed_by = p_user_id;

  -- profile_social_stats / profile_view_stats são VIEWs agregadas; não admitem DELETE.

  DELETE FROM public.profile_views
  WHERE profile_id = p_user_id
     OR viewer_id = p_user_id;

  DELETE FROM public.profile_boosts
  WHERE user_id = p_user_id;

  DELETE FROM public.active_boosted_profiles
  WHERE user_id = p_user_id;

  DELETE FROM public.active_boosted_posts
  WHERE post_id = ANY (my_post_ids);

  -- Outros usuários não podem continuar apontando partner_id para este id
  UPDATE public.profiles
  SET partner_id = NULL
  WHERE partner_id = p_user_id;

  DELETE FROM public.profiles
  WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.purge_user_account_data(uuid) IS
  'Remove dados públicos do usuário antes de apagar auth.users (trigger). Não chamar do cliente.';
