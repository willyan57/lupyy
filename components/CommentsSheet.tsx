// components/CommentsSheet.tsx — Premium comments modal
// Avatars, replies/threads, comment likes, @mentions, profile nav
import Colors from "@/constants/Colors";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

/* ── Types ── */

type CommentRow = {
  id: number;
  post_id: number;
  user_id: string;
  content: string;
  created_at: string;
  parent_id: number | null;
  profiles?: {
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

type UiComment = {
  id: number;
  post_id: number;
  user_id: string;
  content: string;
  created_at: string;
  parent_id: number | null;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  canDelete: boolean;
  likesCount: number;
  likedByMe: boolean;
  replies: UiComment[];
};

type Props = {
  visible: boolean;
  postId: number | null;
  onClose: () => void;
};

/* ── Helpers ── */

function timeAgo(ts: string) {
  const d = new Date(ts);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

/* ── Component ── */

export default function CommentsSheet({ visible, postId, onClose }: Props) {
  const [comments, setComments] = useState<UiComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<UiComment | null>(null);

  const listRef = useRef<FlatList<UiComment>>(null);
  const inputRef = useRef<TextInput>(null);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: { data: any }) => {
      setCurrentUserId(data?.user?.id ?? null);
    });
  }, []);

  /* ── Load comments ── */
  const loadComments = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    setError(null);

    // Fetch all comments for post
    const { data: rows, error: qErr } = await supabase
      .from("comments")
      .select(`
        id, post_id, user_id, content, created_at, parent_id,
        profiles ( username, full_name, avatar_url )
      `)
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (qErr) {
      setError(qErr.message);
      setLoading(false);
      return;
    }

    const allRows = (rows ?? []) as CommentRow[];
    const commentIds = allRows.map((r) => r.id);

    // Fetch comment likes counts
    let likesMap: Record<number, number> = {};
    let myLikes = new Set<number>();

    if (commentIds.length > 0) {
      // Counts
      const { data: likeCounts } = await supabase
        .from("comment_like_counts")
        .select("comment_id, likes_count")
        .in("comment_id", commentIds);

      (likeCounts ?? []).forEach((r: any) => {
        likesMap[r.comment_id] = r.likes_count ?? 0;
      });

      // My likes
      if (currentUserId) {
        const { data: myLikeRows } = await supabase
          .from("comment_likes")
          .select("comment_id")
          .eq("user_id", currentUserId)
          .in("comment_id", commentIds);

        (myLikeRows ?? []).forEach((r: any) => {
          myLikes.add(r.comment_id);
        });
      }
    }

    // Map to UI
    const allUi: UiComment[] = allRows.map((row) => ({
      id: row.id,
      post_id: row.post_id,
      user_id: row.user_id,
      content: row.content,
      created_at: row.created_at,
      parent_id: row.parent_id,
      username: row.profiles?.username ?? "user",
      full_name: row.profiles?.full_name ?? null,
      avatar_url: row.profiles?.avatar_url ?? null,
      canDelete: !!currentUserId && row.user_id === currentUserId,
      likesCount: likesMap[row.id] ?? 0,
      likedByMe: myLikes.has(row.id),
      replies: [],
    }));

    // Build tree: top-level comments + nested replies
    const topLevel: UiComment[] = [];
    const byId: Record<number, UiComment> = {};
    allUi.forEach((c) => (byId[c.id] = c));

    allUi.forEach((c) => {
      if (c.parent_id && byId[c.parent_id]) {
        byId[c.parent_id].replies.push(c);
      } else {
        topLevel.push(c);
      }
    });

    setComments(topLevel);
    setLoading(false);

    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: false });
    }, 100);
  }, [postId, currentUserId]);

  useEffect(() => {
    if (visible && postId) loadComments();
    if (!visible) {
      setComments([]);
      setText("");
      setError(null);
      setReplyingTo(null);
    }
  }, [visible, postId, loadComments]);

  /* ── Send comment ── */
  const handleSend = useCallback(async () => {
    const value = text.trim();
    if (!value || !postId || sending) return;
    setSending(true);
    setError(null);

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      setError("Você precisa estar logado para comentar.");
      setSending(false);
      return;
    }

    const insertPayload: any = {
      post_id: postId,
      user_id: user.id,
      content: value,
    };
    if (replyingTo) {
      insertPayload.parent_id = replyingTo.id;
    }

    const { error: insErr } = await supabase
      .from("comments")
      .insert(insertPayload);

    if (insErr) {
      setError(insErr.message);
      setSending(false);
      return;
    }

    setText("");
    setReplyingTo(null);
    setSending(false);
    await loadComments();

    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [text, postId, sending, replyingTo, loadComments]);

  /* ── Delete comment ── */
  const handleDelete = useCallback(
    async (commentId: number) => {
      if (!currentUserId) return;
      const { error: delErr } = await supabase
        .from("comments")
        .delete()
        .eq("id", commentId)
        .eq("user_id", currentUserId);

      if (!delErr) await loadComments();
    },
    [currentUserId, loadComments]
  );

  /* ── Toggle comment like ── */
  const toggleCommentLike = useCallback(
    async (commentId: number) => {
      if (!currentUserId) return;

      // Optimistic
      const updateLike = (items: UiComment[]): UiComment[] =>
        items.map((c) => {
          const updated = { ...c, replies: updateLike(c.replies) };
          if (c.id === commentId) {
            return {
              ...updated,
              likedByMe: !c.likedByMe,
              likesCount: c.likedByMe
                ? Math.max(0, c.likesCount - 1)
                : c.likesCount + 1,
            };
          }
          return updated;
        });

      const target = findComment(comments, commentId);
      const wasLiked = target?.likedByMe ?? false;

      setComments((prev) => updateLike(prev));

      try {
        if (wasLiked) {
          await supabase
            .from("comment_likes")
            .delete()
            .eq("comment_id", commentId)
            .eq("user_id", currentUserId);
        } else {
          await supabase
            .from("comment_likes")
            .insert({ comment_id: commentId, user_id: currentUserId });
        }
      } catch {
        // Revert
        setComments((prev) => updateLike(prev));
      }
    },
    [currentUserId, comments]
  );

  /* ── Navigate to profile ── */
  const handlePressUser = useCallback(
    (userId: string) => {
      onClose();
      setTimeout(() => {
        router.push({ pathname: "/profile", params: { userId } } as any);
      }, 200);
    },
    [router, onClose]
  );

  /* ── Reply ── */
  const startReply = useCallback((comment: UiComment) => {
    setReplyingTo(comment);
    setText(`@${comment.username} `);
    inputRef.current?.focus();
  }, []);

  const cancelReply = useCallback(() => {
    setReplyingTo(null);
    setText("");
  }, []);

  /* ── Render comment row ── */
  const renderComment = (item: UiComment, depth = 0) => {
    const indent = Math.min(depth, 2) * 32;
    return (
      <View key={item.id}>
        <View style={[styles.commentRow, { marginLeft: indent }]}>
          {/* Avatar */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => handlePressUser(item.user_id)}
          >
            {item.avatar_url ? (
              <ExpoImage
                source={{ uri: item.avatar_url }}
                style={styles.avatar}
                contentFit="cover"
                cachePolicy="disk"
              />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>
                  {(item.username?.[0] ?? "U").toUpperCase()}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Content */}
          <View style={styles.commentContent}>
            <View style={styles.commentMeta}>
              <TouchableOpacity onPress={() => handlePressUser(item.user_id)}>
                <Text style={styles.commentUsername}>{item.username}</Text>
              </TouchableOpacity>
              <Text style={styles.commentTime}>{timeAgo(item.created_at)}</Text>
            </View>

            <Text style={styles.commentText}>
              {renderContentWithMentions(item.content)}
            </Text>

            {/* Actions row */}
            <View style={styles.commentActions}>
              <TouchableOpacity
                style={styles.commentActionBtn}
                onPress={() => toggleCommentLike(item.id)}
              >
                <Ionicons
                  name={item.likedByMe ? "heart" : "heart-outline"}
                  size={14}
                  color={item.likedByMe ? Colors.brandStart ?? "#FF4D6D" : Colors.textMuted}
                />
                {item.likesCount > 0 && (
                  <Text style={[styles.commentActionText, item.likedByMe && { color: Colors.brandStart ?? "#FF4D6D" }]}>
                    {item.likesCount}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.commentActionBtn}
                onPress={() => startReply(item)}
              >
                <Text style={styles.commentActionText}>Responder</Text>
              </TouchableOpacity>

              {item.canDelete && (
                <TouchableOpacity
                  style={styles.commentActionBtn}
                  onPress={() => handleDelete(item.id)}
                >
                  <Text style={[styles.commentActionText, { color: "#ff6b6b" }]}>Excluir</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Replies */}
        {item.replies.map((reply) => renderComment(reply, depth + 1))}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdropPress} onPress={onClose} />

        <KeyboardAvoidingView
          style={styles.sheet}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
        >
          {/* Handle */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Comentários</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {/* Comments list */}
          {error && (
            <Text style={styles.errorText}>{error}</Text>
          )}

          <View style={styles.listContainer}>
            {loading && comments.length === 0 ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
                {[1, 2, 3].map((i) => (
                  <View key={i} style={styles.skeletonRow}>
                    <View style={[styles.avatar, styles.skeleton]} />
                    <View style={{ flex: 1, gap: 6 }}>
                      <View style={[styles.skeleton, { width: 100, height: 10, borderRadius: 5 }]} />
                      <View style={[styles.skeleton, { width: "80%" as any, height: 12, borderRadius: 6 }]} />
                      <View style={[styles.skeleton, { width: 60, height: 8, borderRadius: 4 }]} />
                    </View>
                  </View>
                ))}
              </View>
            ) : comments.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>💬</Text>
                <Text style={styles.emptyText}>Nenhum comentário ainda</Text>
                <Text style={styles.emptySubtext}>Seja o primeiro a comentar!</Text>
              </View>
            ) : (
              <FlatList
                ref={listRef}
                data={comments}
                keyExtractor={(item) => String(item.id)}
                renderItem={({ item }) => renderComment(item)}
                contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>

          {/* Reply indicator */}
          {replyingTo && (
            <View style={styles.replyIndicator}>
              <Text style={styles.replyIndicatorText}>
                Respondendo a <Text style={{ fontWeight: "700" }}>@{replyingTo.username}</Text>
              </Text>
              <TouchableOpacity onPress={cancelReply}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {/* Input */}
          <View style={styles.footer}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Adicionar comentário..."
              placeholderTextColor={Colors.textMuted}
              value={text}
              onChangeText={setText}
              multiline
            />
            <TouchableOpacity
              style={[styles.sendButton, (!text.trim() || sending) && { opacity: 0.4 }]}
              onPress={handleSend}
              disabled={sending || !text.trim()}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/* ── Helpers ── */

function findComment(items: UiComment[], id: number): UiComment | null {
  for (const c of items) {
    if (c.id === id) return c;
    const found = findComment(c.replies, id);
    if (found) return found;
  }
  return null;
}

function renderContentWithMentions(content: string) {
  // Highlight @mentions
  const parts = content.split(/(@\w+)/g);
  if (parts.length <= 1) return content;

  return (
    <Text>
      {parts.map((part, i) =>
        part.startsWith("@") ? (
          <Text key={i} style={{ color: "#6C63FF", fontWeight: "600" }}>
            {part}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </Text>
  );
}

/* ── Styles ── */

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  backdropPress: {
    flex: 1,
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    minHeight: 350,
    paddingBottom: Platform.OS === "ios" ? 34 : 8,
  },
  handleContainer: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
    opacity: 0.4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  title: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  closeBtn: {
    padding: 4,
  },
  errorText: {
    color: "#ff6b6b",
    paddingHorizontal: 16,
    marginTop: 4,
    fontSize: 12,
  },
  listContainer: {
    flex: 1,
  },
  commentRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.border,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
  },
  avatarInitial: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  commentContent: {
    flex: 1,
  },
  commentMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  commentUsername: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  commentTime: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  commentText: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  commentActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 6,
  },
  commentActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  commentActionText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  replyIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: Colors.surface,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
  },
  replyIndicatorText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
    color: Colors.text,
    fontSize: 14,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.brandStart ?? "#6C63FF",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 40,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  emptySubtext: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  skeletonRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    gap: 10,
  },
  skeleton: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
  },
});
