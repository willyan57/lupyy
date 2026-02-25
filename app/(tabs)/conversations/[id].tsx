import Colors from "@/constants/Colors";
import { touchUserPresence, useUserPresence } from "@/lib/presence";
import { supabase } from "@/lib/supabase";
import { useTypingIndicator } from "@/lib/useTypingIndicator";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

type DbMessage = {
  id: string | number;
  conversation_id: string;
  sender: string;
  content: string | null;
  media_url: string | null;
  created_at: string;
  is_deleted_for_all?: boolean;
  deleted_at?: string | null;
  reply_to_id?: string | null;
};

type ConversationRow = {
  id: string;
  user1: string;
  user2: string;
  conversation_type: "friend" | "crush" | null;
};

type ProfileHeader = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

export default function ConversationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = typeof id === "string" ? id : "";

  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [conversationType, setConversationType] =
    useState<"friend" | "crush" | null>(null);

  const [otherProfile, setOtherProfile] = useState<ProfileHeader | null>(null);

  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const [selectedMessage, setSelectedMessage] = useState<DbMessage | null>(null);
  const [showMessageMenu, setShowMessageMenu] = useState(false);
  const [replyingTo, setReplyingTo] = useState<DbMessage | null>(null);
  const [localReactions, setLocalReactions] = useState<Record<string, string>>(
    {}
  );

  const listRef = useRef<FlatList<DbMessage>>(null);
  const inputRef = useRef<TextInput | null>(null);
  const insets = useSafeAreaInsets();

  const { label: presenceLabel, isOnline } = useUserPresence(otherUserId);
  const { isSomeoneTyping, reportTyping } = useTypingIndicator({
    conversationId,
    currentUserId: authUserId,
  });

  const isWeb = Platform.OS === "web";
  const isCrush = conversationType === "crush";

  async function ensureLocalFileUri(inputUri: string): Promise<string> {
    if (!inputUri) return inputUri;
    if (Platform.OS === "web") return inputUri;
    if (inputUri.startsWith("file://")) return inputUri;
    if (inputUri.startsWith("content://")) {
      const dest = `${FileSystem.cacheDirectory}lupyy_chat_${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: inputUri, to: dest });
      return dest;
    }
    return inputUri;
  }

const handleOpenProfileFromHeader = () => {
  if (!otherUserId) return;
  router.push({
    pathname: "/(tabs)/profile",
    params: { userId: otherUserId },
  });
};

  const displayName =
    otherProfile?.full_name?.trim() ||
    otherProfile?.username?.trim() ||
    (isCrush ? "Conversa Crush" : "Conversa");

  useEffect(() => {
    if (!messages.length) return;
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);

        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
          router.replace("/");
          return;
        }
        if (!isMounted) return;

        const uid = auth.user.id;
        setAuthUserId(uid);

        const { data: conv, error: convErr } = await supabase
          .from("conversations")
          .select("*")
          .eq("id", conversationId)
          .maybeSingle();

        if (convErr || !conv) {
          setLoading(false);
          return;
        }

        const c = conv as ConversationRow;
        const other =
          c.user1 === uid ? c.user2 : c.user2 === uid ? c.user1 : null;
        setOtherUserId(other);
        setConversationType(c.conversation_type);

        if (other) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, username, full_name, avatar_url")
            .eq("id", other)
            .maybeSingle();

          if (profile && isMounted) {
            setOtherProfile(profile as ProfileHeader);
          }
        }

        const { data: msgs, error: msgErr } = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true });

        if (!msgErr && msgs && isMounted) {
          setMessages(msgs as DbMessage[]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (conversationId) load();

    return () => {
      isMounted = false;
    };
  }, [conversationId, router]);

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`conversation-messages-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: any) => {
          const msg = payload.new as DbMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg].sort((a, b) =>
              a.created_at.localeCompare(b.created_at)
            );
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: any) => {
          const updated = payload.new as DbMessage;
          setMessages((prev) =>
            prev
              .map((m) => (m.id === updated.id ? updated : m))
              .sort((a, b) => a.created_at.localeCompare(b.created_at))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    if (!authUserId) return;

    touchUserPresence(authUserId);

    const interval = setInterval(() => {
      touchUserPresence(authUserId);
    }, 30000);

    return () => {
      clearInterval(interval);
    };
  }, [authUserId]);

  function openMessageMenu(message: DbMessage) {
    if (message.is_deleted_for_all) return;
    setSelectedMessage(message);
    setShowMessageMenu(true);
  }

  function closeMessageMenu() {
    setShowMessageMenu(false);
    setSelectedMessage(null);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || !authUserId || !conversationId || sending) return;

    setSending(true);
    setInput("");
    reportTyping(false);

    const tempId = `temp-${Date.now()}`;
    const optimistic: DbMessage = {
      id: tempId,
      conversation_id: conversationId,
      sender: authUserId,
      content: text,
      media_url: null,
      created_at: new Date().toISOString(),
      reply_to_id: replyingTo ? String(replyingTo.id) : null,
    };

    setMessages((prev) => [...prev, optimistic]);

    try {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender: authUserId,
          content: text,
          reply_to_id: replyingTo ? replyingTo.id : null,
        })
        .select("*")
        .single();

      if (error) throw error;

      const real = data as DbMessage;

      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        return [...withoutTemp, real].sort((a, b) =>
          a.created_at.localeCompare(b.created_at)
        );
      });

      await supabase
        .from("conversations")
        .update({
          last_message: text,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
      setReplyingTo(null);
    }
  }

  async function handlePickMedia() {
    if (!authUserId || !conversationId || uploadingMedia) return;

    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== "granted") {
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const asset = result.assets[0];
      setUploadingMedia(true);

      const uri = await ensureLocalFileUri(asset.uri);
      const guessedName =
        (asset as any).fileName ?? uri.split("/").pop() ?? "image";
      const fileExt = guessedName.split(".").pop() ?? "jpg";
      const filePath = `${conversationId}/${Date.now()}-${authUserId}.${fileExt}`;

      // Upload unificado (Web + Native) via blob.
      // Evita bug clássico no Android quando o picker retorna content://
      // e o arquivo não é lido corretamente pelo storage SDK.
      const response = await fetch(uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from("conversation_media")
        .upload(filePath, blob, {
          contentType: asset.mimeType ?? "image/jpeg",
          upsert: false,
        });

      if (uploadError) {
        setUploadingMedia(false);
        return;
      }

      const { data: publicData } = supabase.storage
        .from("conversation_media")
        .getPublicUrl(filePath);

      const publicUrl = publicData.publicUrl;

      const { data: inserted, error: insertError } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender: authUserId,
          content: "",
          media_url: publicUrl,
        })
        .select("*")
        .single();

      if (insertError) {
        setUploadingMedia(false);
        return;
      }

      const real = inserted as DbMessage;

      setMessages((prev) => {
        if (prev.some((m) => m.id === real.id)) return prev;
        const merged = [...prev, real];
        return merged.sort((a, b) =>
          a.created_at.localeCompare(b.created_at)
        );
      });

      await supabase
        .from("conversations")
        .update({
          last_message: "[mídia]",
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
    } catch {
    } finally {
      setUploadingMedia(false);
    }
  }

  function handleReactToMessage(emoji: string) {
    if (!selectedMessage) return;
    const key = String(selectedMessage.id);
    setLocalReactions((prev) => ({ ...prev, [key]: emoji }));
    closeMessageMenu();
  }

  function handleReplyToMessage() {
    if (!selectedMessage) return;
    setReplyingTo(selectedMessage);
    closeMessageMenu();
    inputRef.current?.focus();
  }

  function handleForwardMessage() {
    closeMessageMenu();
    Alert.alert(
      "Encaminhar",
      "Fluxo de encaminhar mensagem ainda será implementado."
    );
  }

  async function handleCopyMessage() {
    if (!selectedMessage) return;
    const raw = selectedMessage.content ?? "";
    const text = raw.replace(/[\r\n\u2028\u2029]+/g, " ").trim();
    if (!text) {
      closeMessageMenu();
      return;
    }
    try {
      await Clipboard.setStringAsync(text);
    } finally {
      closeMessageMenu();
    }
  }

  async function handleCancelSendForAll() {
    if (!selectedMessage || !authUserId) return;
    if (selectedMessage.sender !== authUserId) {
      closeMessageMenu();
      return;
    }

    const messageId = selectedMessage.id;
    closeMessageMenu();

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              is_deleted_for_all: true,
              deleted_at: new Date().toISOString(),
              content: "",
              media_url: null,
            }
          : m
      )
    );

    try {
      await supabase
        .from("messages")
        .update({
          is_deleted_for_all: true,
          deleted_at: new Date().toISOString(),
          content: "",
          media_url: null,
        })
        .eq("id", messageId)
        .eq("sender", authUserId);
    } catch {
    }
  }

  const isDisabled = !input.trim() || sending;

  const renderItem = ({ item }: { item: DbMessage }) => {
    const isMine = item.sender === authUserId;

    if (item.is_deleted_for_all) {
      return (
        <View
          style={[
            styles.messageRow,
            { justifyContent: isMine ? "flex-end" : "flex-start" },
          ]}
        >
          <View style={[styles.bubble, styles.deletedBubble]}>
            <Text style={styles.deletedText}>Mensagem apagada</Text>
          </View>
        </View>
      );
    }

    const rawText = item.content ?? "";
    const displayText = rawText.replace(/[\r\n\u2028\u2029]+/g, " ").trim();
    const hasText = displayText.length > 0;
    const hasMedia = !!item.media_url;

    if (!hasText && !hasMedia) return null;

    const repliedMessage =
      item.reply_to_id != null
        ? messages.find(
            (m) => String(m.id) === String(item.reply_to_id || "")
          )
        : undefined;

    const reaction = localReactions[String(item.id)];

    return (
      <View
        style={[
          styles.messageRow,
          { justifyContent: isMine ? "flex-end" : "flex-start" },
        ]}
      >
        <View style={styles.messageBubbleWrapper}>
          <TouchableOpacity
            activeOpacity={0.9}
            onLongPress={() => openMessageMenu(item)}
            delayLongPress={260}
          >
            <View
              style={[
                styles.bubble,
                isMine
                  ? isCrush
                    ? styles.bubbleMineCrush
                    : styles.bubbleMineFriend
                  : styles.bubbleOther,
              ]}
            >
              {repliedMessage && (
                <View
                  style={[
                    styles.replyPreviewInBubble,
                    isMine
                      ? styles.replyPreviewMineBorder
                      : styles.replyPreviewOtherBorder,
                  ]}
                >
                  <Text style={styles.replyPreviewLabel}>
                    {repliedMessage.sender === authUserId ? "Você" : "Contato"}
                  </Text>
                  <Text style={styles.replyPreviewText} numberOfLines={1}>
                    {repliedMessage.content && repliedMessage.content.trim()
                      ? repliedMessage.content.trim()
                      : "[mídia]"}
                  </Text>
                </View>
              )}

              {hasMedia && (
                <Image
                  source={{ uri: item.media_url! }}
                  style={styles.messageImage}
                  resizeMode="cover"
                />
              )}

              {hasText && (
                <Text
                  style={isMine ? styles.bubbleTextMine : styles.bubbleTextOther}
                >
                  {displayText}
                </Text>
              )}
            </View>
          </TouchableOpacity>

          {reaction && (
            <View
              style={[
                styles.reactionBadge,
                isMine ? styles.reactionBadgeRight : styles.reactionBadgeLeft,
              ]}
            >
              <Text style={styles.reactionText}>{reaction}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView
      style={[styles.safe, isCrush && styles.safeCrush]}
      edges={["top", "right", "left", "bottom"]}
    >
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : insets.bottom}
      >
        <View style={[styles.header, isCrush && styles.headerCrush]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            activeOpacity={0.8}
          >
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerCenterRow}
            activeOpacity={0.85}
            onPress={handleOpenProfileFromHeader}
          >
            {otherProfile?.avatar_url ? (
              <Image
                source={{ uri: otherProfile.avatar_url }}
                style={styles.headerAvatar}
              />
            ) : (
              <View style={styles.headerAvatarFallback}>
                <Text style={styles.headerAvatarLetter}>
                  {displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}

            <View style={styles.headerTextBlock}>
              <View style={styles.headerTitleRow}>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {displayName}
                </Text>
                {isCrush && <Text style={styles.headerCrushPill}>💘 Crush</Text>}
              </View>

              {!!presenceLabel && (
                <View style={styles.presenceRow}>
                  <View
                    style={[
                      styles.statusDot,
                      isOnline ? styles.statusDotOnline : styles.statusDotOffline,
                    ]}
                  />
                  <Text style={styles.presenceText}>{presenceLabel}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.headerRightSpacer} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator />
          </View>
        ) : (
          <>
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              onContentSizeChange={() =>
                listRef.current?.scrollToEnd({ animated: true })
              }
            />

            {isSomeoneTyping && (
              <View style={styles.typingContainer}>
                <Text style={styles.typingText}>Alguém está digitando...</Text>
              </View>
            )}

            {replyingTo && (
              <View style={styles.replyBanner}>
                <View style={styles.replyBannerLeft}>
                  <Text style={styles.replyBannerLabel}>
                    Respondendo a{" "}
                    {replyingTo.sender === authUserId ? "você" : "contato"}
                  </Text>
                  <Text style={styles.replyBannerText} numberOfLines={1}>
                    {replyingTo.content && replyingTo.content.trim()
                      ? replyingTo.content.trim()
                      : "[mídia]"}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.replyBannerClose}
                  onPress={() => setReplyingTo(null)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.replyBannerCloseText}>×</Text>
                </TouchableOpacity>
              </View>
            )}

            <View
              style={[
                styles.inputBar,
                { paddingBottom: 10 + insets.bottom },
              ]}
            >
              <TouchableOpacity
                onPress={handlePickMedia}
                style={styles.mediaButton}
                disabled={uploadingMedia}
                activeOpacity={0.8}
              >
                {uploadingMedia ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.mediaIcon}>＋</Text>
                )}
              </TouchableOpacity>

              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="Escreva uma mensagem..."
                placeholderTextColor="#777"
                value={input}
                onChangeText={(text) => {
                  setInput(text);
                  reportTyping(text.trim().length > 0);
                }}
                multiline
              />

              <TouchableOpacity
                style={[
                  styles.sendButton,
                  isCrush ? styles.sendButtonCrush : styles.sendButtonFriend,
                  isDisabled && { opacity: 0.5 },
                ]}
                disabled={isDisabled}
                onPress={handleSend}
                activeOpacity={0.8}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.sendText}>Enviar</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}

        <Modal
          visible={showMessageMenu && !!selectedMessage}
          transparent
          animationType="fade"
          onRequestClose={closeMessageMenu}
        >
          <Pressable
            style={[styles.menuOverlay, isWeb && styles.menuOverlayWeb]}
            onPress={closeMessageMenu}
          >
            <View
              style={[styles.menuContainer, isWeb && styles.menuContainerWeb]}
            >
              <View style={styles.reactionRow}>
                {["❤️", "😂", "😮", "😢", "😡", "👍"].map((emoji) => (
                  <Pressable
                    key={emoji}
                    style={styles.reactionButton}
                    onPress={() => handleReactToMessage(emoji)}
                  >
                    <Text style={styles.reactionEmoji}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.menuDivider} />

              <Pressable
                style={styles.menuItem}
                onPress={handleReplyToMessage}
              >
                <Text style={styles.menuItemText}>Responder</Text>
              </Pressable>

              <Pressable style={styles.menuItem} onPress={handleForwardMessage}>
                <Text style={styles.menuItemText}>Encaminhar</Text>
              </Pressable>

              <Pressable style={styles.menuItem} onPress={handleCopyMessage}>
                <Text style={styles.menuItemText}>Copiar</Text>
              </Pressable>

              {selectedMessage &&
                authUserId &&
                selectedMessage.sender === authUserId && (
                  <Pressable
                    style={styles.menuItem}
                    onPress={handleCancelSendForAll}
                  >
                    <Text
                      style={[
                        styles.menuItemText,
                        styles.menuItemDestructive,
                      ]}
                    >
                      Cancelar envio
                    </Text>
                  </Pressable>
                )}
            </View>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#05050a",
  },
  safeCrush: {
    backgroundColor: "#08030c",
  },
  header: {
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1f1f28",
    backgroundColor: "#05050a",
  },
  headerCrush: {
    backgroundColor: "#12020f",
    borderBottomColor: "#ff4d6d",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  backIcon: {
    color: "#fff",
    fontSize: 22,
  },
  headerCenterRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#222",
  },
  headerAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#26263b",
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarLetter: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  headerTextBlock: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  headerCrushPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#ff4d6d22",
    color: "#ff7a9a",
    fontSize: 12,
    fontWeight: "600",
  },
  presenceRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  statusDotOnline: {
    backgroundColor: "#32d74b",
  },
  statusDotOffline: {
    backgroundColor: "#555",
  },
  presenceText: {
    color: "#b0b0c0",
    fontSize: 11,
  },
  headerRightSpacer: {
    width: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  messageRow: {
    flexDirection: "row",
    marginVertical: 4,
  },
  messageBubbleWrapper: {
    maxWidth: "80%",
    position: "relative",
  },
  bubble: {
    maxWidth: "100%",
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 18,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  bubbleMineFriend: {
    backgroundColor: (Colors as any).brandStart ?? "#6C63FF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 6,
  },
  bubbleMineCrush: {
    backgroundColor: "#ff4d6d",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 6,
  },
  bubbleOther: {
    backgroundColor: "#181820",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 6,
  },
  bubbleTextMine: {
    color: "#fff",
    fontSize: 14,
  },
  bubbleTextOther: {
    color: "#f5f5f5",
    fontSize: 14,
  },
  messageImage: {
    width: 220,
    height: 260,
    borderRadius: 14,
    backgroundColor: "#111",
    marginBottom: 4,
  },
  typingContainer: {
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  typingText: {
    fontSize: 12,
    color: "#aaa",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#191922",
    backgroundColor: "#05050a",
  },
  mediaButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: "#181820",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  mediaIcon: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#0b0b13",
    borderWidth: 1,
    borderColor: "#232336",
    color: "#fff",
    fontSize: 14,
  },
  sendButton: {
    marginLeft: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  sendButtonFriend: {
    backgroundColor: (Colors as any).brandStart ?? "#6C63FF",
  },
  sendButtonCrush: {
    backgroundColor: "#ff4d6d",
  },
  sendText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  deletedBubble: {
    backgroundColor: "transparent",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#444",
    shadowOpacity: 0,
    elevation: 0,
  },
  deletedText: {
    color: "#888",
    fontSize: 12,
    fontStyle: "italic",
  },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#222",
    backgroundColor: "#101010",
  },
  replyBannerLeft: {
    flex: 1,
  },
  replyBannerLabel: {
    color: "#aaa",
    fontSize: 11,
    marginBottom: 2,
  },
  replyBannerText: {
    color: "#fff",
    fontSize: 13,
  },
  replyBannerClose: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  replyBannerCloseText: {
    color: "#fff",
    fontSize: 16,
  },
  replyPreviewInBubble: {
    paddingLeft: 6,
    marginBottom: 4,
  },
  replyPreviewMineBorder: {
    borderLeftWidth: 2,
    borderLeftColor: "rgba(255,255,255,0.7)",
  },
  replyPreviewOtherBorder: {
    borderLeftWidth: 2,
    borderLeftColor: "rgba(255,255,255,0.35)",
  },
  replyPreviewLabel: {
    color: "#ddd",
    fontSize: 11,
    fontWeight: "600",
  },
  replyPreviewText: {
    color: "#ccc",
    fontSize: 12,
  },
  reactionBadge: {
    position: "absolute",
    bottom: -8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: "#15151f",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#33384a",
  },
  reactionBadgeRight: {
    right: 6,
  },
  reactionBadgeLeft: {
    left: 6,
  },
  reactionText: {
    fontSize: 12,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
    paddingBottom: 24,
    paddingHorizontal: 12,
  },
  menuOverlayWeb: {
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 0,
  },
  menuContainer: {
    borderRadius: 20,
    backgroundColor: "#151515",
    paddingVertical: 10,
    paddingHorizontal: 10,
    width: "100%",
  },
  menuContainerWeb: {
    maxWidth: 480,
    width: "90%",
  },
  reactionRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  reactionButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  reactionEmoji: {
    fontSize: 24,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#333",
    marginVertical: 6,
  },
  menuItem: {
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  menuItemText: {
    color: "#fff",
    fontSize: 15,
  },
  menuItemDestructive: {
    color: "#ff4d6d",
  },
});
