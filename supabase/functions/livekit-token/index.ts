/**
 * Edge Function: livekit-token
 * Emite JWT do LiveKit para o utilizador autenticado (nunca exponha API Secret no app).
 *
 * Secrets (Supabase Dashboard → Edge Functions → Secrets):
 *   LIVEKIT_URL       — ex.: wss://xxxx.livekit.cloud
 *   LIVEKIT_API_KEY   — chave do projeto
 *   LIVEKIT_API_SECRET — segredo (só no servidor)
 *
 * Deploy: supabase functions deploy livekit-token
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@2.9.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  roomName?: string;
  participantName?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user = userData.user;
    const body = (await req.json()) as Body;
    const roomName = body.roomName?.trim();
    if (!roomName) {
      return new Response(JSON.stringify({ error: "roomName é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const livekitUrl = Deno.env.get("LIVEKIT_URL")?.trim();
    const apiKey = Deno.env.get("LIVEKIT_API_KEY")?.trim();
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET")?.trim();

    if (!livekitUrl || !apiKey || !apiSecret) {
      console.error("livekit-token: missing LIVEKIT_URL, LIVEKIT_API_KEY or LIVEKIT_API_SECRET");
      return new Response(JSON.stringify({ error: "Servidor LiveKit não configurado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const displayName =
      body.participantName?.trim() ||
      (user.user_metadata?.full_name as string | undefined)?.trim() ||
      user.email?.split("@")[0] ||
      user.id;

    const at = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name: displayName,
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    return new Response(JSON.stringify({ token, url: livekitUrl }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("livekit-token:", e);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
