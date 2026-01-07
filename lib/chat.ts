import { supabase } from "@/lib/supabase";

export type Conversation = {
  id: string;
  is_group: boolean;
  special_type: "regular" | "mutual_interest" | null;
  created_by: string;
  created_at: string;
};

export type Message = {
  id: number;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  media_url: string | null;
  media_type: "image" | "video" | "audio" | "file" | null;
  created_at: string;
};

export async function getOrCreateDirectConversation(targetUserId: string) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) throw new Error("Usuário não autenticado");
  if (!targetUserId || targetUserId === user.id) {
    throw new Error("targetUserId inválido");
  }

  const { data, error } = await supabase.rpc("get_or_create_direct_conversation", {
    target_user: targetUserId,
  });

  if (error) throw error;
  if (!data) throw new Error("Não foi possível obter a conversa");

  return data as string;
}

export async function fetchConversations() {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as Conversation[];
}

export async function fetchMessages(conversationId: string) {
  if (!conversationId) throw new Error("conversationId obrigatório");

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []) as Message[];
}

export async function sendMessage(conversationId: string, content: string) {
  if (!conversationId) throw new Error("conversationId obrigatório");
  if (!content || !content.trim()) return null;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) throw new Error("Usuário não autenticado");

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: content.trim(),
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as Message;
}
