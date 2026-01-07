// components/CommentsSheet.tsx
import Colors from "@/constants/Colors";
import { supabase } from "@/lib/supabase";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type CommentRow = {
  id: number;
  post_id: number;
  user_id: string;
  content: string;
  created_at: string;
  profiles?: {
    username: string | null;
  } | null;
};

type UiComment = {
  id: number;
  post_id: number;
  user_id: string;
  content: string;
  created_at: string;
  username: string;
  canDelete: boolean;
};

type Props = {
  visible: boolean;
  postId: number | null;
  onClose: () => void;
};

export default function CommentsSheet({ visible, postId, onClose }: Props) {
  const [comments, setComments] = useState<UiComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const listRef = useRef<FlatList<UiComment>>(null);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then((result: any) => {
      const user = result.data?.user;
      setCurrentUserId(user?.id ?? null);
    });
  }, []);

  const mapToUi = useCallback(
    (rows: CommentRow[]): UiComment[] =>
      rows.map((row) => ({
        id: row.id,
        post_id: row.post_id,
        user_id: row.user_id,
        content: row.content,
        created_at: row.created_at,
        username: row.profiles?.username || "user",
        canDelete: !!currentUserId && row.user_id === currentUserId,
      })),
    [currentUserId]
  );

  const loadComments = useCallback(async () => {
    if (!postId) return;

    setLoading(true);
    setError(null);

    const response = await supabase
      .from("comments")
      .select(
        `
        id,
        post_id,
        user_id,
        content,
        created_at,
        profiles (
          username
        )
      `
      )
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (response.error) {
      setError(response.error.message ?? "Failed to load comments");
    } else {
      const rows = (response.data ?? []) as CommentRow[];
      setComments(mapToUi(rows));

      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: false });
      }, 50);
    }

    setLoading(false);
  }, [postId, mapToUi]);

  useEffect(() => {
    if (visible && postId) {
      loadComments();
    }
  }, [visible, postId, loadComments]);

  useEffect(() => {
    if (!visible) {
      setComments([]);
      setText("");
      setError(null);
      setLoading(false);
      setSending(false);
    }
  }, [visible]);

  const handleSend = useCallback(async () => {
    const value = text.trim();
    if (!value || !postId || sending) return;

    setSending(true);
    setError(null);

    const userResult = await supabase.auth.getUser();
    const user = userResult.data?.user;

    if (!user) {
      setError("Você precisa estar logado para comentar.");
      setSending(false);
      return;
    }

    const response = await supabase
      .from("comments")
      .insert({
        post_id: postId,
        user_id: user.id,
        content: value,
      })
      .select(
        `
        id,
        post_id,
        user_id,
        content,
        created_at,
        profiles (
          username
        )
      `
      )
      .single();

    if (response.error || !response.data) {
      setError(response.error?.message ?? "Não foi possível enviar o comentário.");
      setSending(false);
      return;
    }

    const row = response.data as CommentRow;
    const ui = mapToUi([row])[0];

    setComments((prev) => [...prev, ui]);
    setText("");

    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 50);

    setSending(false);
  }, [text, postId, sending, mapToUi]);

  const handleDelete = useCallback(
    async (commentId: number) => {
      if (!currentUserId) return;

      const target = comments.find((c) => c.id === commentId);
      if (!target || target.user_id !== currentUserId) return;

      const prev = comments;
      setComments((cur) => cur.filter((c) => c.id !== commentId));

      const response = await supabase
        .from("comments")
        .delete()
        .eq("id", commentId)
        .eq("user_id", currentUserId);

      if (response.error) {
        setComments(prev);
        setError(response.error.message ?? "Erro ao apagar comentário.");
      }
    },
    [comments, currentUserId]
  );

  const handlePressUser = useCallback(
    (userId: string) => {
      router.push(`/user/${userId}` as any);
      onClose();
    },
    [router, onClose]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Comments</Text>
        </View>

        {error && (
          <Text style={styles.errorText} numberOfLines={2}>
            {error}
          </Text>
        )}

        <View style={styles.listContainer}>
          {loading && comments.length === 0 ? (
            <ActivityIndicator style={{ marginTop: 16 }} />
          ) : comments.length === 0 ? (
            <Text style={styles.emptyText}>No comments yet.</Text>
          ) : (
            <FlatList
              ref={listRef}
              data={comments}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <View style={styles.commentRow}>
                  <View style={styles.commentHeader}>
                    <TouchableOpacity
                      onPress={() => handlePressUser(item.user_id)}
                    >
                      <Text style={styles.commentUser}>{item.username}</Text>
                    </TouchableOpacity>

                    {item.canDelete && (
                      <TouchableOpacity
                        onPress={() => handleDelete(item.id)}
                        style={styles.deleteButton}
                      >
                        <Text style={styles.deleteText}>Delete</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <Text style={styles.commentText}>{item.content}</Text>
                </View>
              )}
              contentContainerStyle={{
                paddingHorizontal: 12,
                paddingBottom: 12,
              }}
            />
          )}
        </View>

        <View style={styles.footer}>
          <TextInput
            style={styles.input}
            placeholder="Add a comment..."
            placeholderTextColor={Colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, sending && { opacity: 0.6 }]}
            onPress={handleSend}
            disabled={sending || !text.trim()}
          >
            <Text style={styles.sendText}>{sending ? "..." : "Send"}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
  errorText: {
    color: "#ff6b6b",
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  listContainer: {
    flex: 1,
  },
  emptyText: {
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 24,
  },
  commentRow: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  commentUser: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  deleteButton: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#ff4d4d22",
  },
  deleteText: {
    color: "#ff6b6b",
    fontSize: 11,
    fontWeight: "700",
  },
  commentText: {
    color: Colors.text,
    fontSize: 14,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
    color: Colors.text,
  },
  sendButton: {
    marginLeft: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.brandStart,
    justifyContent: "center",
    alignItems: "center",
  },
  sendText: {
    color: "#fff",
    fontWeight: "700",
  },
});
