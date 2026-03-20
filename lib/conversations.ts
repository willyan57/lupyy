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

export async function getOrCreateConversation(params: {
  currentUserId: string;
  otherUserId: string;
  conversationType: ConversationType;
}) {
  const { currentUserId, otherUserId, conversationType } = params;
  const pair = normalizePair(currentUserId, otherUserId);

  console.log("[getOrCreateConversation] pair:", pair, "type:", conversationType);

  // 1) Buscar conversa existente do MESMO tipo entre os dois users
  const { data: existing, error: selectError } = await supabase
    .from("conversations")
    .select("*")
    .eq("user1", pair.user1)
    .eq("user2", pair.user2)
    .eq("conversation_type", conversationType)
    .maybeSingle();

  if (selectError && selectError.code !== "PGRST116") {
    console.error("[getOrCreateConversation] select error:", selectError);
    throw selectError;
  }

  if (existing) {
    console.log("[getOrCreateConversation] found existing:", existing.id);
    return existing as Conversation;
  }

  // 2) Não existe → também buscar SEM filtro de tipo (pode existir conversa
  //    com tipo diferente que precisa ser atualizada, ex: friend → crush)
  const { data: anyExisting } = await supabase
    .from("conversations")
    .select("*")
    .eq("user1", pair.user1)
    .eq("user2", pair.user2)
    .maybeSingle();

  // Se existe uma conversa com tipo diferente, atualizar o tipo
  if (anyExisting && anyExisting.conversation_type !== conversationType) {
    console.log("[getOrCreateConversation] updating type from", anyExisting.conversation_type, "to", conversationType);
    const { data: updated, error: updateError } = await supabase
      .from("conversations")
      .update({ conversation_type: conversationType })
      .eq("id", anyExisting.id)
      .select("*")
      .single();

    if (updateError) {
      console.error("[getOrCreateConversation] update error:", updateError);
      // Se falhar a atualização (RLS), retornar a conversa existente mesmo assim
      console.log("[getOrCreateConversation] falling back to existing conversation");
      return anyExisting as Conversation;
    }
    return updated as Conversation;
  }

  // 3) Nenhuma conversa existe → criar nova
  console.log("[getOrCreateConversation] creating new conversation");
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
    console.error("[getOrCreateConversation] insert error:", insertError);
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
