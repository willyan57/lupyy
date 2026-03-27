/**
 * Edge Function: send-push
 * Envia push notifications via Expo Push API
 *
 * Deploy no Supabase:
 *   1. Copie esta pasta para supabase/functions/send-push/
 *   2. Execute: supabase functions deploy send-push
 *
 * Chamada do app:
 *   supabase.functions.invoke('send-push', {
 *     body: { recipientId: 'uuid', title: 'Título', body: 'Mensagem', data: {} }
 *   })
 *
 * Ou chamada interna (de triggers/outras functions):
 *   fetch(SUPABASE_URL + '/functions/v1/send-push', { ... })
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushPayload {
  recipientId?: string;       // Enviar para um usuário específico
  recipientIds?: string[];    // Enviar para múltiplos usuários
  title: string;
  body: string;
  data?: Record<string, any>; // Dados extras (ex: { type: 'like', postId: 123 })
  badge?: number;
  sound?: string;
  channelId?: string;
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verificar auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // Service role para acessar todos os tokens
    );

    // Validar JWT do usuário
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: authError } = await supabase.auth.getUser(token);
    if (authError || !claims?.user) {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload: PushPayload = await req.json();

    // Coletar IDs dos destinatários
    const recipientIds: string[] = [];
    if (payload.recipientId) recipientIds.push(payload.recipientId);
    if (payload.recipientIds) recipientIds.push(...payload.recipientIds);

    if (recipientIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'recipientId ou recipientIds é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar tokens de todos os destinatários
    const { data: tokens, error: tokensError } = await supabase
      .from('push_tokens')
      .select('expo_push_token')
      .in('user_id', recipientIds)
      .eq('is_active', true);

    if (tokensError) {
      console.error('Erro ao buscar tokens:', tokensError);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar tokens' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'Nenhum token encontrado' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Montar mensagens para o Expo Push API
    const messages = tokens.map((t) => ({
      to: t.expo_push_token,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      sound: payload.sound ?? 'default',
      badge: payload.badge,
      channelId: payload.channelId ?? 'default',
    }));

    // Enviar em lotes de 100 (limite do Expo)
    const results = [];
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);

      const expoResponse = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(batch),
      });

      const expoData = await expoResponse.json();
      results.push(expoData);

      // Desativar tokens inválidos
      if (expoData.data) {
        for (let j = 0; j < expoData.data.length; j++) {
          const ticket = expoData.data[j];
          if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
            // Token inválido — desativar
            await supabase
              .from('push_tokens')
              .update({ is_active: false })
              .eq('expo_push_token', batch[j].to);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent: messages.length, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro no send-push:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
