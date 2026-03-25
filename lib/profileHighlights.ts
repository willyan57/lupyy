// lib/profileHighlights.ts — Highlights CRUD for profile
import { supabase } from "@/lib/supabase";

export type Highlight = {
  id: string;
  title: string;
  cover_url: string | null;
  items_count: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type HighlightItem = {
  item_id: string;
  story_id: number;
  media_url: string;
  media_type: "image" | "video";
  thumbnail_path: string | null;
  filter: string | null;
  position: number;
  story_created_at: string;
};

export type ArchivedStory = {
  id: number;
  media_url: string;
  media_type: "image" | "video";
  thumbnail_path: string | null;
  created_at: string;
};

/**
 * Fetch all highlights for a user (with cover & count)
 */
export async function fetchUserHighlights(userId: string): Promise<Highlight[]> {
  const { data, error } = await supabase.rpc("get_user_highlights", { p_user_id: userId });
  if (error) {
    console.log("fetchUserHighlights error:", error);
    return [];
  }
  return (data ?? []) as Highlight[];
}

/**
 * Fetch items for a specific highlight
 */
export async function fetchHighlightItems(highlightId: string): Promise<HighlightItem[]> {
  const { data, error } = await supabase.rpc("get_highlight_items", { p_highlight_id: highlightId });
  if (error) {
    console.log("fetchHighlightItems error:", error);
    return [];
  }
  return (data ?? []) as HighlightItem[];
}

/**
 * Fetch ALL stories ever posted by a user (for the highlight picker)
 */
export async function fetchAllUserStories(userId: string): Promise<ArchivedStory[]> {
  const { data, error } = await supabase.rpc("get_user_all_stories", { p_user_id: userId });
  if (error) {
    console.log("fetchAllUserStories error:", error);
    return [];
  }
  return (data ?? []) as ArchivedStory[];
}

/**
 * Create a new highlight
 */
export async function createHighlight(
  userId: string,
  title: string,
  storyIds: number[],
  coverStoryId?: number
): Promise<Highlight | null> {
  // 1. Get max sort_order
  const { data: existing } = await supabase
    .from("profile_highlights")
    .select("sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = existing && existing.length > 0 ? (existing[0].sort_order ?? 0) + 1 : 0;

  // 2. Create the highlight
  const { data: highlight, error: createError } = await supabase
    .from("profile_highlights")
    .insert({
      user_id: userId,
      title,
      cover_story_id: coverStoryId ?? (storyIds[0] || null),
      sort_order: nextOrder,
    })
    .select("*")
    .single();

  if (createError || !highlight) {
    console.log("createHighlight error:", createError);
    return null;
  }

  // 3. Insert items
  if (storyIds.length > 0) {
    const items = storyIds.map((storyId, idx) => ({
      highlight_id: highlight.id,
      story_id: storyId,
      position: idx,
    }));

    const { error: itemsError } = await supabase.from("profile_highlight_items").insert(items);
    if (itemsError) {
      console.log("createHighlight items error:", itemsError);
    }
  }

  return highlight as Highlight;
}

/**
 * Update highlight title and/or cover
 */
export async function updateHighlight(
  highlightId: string,
  updates: { title?: string; cover_story_id?: number | null }
): Promise<boolean> {
  const payload: any = { updated_at: new Date().toISOString() };
  if (updates.title !== undefined) payload.title = updates.title;
  if (updates.cover_story_id !== undefined) payload.cover_story_id = updates.cover_story_id;

  const { error } = await supabase
    .from("profile_highlights")
    .update(payload)
    .eq("id", highlightId);

  if (error) {
    console.log("updateHighlight error:", error);
    return false;
  }
  return true;
}

/**
 * Delete a highlight
 */
export async function deleteHighlight(highlightId: string): Promise<boolean> {
  const { error } = await supabase.from("profile_highlights").delete().eq("id", highlightId);
  if (error) {
    console.log("deleteHighlight error:", error);
    return false;
  }
  return true;
}

/**
 * Add stories to an existing highlight
 */
export async function addStoriesToHighlight(
  highlightId: string,
  storyIds: number[]
): Promise<boolean> {
  // Get current max position
  const { data: existing } = await supabase
    .from("profile_highlight_items")
    .select("position")
    .eq("highlight_id", highlightId)
    .order("position", { ascending: false })
    .limit(1);

  const startPosition = existing && existing.length > 0 ? (existing[0].position ?? 0) + 1 : 0;

  const items = storyIds.map((storyId, idx) => ({
    highlight_id: highlightId,
    story_id: storyId,
    position: startPosition + idx,
  }));

  const { error } = await supabase.from("profile_highlight_items").insert(items);
  if (error) {
    console.log("addStoriesToHighlight error:", error);
    return false;
  }
  return true;
}

/**
 * Remove a story from a highlight
 */
export async function removeStoryFromHighlight(
  highlightId: string,
  storyId: number
): Promise<boolean> {
  const { error } = await supabase
    .from("profile_highlight_items")
    .delete()
    .eq("highlight_id", highlightId)
    .eq("story_id", storyId);

  if (error) {
    console.log("removeStoryFromHighlight error:", error);
    return false;
  }
  return true;
}

/**
 * Register a post view
 */
export async function registerPostView(postId: number, userId: string): Promise<void> {
  try {
    await supabase.from("post_views").upsert(
      { post_id: postId, user_id: userId },
      { onConflict: "post_id,user_id" }
    );
  } catch {}
}

/**
 * Fetch view counts for multiple posts
 */
export async function fetchPostViewCounts(
  postIds: number[]
): Promise<Record<number, number>> {
  if (!postIds.length) return {};

  const { data, error } = await supabase
    .from("post_view_counts")
    .select("post_id, views_count")
    .in("post_id", postIds);

  if (error || !data) return {};

  const result: Record<number, number> = {};
  data.forEach((r: any) => {
    result[r.post_id] = r.views_count ?? 0;
  });
  return result;
}
