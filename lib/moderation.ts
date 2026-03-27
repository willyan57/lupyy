/**
 * moderation.ts — API para bloqueio de usuários e denúncia de conteúdo.
 *
 * Todas as operações usam RPCs do Supabase (SECURITY DEFINER)
 * para garantir segurança e atomicidade.
 */

import { supabase } from "./supabase";

// ── Tipos ──────────────────────────────────────────────

export type ReportReason =
  | "spam"
  | "harassment"
  | "hate_speech"
  | "nudity"
  | "violence"
  | "scam"
  | "impersonation"
  | "self_harm"
  | "misinformation"
  | "underage"
  | "other";

export type BlockedUser = {
  block_id: string;
  blocked_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  blocked_at: string;
};

export const REPORT_REASONS: { key: ReportReason; label: string; icon: string }[] = [
  { key: "spam", label: "Spam", icon: "megaphone-outline" },
  { key: "harassment", label: "Assédio ou bullying", icon: "sad-outline" },
  { key: "hate_speech", label: "Discurso de ódio", icon: "flame-outline" },
  { key: "nudity", label: "Nudez ou conteúdo sexual", icon: "eye-off-outline" },
  { key: "violence", label: "Violência", icon: "warning-outline" },
  { key: "scam", label: "Golpe ou fraude", icon: "shield-outline" },
  { key: "impersonation", label: "Perfil falso", icon: "person-outline" },
  { key: "self_harm", label: "Automutilação ou suicídio", icon: "heart-dislike-outline" },
  { key: "misinformation", label: "Informação falsa", icon: "newspaper-outline" },
  { key: "underage", label: "Menor de idade", icon: "alert-circle-outline" },
  { key: "other", label: "Outro", icon: "ellipsis-horizontal-outline" },
];

// ── Bloqueio ───────────────────────────────────────────

export async function blockUser(blockedId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc("block_user", { _blocked_id: blockedId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function unblockUser(blockedId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc("unblock_user", { _blocked_id: blockedId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function isUserBlocked(userId: string, targetId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_user_blocked", {
    _user_id: userId,
    _target_id: targetId,
  });
  if (error) return false;
  return !!data;
}

export async function getBlockedUsers(): Promise<BlockedUser[]> {
  const { data, error } = await supabase.rpc("get_blocked_users");
  if (error) {
    console.warn("[moderation] getBlockedUsers error:", error.message);
    return [];
  }
  return (data as BlockedUser[]) ?? [];
}

// ── Denúncia ───────────────────────────────────────────

export async function reportContent(params: {
  reportedUserId: string;
  reason: ReportReason;
  description?: string;
  postId?: number;
  commentId?: number;
  storyId?: number;
}): Promise<{ ok: boolean; reportId?: string; error?: string }> {
  const { data, error } = await supabase.rpc("report_content", {
    _reported_user_id: params.reportedUserId,
    _reason: params.reason,
    _description: params.description ?? null,
    _post_id: params.postId ?? null,
    _comment_id: params.commentId ?? null,
    _story_id: params.storyId ?? null,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, reportId: data as string };
}
