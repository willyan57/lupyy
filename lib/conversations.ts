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

function normalizePair(a: string, b: string) {
  return a < b ? { user1: a, user2: b } : { user1: b, user2: a };
}

function pickConversationByType(
  conversations: Conversation[],
  conversationType: ConversationType,
) {
  return conversations.find((conversation) => conversation.conversation_type === conversationType) ?? null;
}

function pickBestConversation(
  conversations: Conversation[],
  conversationType: ConversationType,
) {
  return pickConversationByType(conversations, conversationType) ?? conversations[0] ?? null;
}

export async function reactivateConversationForUser(conversationId: string, userId: string) {
  const { error: rpcError } = await supabase.rpc("reactivate_conversation", {
    _conversation_id: conversationId,
    _user_id: userId,
  });

  if (!rpcError) return;

  const { error: fallbackError } = await supabase
    .from("conversation_deletions")
    .update({ deleted_at: null })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);

  if (fallbackError) throw fallbackError;
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

  const existing = pickBestConversation((existingRows || []) as Conversation[], conversationType);
  if (existing) return existing;

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

    const retryConversation = pickBestConversation((retryRows || []) as Conversation[], conversationType);
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
