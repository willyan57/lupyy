import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

export type UserPresence = {
  user_id: string;
  last_seen_at: string;
};

function formatPresenceLabel(lastSeen: string | null) {
  if (!lastSeen) {
    return {
      label: "",
      isOnline: false,
    };
  }

  const last = new Date(lastSeen).getTime();
  const now = Date.now();
  const diffMs = now - last;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) {
    return {
      label: "Online agora",
      isOnline: true,
    };
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return {
      label: `Visto há ${diffMin} min`,
      isOnline: false,
    };
  }

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return {
      label: `Visto há ${diffHours} h`,
      isOnline: false,
    };
  }

  const diffDays = Math.floor(diffHours / 24);
  return {
    label: `Visto há ${diffDays} d`,
    isOnline: false,
  };
}

/**
 * Atualiza a própria presença (último visto).
 */
export async function touchUserPresence(userId: string | null) {
  if (!userId) return;

  const now = new Date().toISOString();

  await supabase
    .from("user_presence")
    .upsert({
      user_id: userId,
      last_seen_at: now,
    });
}

/**
 * Hook para observar a presença de outro usuário em tempo real.
 */
export function useUserPresence(userId: string | null) {
  const [lastSeen, setLastSeen] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    let isMounted = true;

    async function load() {
      const { data, error } = await supabase
        .from("user_presence")
        .select("last_seen_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (!error && data && isMounted) {
        setLastSeen(data.last_seen_at as string);
      }
    }

    load();

    const channel = supabase
      .channel(`presence-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "user_presence",
          filter: `user_id=eq.${userId}`,
        },
        (payload: { new: UserPresence }) => {
          setLastSeen(payload.new.last_seen_at);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const { label, isOnline } = formatPresenceLabel(lastSeen);

  return {
    lastSeen,
    label,
    isOnline,
  };
}
