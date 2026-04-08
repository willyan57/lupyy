import { supabase } from "@/lib/supabase";
import { useCallback, useEffect, useRef, useState } from "react";

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

/** Evita tempestade de 403 no console quando RLS/policy ainda não está ok no Supabase */
function silenceTypingDb<T>(p: PromiseLike<{ error?: T | null }>) {
  void Promise.resolve(p).catch(() => {});
}

export function useTypingIndicator({
  conversationId,
  currentUserId,
  typingDebounceMs = 900,
  typingTimeoutMs = 4000,
}: UseTypingIndicatorOptions) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimerRef = useRef<TimeoutType | null>(null);
  const debounceRef = useRef<TimeoutType | null>(null);
  const conversationIdRef = useRef(conversationId);
  const currentUserIdRef = useRef(currentUserId);

  // Manter refs atualizados para uso no cleanup
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);
  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

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
          const { data, error } = await supabase
            .from("conversation_typing")
            .select("user_id")
            .eq("conversation_id", conversationId);
          if (error) return;

          if (data) {
            setTypingUsers(
              (data as TypingUser[]).filter(
                (row) => row.user_id !== currentUserId
              )
            );
          }
        }
      )
      .subscribe();

    // carregar estado atual na montagem
    (async () => {
      const { data, error } = await supabase
        .from("conversation_typing")
        .select("user_id")
        .eq("conversation_id", conversationId);
      if (error) return;

      if (data) {
        setTypingUsers(
          (data as TypingUser[]).filter(
            (row) => row.user_id !== currentUserId
          )
        );
      }
    })();

    // ✅ CORREÇÃO: ao desmontar, SEMPRE limpar o registro de typing do banco
    return () => {
      supabase.removeChannel(channel);

      // Limpar timers
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);

      // Deletar registro do banco para o outro usuário não ficar vendo "digitando..."
      silenceTypingDb(
        supabase
          .from("conversation_typing")
          .delete()
          .eq("conversation_id", conversationId)
          .eq("user_id", currentUserId)
      );
    };
  }, [conversationId, currentUserId]);

  // 🧠 Função que você chama quando o usuário digita
  const reportTyping = useCallback(
    (isTyping: boolean) => {
      const cId = conversationIdRef.current;
      const uId = currentUserIdRef.current;
      if (!cId || !uId) return;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (isTyping) {
          silenceTypingDb(
            supabase.from("conversation_typing").upsert(
              {
                conversation_id: cId,
                user_id: uId,
              },
              { onConflict: "conversation_id,user_id" }
            )
          );
        } else {
          silenceTypingDb(
            supabase
              .from("conversation_typing")
              .delete()
              .eq("conversation_id", cId)
              .eq("user_id", uId)
          );
        }
      }, typingDebounceMs);

      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (isTyping) {
        typingTimerRef.current = setTimeout(() => {
          silenceTypingDb(
            supabase
              .from("conversation_typing")
              .delete()
              .eq("conversation_id", cId)
              .eq("user_id", uId)
          );
        }, typingTimeoutMs);
      }
    },
    [typingDebounceMs, typingTimeoutMs]
  );

  const isSomeoneTyping = typingUsers.length > 0;

  return {
    typingUsers,
    isSomeoneTyping,
    reportTyping,
  };
}
