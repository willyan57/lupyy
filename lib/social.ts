// lib/social.ts
import { supabase } from "@/lib/supabase";

export type InterestType = "friend" | "crush" | "silent_crush" | "super_crush";

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
  /** True if a mutual silent crush was just discovered (match!) */
  isNewMatch?: boolean;
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

/**
 * Check if a user's relationship status blocks crush actions.
 */
function isCommitted(status?: string | null): boolean {
  return status === "committed" || status === "other";
}

/**
 * Fetch a user's relationship status from profiles table.
 */
async function fetchRelationshipStatus(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("relationship_status")
    .eq("id", userId)
    .maybeSingle();
  return data?.relationship_status ?? null;
}

export async function setFollowInterestType(
  followerId: string,
  followingId: string,
  interestType: InterestType
): Promise<FollowUpdateResult> {
  if (!followerId || !followingId || followerId === followingId) {
    return { interestType, crush: false };
  }

  // ── Server-side crush validation ──
  if (interestType === "crush" || interestType === "silent_crush" || interestType === "super_crush") {
    const [myStatus, targetStatus] = await Promise.all([
      fetchRelationshipStatus(followerId),
      fetchRelationshipStatus(followingId),
    ]);

    // Check if they are linked partners (bypass crush block)
    const { data: partnerCheck } = await supabase
      .from("profiles")
      .select("partner_id")
      .in("id", [followerId, followingId]);

    const profiles = (partnerCheck || []) as { id?: string; partner_id?: string | null }[];
    const myProfile = profiles.find((p: any) => p.id === followerId);
    const theirProfile = profiles.find((p: any) => p.id === followingId);
    const areLinkedPartners =
      !!myProfile?.partner_id &&
      !!theirProfile?.partner_id &&
      myProfile.partner_id === followingId &&
      theirProfile.partner_id === followerId;

    if (!areLinkedPartners) {
      if (isCommitted(myStatus)) {
        throw new Error("CRUSH_BLOCKED_SELF_COMMITTED");
      }
      if (isCommitted(targetStatus)) {
        throw new Error("CRUSH_BLOCKED_TARGET_COMMITTED");
      }
    }
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

  // ── Push notification para quem foi seguido ──
  try {
    const { data: myProfile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", followerId)
      .single();

    const myUsername = myProfile?.username ?? "Alguém";
    const pushBody =
      interestType === "crush" || interestType === "super_crush"
        ? `${myUsername} tem um crush em você 💘`
        : interestType === "silent_crush"
          ? undefined // silent crush = sem notificação
          : `${myUsername} começou a seguir você 🔥`;

    if (pushBody) {
      supabase.functions.invoke("send-push", {
        body: {
          recipientId: followingId,
          title: "LUPYY",
          body: pushBody,
          data: { type: interestType === "friend" ? "follow" : "crush", actorId: followerId },
        },
      }).catch(() => {});
    }
  } catch {}

  let crush = false;
  let isNewMatch = false;

  if (interestType === "crush" || interestType === "silent_crush" || interestType === "super_crush") {
    const { data: reciprocal, error: reciprocalErr } = await supabase
      .from("follows")
      .select("id, interest_type")
      .eq("follower_id", followingId)
      .eq("following_id", followerId)
      .in("interest_type", ["crush", "silent_crush"])
      .maybeSingle();

    if (!reciprocalErr && reciprocal) {
      crush = true;
      isNewMatch = true;

      // ── Push de match para ambos ──
      try {
        supabase.functions.invoke("send-push", {
          body: {
            recipientIds: [followerId, followingId],
            title: "LUPYY 🎉",
            body: "Vocês deram match! Comecem a conversar agora",
            data: { type: "match" },
          },
        }).catch(() => {});
      } catch {}
    }
  }

  const row = data as { interest_type: InterestType };

  return {
    interestType: row.interest_type,
    crush,
    isNewMatch,
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
