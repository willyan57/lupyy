// lib/social.ts
import { supabase } from "@/lib/supabase";

export type InterestType = "friend" | "crush" | "silent_crush";

export type SocialStats = {
  user_id: string;
  followers_count: number;
  following_count: number;
  crush_count: number;
};

export type FollowState = {
  exists: boolean;
  interestType: InterestType | null;
};

export type FollowUpdateResult = {
  interestType: InterestType;
  crush: boolean;
};

export async function fetchSocialStats(userId: string): Promise<SocialStats | null> {
  const { data, error } = await supabase
    .from("profile_social_stats")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const s = data as {
    user_id: string;
    followers_count: number | null;
    following_count: number | null;
    crush_count: number | null;
  };

  return {
    user_id: s.user_id,
    followers_count: s.followers_count ?? 0,
    following_count: s.following_count ?? 0,
    crush_count: s.crush_count ?? 0,
  };
}

export async function getFollowState(
  followerId: string,
  followingId: string
): Promise<FollowState> {
  if (!followerId || !followingId || followerId === followingId) {
    return { exists: false, interestType: null };
  }

  const { data, error } = await supabase
    .from("follows")
    .select("interest_type")
    .eq("follower_id", followerId)
    .eq("following_id", followingId)
    .maybeSingle();

  if (error || !data) {
    return { exists: false, interestType: null };
  }

  const row = data as { interest_type: InterestType | null };

  return {
    exists: true,
    interestType: row.interest_type ?? null,
  };
}

export async function setFollowInterestType(
  followerId: string,
  followingId: string,
  interestType: InterestType
): Promise<FollowUpdateResult> {
  if (!followerId || !followingId || followerId === followingId) {
    return { interestType, crush: false };
  }

  const { data, error } = await supabase
    .from("follows")
    .upsert(
      {
        follower_id: followerId,
        following_id: followingId,
        interest_type: interestType,
      },
      { onConflict: "follower_id,following_id" }
    )
    .select("interest_type")
    .single();

  if (error || !data) {
    throw error;
  }

  let crush = false;

  if (interestType === "crush" || interestType === "silent_crush") {
    const { data: reciprocal, error: reciprocalErr } = await supabase
      .from("follows")
      .select("id, interest_type")
      .eq("follower_id", followingId)
      .eq("following_id", followerId)
      .in("interest_type", ["crush", "silent_crush"])
      .maybeSingle();

    if (!reciprocalErr && reciprocal) {
      crush = true;
    }
  }

  const row = data as { interest_type: InterestType };

  return {
    interestType: row.interest_type,
    crush,
  };
}

export async function removeFollow(
  followerId: string,
  followingId: string
): Promise<void> {
  if (!followerId || !followingId || followerId === followingId) {
    return;
  }

  await supabase
    .from("follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("following_id", followingId);
}
