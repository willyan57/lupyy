import { supabase } from "@/lib/supabase";

export type LiveKitConnection = { url: string; token: string };

/**
 * Mints a short-lived LiveKit JWT via Supabase Edge Function `livekit-token`.
 * Set secrets: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET (never in the app).
 */
export async function fetchLiveKitToken(
  roomName: string,
  options?: { participantName?: string }
): Promise<LiveKitConnection> {
  const trimmed = roomName.trim();
  if (!trimmed) {
    throw new Error("roomName is required");
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error("Not signed in");
  }

  const { data, error } = await supabase.functions.invoke("livekit-token", {
    body: {
      roomName: trimmed,
      participantName: options?.participantName,
    },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    throw error;
  }

  const payload = data as { token?: string; url?: string; error?: string } | null;
  if (!payload?.token || !payload?.url) {
    throw new Error(payload?.error ?? "livekit-token: invalid response");
  }

  return { token: payload.token, url: payload.url };
}
