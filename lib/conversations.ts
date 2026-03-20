import { supabase } from "@/lib/supabase";

export type ConversationType = "friend" | "crush";

export type Conversation = {
  id: string;
  user1: string;
  user2: string;
  conversation_type: ConversationType;
  last_message: string | null;
  last_message_at: string | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender: string;
  content: string;
  media_url: string | null;
  created_at: string;
};

type ConversationDeletionMarker = {
  conversation_id: string;
};

function normalizePair(a: string, b: string) {
  return a < b ? { user1: a, user2: b } : { user1: b, user2: a };
}

function pickConversationByType(
  conversations: Conversation[],
  conversationType: ConversationType,
) {
  return conversations.find((conversation) => conversation.conversation_type === conversationType) ?? null;
}

function pickVisibleConversation(
  conversations: Conversation[],
  deletedConversationIds: Set<string>,
  conversationType: ConversationType,
) {
  const visibleConversations = conversations.filter(
    (conversation) => !deletedConversationIds.has(conversation.id),
  );

  return pickConversationByType(visibleConversations, conversationType) ?? visibleConversations[0] ?? null;
}

function pickConversationForResume(
  conversations: Conversation[],
  deletedConversationIds: Set<string>,
  conversationType: ConversationType,
) {
  const deletedConversations = conversations.filter((conversation) =>
    deletedConversationIds.has(conversation.id),
  );
  const visibleConversations = conversations.filter(
    (conversation) => !deletedConversationIds.has(conversation.id),
  );

  return (
    pickConversationByType(visibleConversations, conversationType) ??
    pickConversationByType(deletedConversations, conversationType) ??
    visibleConversations[0] ??
    deletedConversations[0] ??
    null
  );
}

export async function reactivateConversationForUser(conversationId: string, userId: string) {
  const { error: rpcError } = await supabase.rpc("reactivate_conversation", {
    _conversation_id: conversationId,
    _user_id: userId,
  });

  if (!rpcError) return true;

  const { error: fallbackError } = await supabase
    .from("conversation_deletions")
    .update({ deleted_at: null })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);

  if (!fallbackError) return true;

  console.warn("reactivateConversationForUser failed", {
    conversationId,
    userId,
    rpcError,
    fallbackError,
  });

  return false;
}

export async function getOrCreateConversation(params: {
  currentUserId: string;
  otherUserId: string;
  conversationType: ConversationType;
}) {
  const { currentUserId, otherUserId, conversationType } = params;
  const pair = normalizePair(currentUserId, otherUserId);

  const { data: existingRows, error: selectError } = await supabase
    .from("conversations")
    .select("*")
    .eq("user1", pair.user1)
    .eq("user2", pair.user2)
    .order("created_at", { ascending: false });

  if (selectError) throw selectError;

  const existingConversations = (existingRows || []) as Conversation[];

  const deletedConversationIds = new Set<string>();

  if (existingConversations.length > 0) {
    const { data: deletedRows, error: deletedRowsError } = await supabase
      .from("conversation_deletions")
      .select("conversation_id")
      .eq("user_id", currentUserId)
      .in(
        "conversation_id",
        existingConversations.map((conversation) => conversation.id),
      )
      .not("deleted_at", "is", null);

    if (deletedRowsError) {
      console.warn("Could not load conversation deletions", deletedRowsError);
    }

    ((deletedRows || []) as ConversationDeletionMarker[]).forEach((row) => {
      deletedConversationIds.add(row.conversation_id);
    });
  }

  const existingVisibleConversation = pickVisibleConversation(
    existingConversations,
    deletedConversationIds,
    conversationType,
  );
  if (existingVisibleConversation) return existingVisibleConversation;

  const { data: inserted, error: insertError } = await supabase
    .from("conversations")
    .insert({
      user1: pair.user1,
      user2: pair.user2,
      conversation_type: conversationType,
    })
    .select("*")
    .single();

  if (insertError) {
    const isUniqueConflict =
      insertError.code === "23505" ||
      /duplicate key|unique/i.test(insertError.message || "");

    if (!isUniqueConflict) throw insertError;

    const { data: retryRows, error: retryError } = await supabase
      .from("conversations")
      .select("*")
      .eq("user1", pair.user1)
      .eq("user2", pair.user2)
      .order("created_at", { ascending: false });

    if (retryError) throw retryError;

    const retryConversations = (retryRows || []) as Conversation[];

    const retryDeletedConversationIds = new Set<string>();

    if (retryConversations.length > 0) {
      const { data: retryDeletedRows, error: retryDeletedRowsError } = await supabase
        .from("conversation_deletions")
        .select("conversation_id")
        .eq("user_id", currentUserId)
        .in(
          "conversation_id",
          retryConversations.map((conversation) => conversation.id),
        )
        .not("deleted_at", "is", null);

      if (retryDeletedRowsError) {
        console.warn("Could not load retry conversation deletions", retryDeletedRowsError);
      }

      ((retryDeletedRows || []) as ConversationDeletionMarker[]).forEach((row) => {
        retryDeletedConversationIds.add(row.conversation_id);
      });
    }

    const retryVisibleConversation = pickVisibleConversation(
      retryConversations,
      retryDeletedConversationIds,
      conversationType,
    );
    if (retryVisibleConversation) return retryVisibleConversation;

    const retryConversation = pickConversationForResume(
      retryConversations,
      retryDeletedConversationIds,
      conversationType,
    );
    if (retryConversation) return retryConversation;

    throw insertError;
  }

  return inserted as Conversation;
}

export async function fetchConversationsByType(params: {
  currentUserId: string;
  conversationType: ConversationType;
}) {
  const { currentUserId, conversationType } = params;

  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("conversation_type", conversationType)
    .or(`user1.eq.${currentUserId},user2.eq.${currentUserId}`)
    .order("last_message_at", { ascending: false });

  if (error) throw error;
  return (data || []) as Conversation[];
}

export async function sendMessage(params: {
  conversationId: string;
  senderId: string;
  content: string;
  mediaUrl?: string | null;
}) {
  const { conversationId, senderId, content, mediaUrl } = params;

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender: senderId,
      content,
      media_url: mediaUrl || null,
    })
    .select("*")
    .single();

  if (error) throw error;

  const { error: updateError } = await supabase
    .from("conversations")
    .update({
      last_message: content,
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  if (updateError) throw updateError;

  return data as Message;
}

export async function fetchMessages(conversationId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []) as Message[];
}
