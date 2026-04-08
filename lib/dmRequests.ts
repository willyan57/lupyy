import { supabase } from "@/lib/supabase";

/**
 * Cria pedido de mensagem quando alguém usa a 1ª DM (amigo sem mútuo).
 * Destinatário vê em "Pedidos" até aceitar ou recusar.
 */
export async function createDmRequestAfterIntro(params: {
  conversationId: string;
  senderId: string;
  recipientId: string;
}) {
  const { conversationId, senderId, recipientId } = params;
  if (!conversationId || !senderId || !recipientId || senderId === recipientId) return;

  const { error } = await supabase.from("conversation_dm_requests").insert({
    conversation_id: conversationId,
    sender_id: senderId,
    recipient_id: recipientId,
    status: "pending",
  });

  if (error && (error as { code?: string }).code !== "23505") {
    console.warn("createDmRequestAfterIntro:", error);
  }
}

export async function acceptMessageRequest(conversationId: string) {
  const { data, error } = await supabase.rpc("accept_message_request", {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
  return data;
}

export async function declineMessageRequest(conversationId: string) {
  const { data, error } = await supabase.rpc("decline_message_request", {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
  return data;
}

export type DmRequestRow = {
  status: "pending" | "accepted" | "declined";
  sender_id: string;
  recipient_id: string;
};

export async function fetchDmRequestForConversation(
  conversationId: string
): Promise<DmRequestRow | null> {
  const { data, error } = await supabase
    .from("conversation_dm_requests")
    .select("status, sender_id, recipient_id")
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (error || !data) return null;
  return data as DmRequestRow;
}
