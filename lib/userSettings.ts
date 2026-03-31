/**
 * userSettings.ts — API para gerenciar configurações do usuário
 */
import { supabase } from "@/lib/supabase";

export type UserSettings = {
  id: string;
  user_id: string;
  // Booleans
  is_private_account: boolean;
  show_activity_status: boolean;
  allow_story_sharing: boolean;
  two_factor_enabled: boolean;
  allow_message_requests: boolean;
  show_read_receipts: boolean;
  show_typing_indicator: boolean;
  message_notifications: boolean;
  allow_ephemeral_media: boolean;
  approve_tags_manually: boolean;
  mention_notifications: boolean;
  filter_offensive_comments: boolean;
  appear_in_suggestions: boolean;
  nearby_people: boolean;
  similar_content: boolean;
  pause_notifications: boolean;
  // Text enums
  allow_messages_from: string;
  allow_tags_from: string;
  allow_mentions_from: string;
  allow_comments_from: string;
  // Arrays
  filtered_words: string[];
  // Nullable
  daily_reminder_minutes: number | null;
  quiet_mode_start: string | null;
  quiet_mode_end: string | null;
};

export type SettingKey = keyof Omit<UserSettings, "id" | "user_id">;
export type BooleanSettingKey = {
  [K in keyof UserSettings]: UserSettings[K] extends boolean ? K : never;
}[keyof UserSettings];
export type TextSettingKey = "allow_messages_from" | "allow_tags_from" | "allow_mentions_from" | "allow_comments_from";

/**
 * Busca ou cria as configurações do usuário atual.
 */
export async function getOrCreateUserSettings(): Promise<UserSettings | null> {
  try {
    const { data, error } = await supabase.rpc("get_or_create_user_settings");
    if (error) {
      console.warn("[userSettings] RPC error, falling back:", error.message);
      const { data: me } = await supabase.auth.getUser();
      if (!me?.user?.id) return null;

      const { data: row } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", me.user.id)
        .maybeSingle();

      if (row) return row as UserSettings;

      const { data: inserted } = await supabase
        .from("user_settings")
        .insert({ user_id: me.user.id })
        .select("*")
        .single();

      return (inserted as UserSettings) || null;
    }
    return data as UserSettings;
  } catch {
    return null;
  }
}

/**
 * Atualiza uma configuração booleana.
 */
export async function updateUserSetting(key: SettingKey, value: boolean): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("update_user_setting", {
      _key: key,
      _value: value,
    });
    if (error) {
      console.warn("[userSettings] RPC update error, trying direct:", error.message);
      const { data: me } = await supabase.auth.getUser();
      if (!me?.user?.id) return false;
      const { error: err2 } = await supabase
        .from("user_settings")
        .update({ [key]: value })
        .eq("user_id", me.user.id);
      return !err2;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Atualiza uma configuração de texto (enum-like).
 */
export async function updateUserSettingText(key: TextSettingKey, value: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("update_user_setting_text", {
      _key: key,
      _value: value,
    });
    if (error) {
      console.warn("[userSettings] RPC text update error, trying direct:", error.message);
      const { data: me } = await supabase.auth.getUser();
      if (!me?.user?.id) return false;
      // Ensure the row exists first
      await supabase
        .from("user_settings")
        .upsert({ user_id: me.user.id }, { onConflict: "user_id" });
      const { error: err2 } = await supabase
        .from("user_settings")
        .update({ [key]: value })
        .eq("user_id", me.user.id);
      if (err2) {
        console.warn("[userSettings] Direct update also failed:", err2.message);
        return false;
      }
      return true;
    }
    return true;
  } catch (e) {
    console.warn("[userSettings] updateUserSettingText exception:", e);
    return false;
  }
}

/**
 * Atualiza palavras filtradas.
 */
export async function updateFilteredWords(words: string[]): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("update_filtered_words", { _words: words });
    if (error) {
      const { data: me } = await supabase.auth.getUser();
      if (!me?.user?.id) return false;
      const { error: err2 } = await supabase
        .from("user_settings")
        .update({ filtered_words: words })
        .eq("user_id", me.user.id);
      return !err2;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Atualiza lembrete diário.
 */
export async function updateDailyReminder(minutes: number | null): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("update_daily_reminder", { _minutes: minutes });
    if (error) {
      const { data: me } = await supabase.auth.getUser();
      if (!me?.user?.id) return false;
      const { error: err2 } = await supabase
        .from("user_settings")
        .update({ daily_reminder_minutes: minutes })
        .eq("user_id", me.user.id);
      return !err2;
    }
    return true;
  } catch {
    return false;
  }
}
