// app/conversations/[id].tsx
import Colors from "@/constants/Colors";
import { emitMergeConversationIntoList } from "@/lib/conversationListEvents";
import {
    acceptMessageRequest,
    createDmRequestAfterIntro,
    declineMessageRequest,
    fetchDmRequestForConversation,
    type DmRequestRow,
} from "@/lib/dmRequests";
import { touchUserPresence, useUserPresence } from "@/lib/presence";
import { markFriendDmIntroUsed } from "@/lib/social";
import { supabase } from "@/lib/supabase";
import { useTypingIndicator } from "@/lib/useTypingIndicator";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    Animated as RNAnimated,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

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
  created_at?: string | null;
};

type ProfileHeader = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  relationship_status?: string | null;
  partner_id?: string | null;
};

export default function ConversationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const conversationId = typeof id === "string" ? id : "";

  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [conversationType, setConversationType] =
    useState<"friend" | "crush" | null>(null);

  const [otherProfile, setOtherProfile] = useState<ProfileHeader | null>(null);
  const [conversationCreatedAt, setConversationCreatedAt] = useState<string | null>(null);

  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  /** Amigo sem mútuo: 1 mensagem de abertura; depois bloqueia até o mútuo (coluna friend_dm_intro_used). */
  type FriendIntroGate = "loading" | "open" | "blocked" | "na";
  const [friendDmIntroGate, setFriendDmIntroGate] = useState<FriendIntroGate>("loading");
  const friendIntroMarkAfterSendRef = useRef(false);
  const [dmRequest, setDmRequest] = useState<DmRequestRow | null>(null);

  const isCommittedStatus = (status?: string | null) =>
    status === "committed" || status === "other";

  // ── Crush lock state ──
  const [myRelationshipStatus, setMyRelationshipStatus] = useState<string | null>(null);
  const [myPartnerId, setMyPartnerId] = useState<string | null>(null);

  // Parceiros vinculados ignoram o bloqueio de crush
  const areLinkedPartners = !!(
    myPartnerId && otherProfile?.partner_id &&
    myPartnerId === otherProfile?.id &&
    otherProfile?.partner_id === authUserId
  );

  const isCrushLocked =
    conversationType === "crush" &&
    !areLinkedPartners &&
    (isCommittedStatus(myRelationshipStatus) ||
      isCommittedStatus(otherProfile?.relationship_status));

  const [selectedMessage, setSelectedMessage] = useState<DbMessage | null>(null);
  const [showMessageMenu, setShowMessageMenu] = useState(false);
  const [replyingTo, setReplyingTo] = useState<DbMessage | null>(null);
  const [localReactions, setLocalReactions] = useState<Record<string, string>>(
    {}
  );

  // ── Fullscreen image viewer ──
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);

  // ── Keyboard height tracking for Android ──
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const listRef = useRef<any>(null);
  const inputRef = useRef<any>(null);
  const insets = useSafeAreaInsets();

  let tabBarHeight = 0;
  try {
    tabBarHeight = useBottomTabBarHeight();
  } catch {
    tabBarHeight = 0;
  }

  const { label: presenceLabel, isOnline } = useUserPresence(otherUserId);
  const { isSomeoneTyping: rawTyping, reportTyping } = useTypingIndicator({
    conversationId,
    currentUserId: authUserId,
  });

  // Safety: auto-clear typing indicator after 5s to prevent "stuck typing" ghost
  const [displayTyping, setDisplayTyping] = useState(false);
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (rawTyping) {
      setDisplayTyping(true);
      if (typingClearRef.current) clearTimeout(typingClearRef.current);
      typingClearRef.current = setTimeout(() => {
        setDisplayTyping(false);
      }, 5000);
    } else {
      setDisplayTyping(false);
      if (typingClearRef.current) clearTimeout(typingClearRef.current);
    }
    return () => {
      if (typingClearRef.current) clearTimeout(typingClearRef.current);
    };
  }, [rawTyping]);

  const isSomeoneTyping = displayTyping;

  const isWeb = Platform.OS === "web";
  const isCrush = conversationType === "crush";

  // ── Typing timeout: auto-clear after 3s of no input ──
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInputChange = useCallback(
    (text: string) => {
      setInput(text);
      if (text.trim().length > 0) {
        reportTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          reportTyping(false);
        }, 3000);
      } else {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        reportTyping(false);
      }
    },
    [reportTyping]
  );

  // ── Android keyboard listener ──
  useEffect(() => {
    if (Platform.OS !== "android") return;

    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // ── Message entry animation ──
  const fadeAnim = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    if (messages.length > 0) {
      RNAnimated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [messages.length]);

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

  function base64ToUint8Array(base64: string) {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const lookup: Record<string, number> = {};
    for (let i = 0; i < chars.length; i++) lookup[chars[i]] = i;

    let bufferLength = base64.length * 0.75;
    if (base64.endsWith("==")) bufferLength -= 2;
    else if (base64.endsWith("=")) bufferLength -= 1;

    const bytes = new Uint8Array(bufferLength);
    let p = 0;

    for (let i = 0; i < base64.length; i += 4) {
      const encoded1 = lookup[base64[i]];
      const encoded2 = lookup[base64[i + 1]];
      const encoded3 = lookup[base64[i + 2]];
      const encoded4 = lookup[base64[i + 3]];

      const chunk =
        (encoded1 << 18) |
        (encoded2 << 12) |
        ((encoded3 & 63) << 6) |
        (encoded4 & 63);

      if (p < bufferLength) bytes[p++] = (chunk >> 16) & 255;
      if (p < bufferLength) bytes[p++] = (chunk >> 8) & 255;
      if (p < bufferLength) bytes[p++] = chunk & 255;
    }

    return bytes;
  }

  async function getUploadBodyFromUri(uri: string): Promise<Blob | Uint8Array> {
    if (Platform.OS === "web") {
      // Handle data: URIs explicitly — fetch() is unreliable for large base64 on mobile browsers
      if (uri.startsWith("data:")) {
        const parts = uri.split("base64,");
        const mimeMatch = uri.match(/^data:([^;]+)/);
        const mime = mimeMatch?.[1] ?? "image/jpeg";
        const raw = parts[1] || "";
        const cleaned = raw.replace(/\s/g, "");
        const binaryStr = atob(cleaned);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        return new Blob([bytes], { type: mime });
      }
      // Regular http/blob URIs
      const res = await fetch(uri);
      return await res.blob();
    }

    const localUri = await ensureLocalFileUri(uri);
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return base64ToUint8Array(base64);
  }

  const handleOpenProfileFromHeader = () => {
    if (!otherUserId) return;
    router.push({
      pathname: "/(tabs)/profile",
      params: { userId: otherUserId },
    });
  };

  const refreshDmRequestState = useCallback(async () => {
    if (!conversationId) {
      setDmRequest(null);
      return;
    }
    const row = await fetchDmRequestForConversation(conversationId);
    setDmRequest(row);
  }, [conversationId]);

  const refreshFriendDmIntroGate = useCallback(
    async (uid: string, other: string, convType: "friend" | "crush" | null, convId?: string | null) => {
      friendIntroMarkAfterSendRef.current = false;
      if (convType !== "friend") {
        setFriendDmIntroGate("na");
        return;
      }
      // Já existe pedido pendente como remetente → bloquear novas mensagens mesmo se follows.update falhou antes
      if (convId) {
        const { data: pendingAsSender } = await supabase
          .from("conversation_dm_requests")
          .select("id")
          .eq("conversation_id", convId)
          .eq("sender_id", uid)
          .eq("status", "pending")
          .maybeSingle();
        if (pendingAsSender?.id) {
          setFriendDmIntroGate("blocked");
          return;
        }
      }
      const { data: myRow } = await supabase
        .from("follows")
        .select("interest_type, friend_dm_intro_used")
        .eq("follower_id", uid)
        .eq("following_id", other)
        .maybeSingle();
      const { data: theirRow } = await supabase
        .from("follows")
        .select("interest_type")
        .eq("follower_id", other)
        .eq("following_id", uid)
        .maybeSingle();
      const mine = myRow as { interest_type?: string; friend_dm_intro_used?: boolean } | null;
      const theirs = theirRow as { interest_type?: string } | null;
      if (mine?.interest_type === "friend" && theirs?.interest_type !== "friend") {
        if (mine.friend_dm_intro_used) {
          setFriendDmIntroGate("blocked");
        } else {
          setFriendDmIntroGate("open");
          friendIntroMarkAfterSendRef.current = true;
        }
      } else {
        setFriendDmIntroGate("open");
      }
    },
    []
  );

  const refreshRelationshipLock = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id ?? null;
    if (!uid) return;

    setAuthUserId(uid);

    const { data: myProfile } = await supabase
      .from("profiles")
      .select("relationship_status, partner_id")
      .eq("id", uid)
      .maybeSingle();

    setMyRelationshipStatus((myProfile as any)?.relationship_status ?? null);
    setMyPartnerId((myProfile as any)?.partner_id ?? null);

    if (!conversationId) return;

    const { data: conv } = await supabase
      .from("conversations")
      .select("id, user1, user2, conversation_type, created_at")
      .eq("id", conversationId)
      .maybeSingle();

    if (!conv) return;

    const conversation = conv as ConversationRow;
    setConversationCreatedAt(conversation.created_at ?? null);
    const other =
      conversation.user1 === uid
        ? conversation.user2
        : conversation.user2 === uid
        ? conversation.user1
        : null;

    setConversationType(conversation.conversation_type);
    setOtherUserId(other);

    if (!other) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url, relationship_status, partner_id")
      .eq("id", other)
      .maybeSingle();

    if (profile) {
      setOtherProfile(profile as ProfileHeader);
    }

    if (other) {
      await refreshFriendDmIntroGate(uid, other, conversation.conversation_type, conversation.id);
    }
    await refreshDmRequestState();
  }, [conversationId, refreshFriendDmIntroGate, refreshDmRequestState]);

  async function syncConversationAfterSend(params: {
    preview: string;
    sentAt: string;
  }) {
    const { preview, sentAt } = params;

    // Não fazer upsert em conversation_deletions aqui: reabrir (+ / perfil) já marca
    // hidden_from_inbox=false. Upsert extra no envio gerava 403 (RLS) e falhava em silêncio.

    const { error: conversationUpdateError } = await supabase
      .from("conversations")
      .update({
        last_message: preview,
        last_message_at: sentAt,
      })
      .eq("id", conversationId);

    if (conversationUpdateError) {
      console.warn("conversation sync error:", conversationUpdateError);
    }
  }

  function notifyInboxListAfterSend(preview: string, sentAt: string) {
    if (!conversationId || !otherUserId || !conversationType) return;
    emitMergeConversationIntoList({
      id: conversationId,
      conversation_type: conversationType,
      last_message: preview,
      last_message_at: sentAt,
      created_at: conversationCreatedAt,
      other_user_id: otherUserId,
      other_user_username: otherProfile?.username ?? null,
      other_user_full_name: otherProfile?.full_name ?? null,
      other_user_avatar: otherProfile?.avatar_url ?? null,
    });
  }

  // ── Delete entire conversation (hide for current user) ──
  async function handleDeleteConversation() {
    if (!authUserId || !conversationId) return;

    Alert.alert(
      "Excluir conversa",
      "Tem certeza que deseja excluir esta conversa? Ela será removida da sua lista.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            const now = new Date().toISOString();
            await supabase
              .from("conversation_deletions")
              .upsert(
                {
                  conversation_id: conversationId,
                  user_id: authUserId,
                  deleted_at: now,
                  messages_hidden_before: now,
                  hidden_from_inbox: true,
                },
                { onConflict: "conversation_id,user_id" }
              );
            router.back();
          },
        },
      ]
    );
  }


  async function getMessageCutoffForUser(userId: string, targetConversationId: string) {
    const { data: deletionRow } = await supabase
      .from("conversation_deletions")
      .select("messages_hidden_before")
      .eq("conversation_id", targetConversationId)
      .eq("user_id", userId)
      .maybeSingle();

    return (deletionRow as { messages_hidden_before?: string | null } | null)?.messages_hidden_before ?? null;
  }

  const displayName =
    otherProfile?.full_name?.trim() ||
    otherProfile?.username?.trim() ||
    (isCrush ? "Conversa Crush" : "Conversa");

  // Removed old scroll effect - using inverted FlatList now

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

        const { data: myProfile } = await supabase
          .from("profiles")
          .select("relationship_status, partner_id")
          .eq("id", uid)
          .maybeSingle();
        setMyRelationshipStatus((myProfile as any)?.relationship_status ?? null);
        setMyPartnerId((myProfile as any)?.partner_id ?? null);

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
          await refreshFriendDmIntroGate(uid, other, c.conversation_type, conversationId);
        } else {
          setFriendDmIntroGate("na");
        }

        if (other) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, username, full_name, avatar_url, relationship_status, partner_id")
            .eq("id", other)
            .maybeSingle();

          if (profile && isMounted) {
            setOtherProfile(profile as ProfileHeader);
          }
        }

        const cutoff = await getMessageCutoffForUser(uid, conversationId);

        let messagesQuery = supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true });

        if (cutoff) {
          messagesQuery = messagesQuery.gt("created_at", cutoff);
        }

        const { data: msgs, error: msgErr } = await messagesQuery;

        if (!msgErr && isMounted) {
          setMessages((msgs || []) as DbMessage[]);

          // Mark other user's unread messages as read immediately
          if (other) {
            supabase
              .from("messages")
              .update({ is_read: true })
              .eq("conversation_id", conversationId)
              .eq("sender", other)
              .eq("is_read", false)
              .then(() => {});
          }
        }

        if (isMounted) await refreshDmRequestState();
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (conversationId) load();

    return () => {
      isMounted = false;
    };
  }, [conversationId, router, refreshFriendDmIntroGate, refreshDmRequestState]);

  useFocusEffect(
    useCallback(() => {
      refreshRelationshipLock();

      // Clean up typing status when leaving
      return () => {
        reportTyping(false);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        // Also delete any stale typing record for this user
        if (authUserId && conversationId) {
          supabase
            .from("conversation_typing")
            .delete()
            .eq("conversation_id", conversationId)
            .eq("user_id", authUserId)
            .then(() => {});
        }
      };
    }, [refreshRelationshipLock, authUserId, conversationId, reportTyping])
  );

  useEffect(() => {
    if (!conversationId || !authUserId) return;

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
        async (payload: any) => {
          const msg = payload.new as DbMessage;
          const cutoff = await getMessageCutoffForUser(authUserId, conversationId);

          if (cutoff && msg.created_at <= cutoff) return;

          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg].sort((a: DbMessage, b: DbMessage) =>
              a.created_at.localeCompare(b.created_at)
            );
          });

          // Auto mark as read if from other user (user is viewing this conversation)
          if (msg.sender !== authUserId) {
            supabase
              .from("messages")
              .update({ is_read: true })
              .eq("id", msg.id)
              .then(() => {});
          }
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
        async (payload: any) => {
          const updated = payload.new as DbMessage;
          const cutoff = await getMessageCutoffForUser(authUserId, conversationId);

          if (cutoff && updated.created_at <= cutoff) return;

          setMessages((prev) => {
            const exists = prev.some((m) => m.id === updated.id);
            if (!exists) return prev;
            return prev
              .map((m) => (m.id === updated.id ? updated : m))
              .sort((a: DbMessage, b: DbMessage) => a.created_at.localeCompare(b.created_at));
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, authUserId]);

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

  async function applyFriendIntroAfterSend() {
    if (!friendIntroMarkAfterSendRef.current || !authUserId || !otherUserId || !conversationId) return;
    friendIntroMarkAfterSendRef.current = false;

    // Pedido na caixa "Pedidos" do destinatário deve existir sempre após a 1ª DM (independente do UPDATE em follows).
    const { ok: requestOk, error: requestErr } = await createDmRequestAfterIntro({
      conversationId,
      senderId: authUserId,
      recipientId: otherUserId,
    });
    if (!requestOk && requestErr) {
      console.warn("createDmRequestAfterIntro failed — destinatário pode não ver em Pedidos:", requestErr);
    }

    const { error: markErr } = await markFriendDmIntroUsed(authUserId, otherUserId);
    if (markErr) {
      console.warn("markFriendDmIntroUsed failed:", markErr);
    }

    setFriendDmIntroGate("blocked");
  }

  async function handleAcceptMessageRequest() {
    if (!conversationId || !authUserId || !otherUserId) return;
    try {
      await acceptMessageRequest(conversationId);
      await refreshDmRequestState();
      await refreshFriendDmIntroGate(authUserId, otherUserId, conversationType, conversationId);
    } catch (e: any) {
      Alert.alert("Erro", e?.message ?? "Não foi possível aceitar o pedido.");
    }
  }

  function handleDeclineMessageRequest() {
    Alert.alert(
      "Recusar pedido?",
      "Esta conversa sai da caixa de pedidos. Você pode se conectar depois pelo perfil.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Recusar",
          style: "destructive",
          onPress: async () => {
            if (!conversationId) return;
            try {
              await declineMessageRequest(conversationId);
              router.back();
            } catch (e: any) {
              Alert.alert("Erro", e?.message ?? "Tente novamente.");
            }
          },
        },
      ]
    );
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || !authUserId || !conversationId || sending) return;
    if (conversationType === "friend" && friendDmIntroGate === "loading") return;
    if (conversationType === "friend" && friendDmIntroGate === "blocked") {
      Alert.alert(
        "Mensagem de abertura usada",
        "Você já enviou sua primeira mensagem. Quando a outra pessoa seguir de volta como amigo, a conversa continua livremente — como no Instagram."
      );
      return;
    }
    if (
      conversationType === "friend" &&
      dmRequest?.status === "pending" &&
      dmRequest.recipient_id === authUserId
    ) {
      Alert.alert(
        "Pedido pendente",
        "Aceite o pedido de mensagem para responder — ou recuse na barra acima."
      );
      return;
    }
    if (isCrushLocked) {
      Alert.alert(
        "🔒 Conversa bloqueada",
        "Você não pode enviar mensagens de crush enquanto um dos perfis estiver namorando ou casado(a)."
      );
      return;
    }

    setSending(true);
    setInput("");
    reportTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

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
        if (withoutTemp.some((m) => m.id === real.id)) return withoutTemp;
        return [...withoutTemp, real].sort((a: DbMessage, b: DbMessage) =>
          a.created_at.localeCompare(b.created_at)
        );
      });

      const sentAt = real.created_at || new Date().toISOString();

      await syncConversationAfterSend({
        preview: text,
        sentAt,
      });
      await applyFriendIntroAfterSend();
      notifyInboxListAfterSend(text, sentAt);

      // ── Push notification para o outro usuário ──
      if (otherUserId && otherUserId !== authUserId) {
        const { data: myProfile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", authUserId)
          .single();

        const myUsername = myProfile?.username ?? "Alguém";
        supabase.functions.invoke("send-push", {
          body: {
            recipientId: otherUserId,
            title: myUsername,
            body: text.length > 80 ? text.slice(0, 80) + "…" : text,
            data: { type: "message", conversationId },
          },
        }).catch(() => {});
      }

    } catch (e: any) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      if ((e?.message ?? "").includes("CRUSH_CHAT_LOCKED")) {
        Alert.alert(
          "🔒 Conversa bloqueada",
          "O banco bloqueou essa mensagem porque a conversa de crush não está mais disponível."
        );
      }
    } finally {
      setSending(false);
      setReplyingTo(null);
    }
  }

  async function handlePickMedia() {
    if (!authUserId || !conversationId || uploadingMedia) return;
    if (conversationType === "friend" && friendDmIntroGate === "blocked") {
      Alert.alert(
        "Mensagem de abertura usada",
        "Envie uma nova mensagem quando houver follow mútuo como amigos."
      );
      return;
    }
    if (
      conversationType === "friend" &&
      dmRequest?.status === "pending" &&
      dmRequest.recipient_id === authUserId
    ) {
      Alert.alert("Pedido pendente", "Aceite o pedido para enviar mídia.");
      return;
    }
    if (conversationType === "friend" && friendDmIntroGate === "loading") return;
    if (isCrushLocked) {
      Alert.alert(
        "🔒 Conversa bloqueada",
        "Você não pode enviar mídia em conversa de crush enquanto um dos perfis estiver namorando ou casado(a)."
      );
      return;
    }

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

      const tempId = `temp-media-${Date.now()}`;
      const optimisticMsg: DbMessage = {
        id: tempId,
        conversation_id: conversationId,
        sender: authUserId,
        content: "",
        media_url: asset.uri,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      const uri = await ensureLocalFileUri(asset.uri);
      const guessedName =
        (asset as any).fileName ?? uri.split("/").pop() ?? "image";
      const fileExt = guessedName.split(".").pop() ?? "jpg";
      const filePath = `${conversationId}/${Date.now()}-${authUserId}.${fileExt}`;

      const body = await getUploadBodyFromUri(uri);

      const { error: uploadError } = await supabase.storage
        .from("conversation_media")
        .upload(filePath, body as any, {
          contentType: asset.mimeType ?? "image/jpeg",
          upsert: false,
        });

      if (uploadError) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
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
        throw insertError;
      }

      const real = inserted as DbMessage;

      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        if (withoutTemp.some((m) => m.id === real.id)) return withoutTemp;
        return [...withoutTemp, real].sort((a: DbMessage, b: DbMessage) =>
          a.created_at.localeCompare(b.created_at)
        );
      });

      const mediaSentAt = real.created_at || new Date().toISOString();

      await syncConversationAfterSend({
        preview: "[mídia]",
        sentAt: mediaSentAt,
      });
      await applyFriendIntroAfterSend();
      notifyInboxListAfterSend("[mídia]", mediaSentAt);

    } catch (e: any) {
      if ((e?.message ?? "").includes("CRUSH_CHAT_LOCKED")) {
        Alert.alert(
          "🔒 Conversa bloqueada",
          "O banco bloqueou essa mídia porque a conversa de crush não está mais disponível."
        );
      }
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

  const recipientRequestPending =
    conversationType === "friend" &&
    dmRequest?.status === "pending" &&
    dmRequest.recipient_id === authUserId;

  const senderRequestPending =
    conversationType === "friend" &&
    dmRequest?.status === "pending" &&
    dmRequest.sender_id === authUserId;

  const friendDmLocked =
    conversationType === "friend" &&
    (friendDmIntroGate === "blocked" || friendDmIntroGate === "loading");

  const messagingLocked = friendDmLocked || recipientRequestPending;

  const isDisabled = !input.trim() || sending || messagingLocked;

  // ── Format timestamp ──
  function formatTime(dateStr: string) {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  const renderItem = ({ item, index }: { item: DbMessage; index: number }) => {
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
    const time = formatTime(item.created_at);

    return (
      <RNAnimated.View
        style={[
          styles.messageRow,
          { justifyContent: isMine ? "flex-end" : "flex-start" },
          { opacity: fadeAnim },
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
                    {repliedMessage.sender === authUserId ? "Você" : displayName}
                  </Text>
                  <Text style={styles.replyPreviewText} numberOfLines={1}>
                    {repliedMessage.content && repliedMessage.content.trim()
                      ? repliedMessage.content.trim()
                      : "[mídia]"}
                  </Text>
                </View>
              )}

              {hasMedia && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setFullscreenImageUri(item.media_url!)}
                >
                  <Image
                    source={{ uri: item.media_url! }}
                    style={styles.messageImage}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              )}

              {hasText && (
                <Text
                  style={isMine ? styles.bubbleTextMine : styles.bubbleTextOther}
                >
                  {displayText}
                </Text>
              )}

              <Text style={styles.timestampText}>{time}</Text>
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
      </RNAnimated.View>
    );
  };

  // ── Compute bottom padding for Android keyboard ──
  const androidBottomPad = Platform.OS === "android" ? keyboardHeight : 0;

  return (
    <SafeAreaView
      style={[styles.safe, isCrush && styles.safeCrush]}
      edges={["top", "right", "left"]}
    >
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? tabBarHeight : 0}
      >
        {/* ── Header ── */}
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

              {isSomeoneTyping ? (
                <Text style={styles.typingInlineText}>digitando...</Text>
              ) : presenceLabel ? (
                <View style={styles.presenceRow}>
                  <View
                    style={[
                      styles.statusDot,
                      isOnline ? styles.statusDotOnline : styles.statusDotOffline,
                    ]}
                  />
                  <Text style={styles.presenceText}>{presenceLabel}</Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleDeleteConversation}
            style={styles.headerMenuButton}
            activeOpacity={0.8}
          >
            <Text style={styles.headerMenuIcon}>⋯</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#888" />
          </View>
        ) : isCrushLocked ? (
          /* ── Crush locked overlay ── */
          <View style={styles.crushLockedOverlay}>
            <Text style={{ fontSize: 56, marginBottom: 16 }}>🔒</Text>
            <Text style={styles.crushLockedTitle}>Conversa bloqueada</Text>
            <Text style={styles.crushLockedSubtext}>
              Enquanto seu status for comprometido, conversas de crush ficam ocultas. Suas mensagens não foram apagadas — mude para Solteiro para desbloquear.
            </Text>
            <TouchableOpacity
              style={styles.crushLockedBackBtn}
              onPress={() => router.back()}
              activeOpacity={0.8}
            >
              <Text style={styles.crushLockedBackText}>← Voltar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.flex1}>
            <FlatList
              ref={listRef}
              data={[...messages].reverse()}
              inverted
              keyExtractor={(item) => String(item.id)}
              renderItem={renderItem}
              contentContainerStyle={[
                styles.listContent,
                Platform.OS === "android" && { paddingBottom: 8 },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            />

            {recipientRequestPending && (
              <View style={styles.dmRequestBanner}>
                <Text style={styles.dmRequestBannerTitle}>✉️ Pedido de mensagem</Text>
                <Text style={styles.dmRequestBannerSub}>
                  Alguém enviou uma mensagem de abertura. Aceite para responder — ou recuse.
                </Text>
                <View style={styles.dmRequestActions}>
                  <TouchableOpacity
                    style={styles.dmRequestBtnSecondary}
                    onPress={handleDeclineMessageRequest}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.dmRequestBtnSecondaryText}>Recusar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dmRequestBtnPrimary}
                    onPress={handleAcceptMessageRequest}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.dmRequestBtnPrimaryText}>Aceitar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {senderRequestPending && (
              <View style={styles.dmRequestSenderBanner}>
                <Text style={styles.dmRequestSenderBannerText}>
                  ⏳ Pedido enviado — quando a pessoa aceitar, vocês conversam com liberdade na caixa de entrada.
                </Text>
              </View>
            )}

            {conversationType === "friend" &&
              friendDmIntroGate === "blocked" &&
              !recipientRequestPending && (
              <View style={styles.friendIntroBanner}>
                <Text style={styles.friendIntroBannerText}>
                  Você usou sua mensagem de abertura. A conversa continua quando a outra pessoa seguir de volta.
                </Text>
              </View>
            )}

            {replyingTo && (
              <View style={styles.replyBanner}>
                <View style={styles.replyBannerLeft}>
                  <Text style={styles.replyBannerLabel}>
                    Respondendo a{" "}
                    {replyingTo.sender === authUserId ? "você" : displayName}
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
                {
                  paddingBottom:
                    10 +
                    (Platform.OS === "android"
                      ? Math.min(insets.bottom, 8)
                      : insets.bottom),
                },
              ]}
            >
              <TouchableOpacity
                onPress={handlePickMedia}
                style={styles.mediaButton}
                disabled={uploadingMedia || messagingLocked}
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
                placeholderTextColor="#666"
                value={input}
                onChangeText={handleInputChange}
                multiline
                editable={!messagingLocked}
              />

              <TouchableOpacity
                style={[
                  styles.sendButton,
                  isCrush ? styles.sendButtonCrush : styles.sendButtonFriend,
                  isDisabled && { opacity: 0.4 },
                ]}
                disabled={isDisabled}
                onPress={handleSend}
                activeOpacity={0.8}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.sendText}>➤</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Message action menu ── */}
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
                <Text style={styles.menuItemText}>↩ Responder</Text>
              </Pressable>

              <Pressable style={styles.menuItem} onPress={handleForwardMessage}>
                <Text style={styles.menuItemText}>↗ Encaminhar</Text>
              </Pressable>

              <Pressable style={styles.menuItem} onPress={handleCopyMessage}>
                <Text style={styles.menuItemText}>📋 Copiar</Text>
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
                      🗑 Cancelar envio
                    </Text>
                  </Pressable>
                )}
            </View>
          </Pressable>
        </Modal>

        {/* ── Fullscreen image viewer ── */}
        <Modal
          visible={!!fullscreenImageUri}
          transparent
          animationType="fade"
          onRequestClose={() => setFullscreenImageUri(null)}
        >
          <View style={styles.fullscreenOverlay}>
            <TouchableOpacity
              style={styles.fullscreenCloseBtn}
              onPress={() => setFullscreenImageUri(null)}
              activeOpacity={0.8}
            >
              <Text style={styles.fullscreenCloseText}>✕</Text>
            </TouchableOpacity>

            <ScrollView
              style={styles.flex1}
              contentContainerStyle={styles.fullscreenScrollContent}
              maximumZoomScale={4}
              minimumZoomScale={1}
              bouncesZoom
              centerContent
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
            >
              {fullscreenImageUri && (
                <Image
                  source={{ uri: fullscreenImageUri }}
                  style={styles.fullscreenImage}
                  resizeMode="contain"
                />
              )}
            </ScrollView>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  crushLockedOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  crushLockedTitle: {
    color: "#ccc",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  crushLockedSubtext: {
    color: "#777",
    fontSize: 13,
    textAlign: "center",
    maxWidth: 300,
    lineHeight: 19,
  },
  crushLockedBackBtn: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  crushLockedBackText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  safe: {
    flex: 1,
    backgroundColor: "#06060e",
  },
  safeCrush: {
    backgroundColor: "#0a0410",
  },
  header: {
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1a1a24",
    backgroundColor: "#08080f",
  },
  headerCrush: {
    backgroundColor: "#10050e",
    borderBottomColor: "#ff4d6d44",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  backIcon: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "300",
  },
  headerCenterRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#222",
    borderWidth: 1.5,
    borderColor: "#2a2a3a",
  },
  headerAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1e1e30",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#2a2a3a",
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
    gap: 8,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    flexShrink: 1,
  },
  headerCrushPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#ff4d6d22",
    color: "#ff7a9a",
    fontSize: 11,
    fontWeight: "600",
    overflow: "hidden",
  },
  headerMenuButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  headerMenuIcon: {
    color: "#aaa",
    fontSize: 20,
    fontWeight: "700",
  },
  presenceRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 5,
  },
  statusDotOnline: {
    backgroundColor: "#32d74b",
  },
  statusDotOffline: {
    backgroundColor: "#555",
  },
  presenceText: {
    color: "#888",
    fontSize: 11,
  },
  typingInlineText: {
    marginTop: 2,
    color: "#32d74b",
    fontSize: 11,
    fontStyle: "italic",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexGrow: 1,
  },
  messageRow: {
    flexDirection: "row",
    marginVertical: 3,
  },
  messageBubbleWrapper: {
    maxWidth: "78%",
    position: "relative",
  },
  bubble: {
    maxWidth: "100%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  bubbleMineFriend: {
    backgroundColor: (Colors as any).brandStart ?? "#6C63FF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 6,
  },
  bubbleMineCrush: {
    backgroundColor: "#ff4d6d",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 6,
  },
  bubbleOther: {
    backgroundColor: "#151520",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    borderBottomLeftRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#222233",
  },
  bubbleTextMine: {
    color: "#fff",
    fontSize: 14.5,
    lineHeight: 20,
  },
  bubbleTextOther: {
    color: "#eee",
    fontSize: 14.5,
    lineHeight: 20,
  },
  timestampText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
    textAlign: "right",
    marginTop: 4,
  },
  messageImage: {
    width: 220,
    height: 260,
    borderRadius: 16,
    backgroundColor: "#111",
    marginBottom: 4,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#1a1a24",
    backgroundColor: "#08080f",
  },
  mediaButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#1a1a28",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
    marginBottom: 1,
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#0d0d16",
    borderWidth: 1,
    borderColor: "#1e1e30",
    color: "#fff",
    fontSize: 14,
  },
  sendButton: {
    marginLeft: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
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
    fontSize: 18,
  },
  deletedBubble: {
    backgroundColor: "transparent",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#333",
    shadowOpacity: 0,
    elevation: 0,
  },
  deletedText: {
    color: "#666",
    fontSize: 12,
    fontStyle: "italic",
  },
  friendIntroBanner: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#2a2438",
    backgroundColor: "rgba(108,99,255,0.12)",
  },
  friendIntroBannerText: {
    color: "#c4b5fd",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  dmRequestBanner: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#333",
    backgroundColor: "rgba(34,197,94,0.1)",
  },
  dmRequestBannerTitle: {
    color: "#86efac",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
    textAlign: "center",
  },
  dmRequestBannerSub: {
    color: "#a7f3d0",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
    marginBottom: 10,
  },
  dmRequestActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
  dmRequestBtnSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  dmRequestBtnSecondaryText: {
    color: "#e5e5e5",
    fontSize: 14,
    fontWeight: "600",
  },
  dmRequestBtnPrimary: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: "#22c55e",
  },
  dmRequestBtnPrimaryText: {
    color: "#052e16",
    fontSize: 14,
    fontWeight: "700",
  },
  dmRequestSenderBanner: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#333",
    backgroundColor: "rgba(251,191,36,0.12)",
  },
  dmRequestSenderBannerText: {
    color: "#fcd34d",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#1a1a24",
    backgroundColor: "#0c0c14",
  },
  replyBannerLeft: {
    flex: 1,
  },
  replyBannerLabel: {
    color: "#888",
    fontSize: 11,
    marginBottom: 2,
  },
  replyBannerText: {
    color: "#ddd",
    fontSize: 13,
  },
  replyBannerClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a1a28",
  },
  replyBannerCloseText: {
    color: "#fff",
    fontSize: 16,
  },
  replyPreviewInBubble: {
    paddingLeft: 8,
    marginBottom: 6,
  },
  replyPreviewMineBorder: {
    borderLeftWidth: 2,
    borderLeftColor: "rgba(255,255,255,0.7)",
  },
  replyPreviewOtherBorder: {
    borderLeftWidth: 2,
    borderLeftColor: "rgba(255,255,255,0.3)",
  },
  replyPreviewLabel: {
    color: "#ddd",
    fontSize: 11,
    fontWeight: "600",
  },
  replyPreviewText: {
    color: "#bbb",
    fontSize: 12,
  },
  reactionBadge: {
    position: "absolute",
    bottom: -8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: "#12121e",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#2a2a3a",
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
    backgroundColor: "rgba(0,0,0,0.55)",
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
    borderRadius: 22,
    backgroundColor: "#141420",
    paddingVertical: 12,
    paddingHorizontal: 12,
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
    paddingBottom: 8,
  },
  reactionButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  reactionEmoji: {
    fontSize: 28,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#2a2a3a",
    marginVertical: 6,
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  menuItemText: {
    color: "#eee",
    fontSize: 15,
  },
  menuItemDestructive: {
    color: "#ff4d6d",
  },
  // ── Fullscreen image viewer ──
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
  },
  fullscreenCloseBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenCloseText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "600",
  },
  fullscreenScrollContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenImage: {
    width: SCREEN_W,
    height: SCREEN_H * 0.8,
  },
});
