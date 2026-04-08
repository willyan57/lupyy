import { DeviceEventEmitter } from "react-native";

/** Mescla/atualiza uma linha na lista de Mensagens (fallback se a RPC estiver desatualizada). */
export const MERGE_CONVERSATION_INTO_LIST = "lupyy_merge_conversation_into_list";

export type MergeConversationListPayload = {
  id: string;
  conversation_type: string | null;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string | null;
  other_user_id: string | null;
  other_user_username: string | null;
  other_user_full_name: string | null;
  other_user_avatar: string | null;
};

export function emitMergeConversationIntoList(payload: MergeConversationListPayload) {
  DeviceEventEmitter.emit(MERGE_CONVERSATION_INTO_LIST, payload);
}
