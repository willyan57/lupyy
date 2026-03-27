// lib/engagement.ts — Gamificação, níveis, badges, boost e profile views
import { supabase } from "@/lib/supabase";

// ── Tipos ──

export type BadgeType =
  | "exploding"
  | "desired"
  | "observed"
  | "mysterious"
  | "influential"
  | "popular"
  | "magnetic"
  | "icon";

export type Badge = {
  badge_type: BadgeType;
  earned_at: string;
  expires_at: string | null;
};

export type UserLevelInfo = {
  xp: number;
  level: number;
  level_name: string;
  badges: Badge[];
  total_likes_received: number;
  total_crushes_received: number;
  total_profile_views: number;
  total_followers: number;
};

export type ProfileViewStats = {
  views_24h: number;
  views_7d: number;
  unique_viewers_24h: number;
  unique_viewers_7d: number;
  total_views: number;
};

export type ProfileVisitor = {
  viewer_id: string;
  viewer_username: string | null;
  viewer_full_name: string | null;
  viewer_avatar_url: string | null;
  last_visited_at: string;
  visit_count: number;
};

export type BoostInfo = {
  user_id: string;
  boost_type: string;
  started_at: string;
  expires_at: string;
  seconds_remaining: number;
};

// ── Badge display config ──

export const BADGE_CONFIG: Record<BadgeType, { emoji: string; label: string; color: string }> = {
  exploding: { emoji: "🔥", label: "Explodindo", color: "#FF4500" },
  desired: { emoji: "💘", label: "Desejado(a)", color: "#FF1493" },
  observed: { emoji: "👀", label: "Observado(a)", color: "#8B5CF6" },
  mysterious: { emoji: "🤐", label: "Misterioso(a)", color: "#6366F1" },
  influential: { emoji: "🧠", label: "Influente", color: "#06B6D4" },
  popular: { emoji: "⭐", label: "Popular", color: "#F59E0B" },
  magnetic: { emoji: "🧲", label: "Magnético", color: "#EC4899" },
  icon: { emoji: "👑", label: "Ícone", color: "#FFD700" },
};

export const LEVEL_CONFIG: Record<number, { name: string; emoji: string; color: string; xpNeeded: number }> = {
  1: { name: "Novo", emoji: "🌱", color: "#9CA3AF", xpNeeded: 0 },
  2: { name: "Social", emoji: "💬", color: "#60A5FA", xpNeeded: 100 },
  3: { name: "Interessante", emoji: "✨", color: "#A78BFA", xpNeeded: 500 },
  4: { name: "Popular", emoji: "⭐", color: "#F59E0B", xpNeeded: 2000 },
  5: { name: "Magnético", emoji: "🧲", color: "#EC4899", xpNeeded: 5000 },
  6: { name: "Ícone", emoji: "👑", color: "#FFD700", xpNeeded: 15000 },
};

// ── Profile Views ──

export async function registerProfileView(profileId: string): Promise<void> {
  try {
    await supabase.rpc("register_profile_view", { _profile_id: profileId });
  } catch (e) {
    console.log("registerProfileView error:", e);
  }
}

export async function getProfileViewStats(profileId: string): Promise<ProfileViewStats | null> {
  const { data, error } = await supabase
    .from("profile_view_stats")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ProfileViewStats;
}

export async function getProfileVisitors(limit = 20): Promise<ProfileVisitor[]> {
  const { data, error } = await supabase.rpc("get_profile_visitors", { _limit: limit });
  if (error || !data) return [];
  return data as ProfileVisitor[];
}

// ── Levels & Badges ──

export async function getUserLevelAndBadges(userId: string): Promise<UserLevelInfo | null> {
  const { data, error } = await supabase.rpc("get_user_level_and_badges", { _user_id: userId });
  if (error || !data || (Array.isArray(data) && data.length === 0)) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    xp: row.xp ?? 0,
    level: row.level ?? 1,
    level_name: row.level_name ?? "Novo",
    badges: row.badges ?? [],
    total_likes_received: row.total_likes_received ?? 0,
    total_crushes_received: row.total_crushes_received ?? 0,
    total_profile_views: row.total_profile_views ?? 0,
    total_followers: row.total_followers ?? 0,
  };
}

export async function evaluateBadges(userId: string): Promise<void> {
  try {
    await supabase.rpc("evaluate_badges", { _user_id: userId });
  } catch (e) {
    console.log("evaluateBadges error:", e);
  }
}

// ── Boost (legacy profile-level — kept for backward compat) ──

export async function getActiveBoost(userId: string): Promise<BoostInfo | null> {
  const { data, error } = await supabase
    .from("active_boosted_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as BoostInfo;
}

export async function activateBoost(
  boostType: "standard" | "super" = "standard",
  durationMinutes = 60
): Promise<{ boost_id: number; expires_at: string } | null> {
  const { data, error } = await supabase.rpc("activate_profile_boost", {
    _boost_type: boostType,
    _duration_minutes: durationMinutes,
  });
  if (error) {
    if (error.message?.includes("BOOST_ALREADY_ACTIVE")) {
      throw new Error("BOOST_ALREADY_ACTIVE");
    }
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

// ── Post-level Boost (Instagram-style Promote) ──

export type PostBoostInfo = {
  post_id: number;
  boost_type: string;
  started_at: string;
  expires_at: string;
  seconds_remaining: number;
};

export async function boostPost(
  postId: number,
  boostType: "standard" | "super" = "standard",
  durationHours = 24
): Promise<{ boost_id: number; expires_at: string } | null> {
  const { data, error } = await supabase.rpc("boost_post", {
    _post_id: postId,
    _boost_type: boostType,
    _duration_hours: durationHours,
  });
  if (error) {
    if (error.message?.includes("POST_ALREADY_BOOSTED")) throw new Error("POST_ALREADY_BOOSTED");
    if (error.message?.includes("MAX_BOOSTS_REACHED")) throw new Error("MAX_BOOSTS_REACHED");
    if (error.message?.includes("POST_NOT_OWNED")) throw new Error("POST_NOT_OWNED");
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

export async function cancelPostBoost(postId: number): Promise<void> {
  await supabase.rpc("cancel_post_boost", { _post_id: postId });
}

export async function getMyBoostedPosts(): Promise<PostBoostInfo[]> {
  const { data, error } = await supabase.rpc("get_my_boosted_posts");
  if (error || !data) return [];
  return data as PostBoostInfo[];
}

export async function getActiveBoostedPostIds(): Promise<Set<number>> {
  const { data, error } = await supabase
    .from("active_boosted_posts")
    .select("post_id");
  if (error || !data) return new Set();
  return new Set((data as any[]).map((r) => Number(r.post_id)));
}

// ── XP progress helpers ──

export function getXpProgress(xp: number, level: number): { current: number; needed: number; percent: number } {
  const currentLevelXp = LEVEL_CONFIG[level]?.xpNeeded ?? 0;
  const nextLevel = Math.min(level + 1, 6);
  const nextLevelXp = LEVEL_CONFIG[nextLevel]?.xpNeeded ?? currentLevelXp;

  if (level >= 6) return { current: xp, needed: xp, percent: 100 };

  const progress = xp - currentLevelXp;
  const total = nextLevelXp - currentLevelXp;
  const percent = total > 0 ? Math.min(Math.round((progress / total) * 100), 100) : 0;

  return { current: progress, needed: total, percent };
}
