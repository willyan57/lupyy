import { supabase } from "@/lib/supabase";
import { useEffect, useRef, useState } from "react";

type TypingUser = {
  user_id: string;
};

type UseTypingIndicatorOptions = {
  conversationId: string | null;
  currentUserId: string | null;
  typingDebounceMs?: number;
  typingTimeoutMs?: number;
};

type TimeoutType = ReturnType<typeof setTimeout>;

export function useTypingIndicator({
  conversationId,
  currentUserId,
  typingDebounceMs = 300,
  typingTimeoutMs = 4000,
}: UseTypingIndicatorOptions) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimerRef = useRef<TimeoutType | null>(null);
  const debounceRef = useRef<TimeoutType | null>(null);

  // 🔔 Listener em tempo real na tabela conversation_typing
  useEffect(() => {
    if (!conversationId || !currentUserId) return;

    const channel = supabase
      .channel(`typing-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_typing",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async () => {
          const { data } = await supabase
            .from("conversation_typing")
            .select("user_id")
            .eq("conversation_id", conversationId);

          if (data) {
            const list = data as TypingUser[];
            setTypingUsers(
              list.filter((row: TypingUser) => row.user_id !== currentUserId)
            );
          }
        }
      )
      .subscribe();

    // carregar estado atual na montagem
    (async () => {
      const { data } = await supabase
        .from("conversation_typing")
        .select("user_id")
        .eq("conversation_id", conversationId);

      if (data) {
        const list = data as TypingUser[];
        setTypingUsers(
          list.filter((row: TypingUser) => row.user_id !== currentUserId)
        );
      }
    })();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId]);

  // 🧠 Função que você chama quando o usuário digita
  const reportTyping = (isTyping: boolean) => {
    if (!conversationId || !currentUserId) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (isTyping) {
        await supabase.from("conversation_typing").upsert({
          conversation_id: conversationId,
          user_id: currentUserId,
        });
      } else {
        await supabase
          .from("conversation_typing")
          .delete()
          .eq("conversation_id", conversationId)
          .eq("user_id", currentUserId);
      }
    }, typingDebounceMs);

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (isTyping) {
      typingTimerRef.current = setTimeout(async () => {
        await supabase
          .from("conversation_typing")
          .delete()
          .eq("conversation_id", conversationId)
          .eq("user_id", currentUserId);
      }, typingTimeoutMs);
    }
  };

  // limpar timers quando desmontar
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const isSomeoneTyping = typingUsers.length > 0;

  return {
    typingUsers,
    isSomeoneTyping,
    reportTyping,
  };
}
