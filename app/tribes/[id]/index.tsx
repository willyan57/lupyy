import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { Buffer } from "buffer";
import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

type Tribe = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  cover_url: string | null;
  members_count: number;
  is_public: boolean;
  created_at: string;
  owner_id: string;
};

type TribePost = {
  id: string;
  tribe_id: string;
  user_id: string;
  content: string | null;
  media_url: string | null;
  created_at: string;
};

type TribeChannel = {
  id: string;
  tribe_id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  is_private: boolean;
  created_by: string | null;
  created_at: string;
};

type TribeMessage = {
  id: string;
  tribe_id: string;
  channel_id: string;
  user_id: string;
  content: string;
  created_at: string;
  is_deleted?: boolean;
  deleted_by_role?: "owner" | "moderator";
  deleted_at?: string;
  reactions?: { emoji: string; count: number }[];
};

type TribeMessageDeletion = {
  message_id: string;
  tribe_id: string;
  channel_id: string;
  deleted_by: string;
  deleted_by_role: "owner" | "moderator";
  deleted_at: string;
};

type TribeMessageReaction = {
  message_id: string;
  tribe_id: string;
  channel_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};



type TribeMemberDetailed = {
  tribe_id: string;
  user_id: string;
  role: "owner" | "moderator" | "member";
  joined_at: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};


type TabKey = "feed" | "chat" | "ranking" | "about" | "members";

const tabs: { key: TabKey; label: string }[] = [
  { key: "feed", label: "Feed" },
  { key: "chat", label: "Chat" },
  { key: "ranking", label: "Ranking" },
  { key: "members", label: "Membros" },
  { key: "about", label: "Sobre" },
];

export default function TribeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const goBackToTribes = () => {
    try {
      router.replace("/tribes" as any);
    } catch (e) {
      // fallback
      try {
        router.push("/tribes" as any);
      } catch {}
    }
  };
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();
  const isLargeWeb = Platform.OS === "web" && width >= 1024;

const getCoverUri = (raw: string | null) => {
  if (!raw) return null;
  const v = String(raw);
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  const { data } = supabase.storage.from("tribes").getPublicUrl(v);
  return data?.publicUrl ?? null;
};


const guessContentTypeFromExt = (ext: string) => {
  const e = ext.toLowerCase();
  if (e === "png") return "image/png";
  if (e === "webp") return "image/webp";
  if (e === "gif") return "image/gif";
  return "image/jpeg";
};

const prepareCoverImage = async (uri: string) => {
  try {
    const out = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1600 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
    );
    return { uri: out.uri, ext: "jpg", contentType: "image/jpeg" };
  } catch {
    const clean = uri.split("?")[0];
    const ext = (clean.split(".").pop() || "jpg").toLowerCase();
    return { uri, ext, contentType: guessContentTypeFromExt(ext) };
  }
};

const uriToUploadBody = async (uri: string) => {
  if (Platform.OS === "web") {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    const ct = (blob as any)?.type || "image/jpeg";
    return { body: blob as any, contentType: ct };
  }

  let readUri = uri;
  if (readUri.startsWith("content://")) {
    const target = `${FileSystem.cacheDirectory || ""}tribe_cover_${Date.now()}`;
    try {
      await FileSystem.copyAsync({ from: readUri, to: target });
      readUri = target;
    } catch {}
  }

  const base64 = await FileSystem.readAsStringAsync(readUri, { encoding: FileSystem.EncodingType.Base64 });
  const buffer = Buffer.from(base64, "base64");
  return { body: buffer as any, contentType: null as any };
};


  const [tribe, setTribe] = useState<Tribe | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("feed");
  const chatScrollRef = useRef<ScrollView>(null);

  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canManageMembers, setCanManageMembers] = useState(false);
  const [canManageChannels, setCanManageChannels] = useState(false);
  const [canManageRoles, setCanManageRoles] = useState(false);
  const [canManageMessages, setCanManageMessages] = useState(false);

const [myRole, setMyRole] = useState<"owner" | "moderator" | "member" | null>(null);

const [uploadingCover, setUploadingCover] = useState(false);
const [coverActionsVisible, setCoverActionsVisible] = useState(false);

// MEMBERS
const [members, setMembers] = useState<TribeMemberDetailed[]>([]);
const [membersLoading, setMembersLoading] = useState(false);
const [memberModalVisible, setMemberModalVisible] = useState(false);
const [selectedMember, setSelectedMember] = useState<TribeMemberDetailed | null>(null);


  // FEED
  const [posts, setPosts] = useState<TribePost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [creatingPost, setCreatingPost] = useState(false);
  const [newPostContent, setNewPostContent] = useState("");

  // CHAT
  const [channels, setChannels] = useState<TribeChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<TribeMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [sendingChat, setSendingChat] = useState(false);
  const [newChatMessage, setNewChatMessage] = useState("");

  const [messageActionsVisible, setMessageActionsVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<TribeMessage | null>(null);
  const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);
  const [replyingTo, setReplyingTo] = useState<TribeMessage | null>(null);


  const [channelModalVisible, setChannelModalVisible] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelType, setNewChannelType] = useState<"text" | "voice">("text");


  // ---------- CARREGAR TRIBO ----------
  useEffect(() => {
    if (!id) return;

    let isMounted = true;

    const load = async () => {
      setLoading(true);

      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData?.user?.id ?? null;
      if (isMounted) setUserId(currentUserId);

      const { data: tribeData, error: tribeError } = await supabase
        .from("tribes")
        .select("*")
        .eq("id", id)
        .single();

      if (tribeError) {
        setLoading(false);
        return;
      }

      if (isMounted && tribeData) {
        setTribe(tribeData as Tribe);
        // sempre pega contagem real de membros (evita ficar 1 na web)
        refreshMembersCount(id as string);
      }

      if (isMounted) setLoading(false);
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [id]);

  // ---------- MEMBERSHIP + FEED ----------
  useEffect(() => {
    if (!id) return;

    let isMounted = true;

    const loadMembershipAndPosts = async () => {
      setMembershipLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData?.user?.id ?? null;

      if (currentUserId && isMounted) {
        const { data: membershipData, error: membershipErr } = await supabase
          .from("tribe_members")
          .select("role")
          .eq("tribe_id", id)
          .eq("user_id", currentUserId)
          .maybeSingle();

        const memberExists = !!membershipData && !membershipErr;
        if (isMounted) {
          setIsMember(memberExists);
        }

        if (memberExists) {
          const role = (membershipData as any)?.role as
            | "owner"
            | "moderator"
            | "member"
            | undefined;

          const safeRole =
            role === "owner" || role === "moderator" || role === "member"
              ? role
              : "member";

          if (isMounted) {
            setMyRole(safeRole);
            const owner = safeRole === "owner";
            const moderator = safeRole === "moderator";

            setIsOwner(owner);
            setIsAdmin(owner || moderator);
            setCanManageMembers(owner || moderator);
            setCanManageChannels(owner || moderator);
            setCanManageRoles(owner);
            setCanManageMessages(owner || moderator);
          }
        } else if (isMounted) {
          setMyRole(null);
          setIsOwner(false);
          setIsAdmin(false);
          setCanManageMembers(false);
          setCanManageChannels(false);
          setCanManageRoles(false);
          setCanManageMessages(false);
        }
      }

      setPostsLoading(true);
      const { data: postsData } = await supabase
        .from("tribe_posts")
        .select("*")
        .eq("tribe_id", id)
        .order("created_at", { ascending: false });

      if (isMounted && postsData) {
        setPosts(postsData as TribePost[]);
      }
      if (isMounted) setPostsLoading(false);
      if (isMounted) setMembershipLoading(false);
    };

    loadMembershipAndPosts();

    return () => {
      isMounted = false;
    };
  }, [id]);

  const loadChannels = async (opts?: { forceSelectFirst?: boolean; selectChannelId?: string | null }) => {
    if (!id) return;
    setChannelsLoading(true);
    const { data, error } = await supabase
      .from("tribe_channels")
      .select("*")
      .eq("tribe_id", id)
      .order("created_at", { ascending: true });

    if (!error && data) {
      const list = data as TribeChannel[];
      setChannels(list);

      const desired = opts?.selectChannelId ?? null;

      setActiveChannelId((prev) => {
        if (desired) return desired;
        if (!prev || opts?.forceSelectFirst) {
          const geral = list.find((c) => c.slug === "geral") ?? (list.length > 0 ? list[0] : null);
          return geral ? geral.id : null;
        }
        const stillExists = list.some((c) => c.id === prev);
        if (!stillExists) {
          const geral = list.find((c) => c.slug === "geral") ?? (list.length > 0 ? list[0] : null);
          return geral ? geral.id : null;
        }
        return prev;
      });
    }
    setChannelsLoading(false);
  };

  const createChannel = async () => {
    if (!id) return;
    if (!canManageChannels) return;

    const cleanName = newChannelName.trim();
    if (!cleanName.length) return;

    const slug = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    const { data: authData } = await supabase.auth.getUser();
    const currentUserId = authData?.user?.id ?? userId ?? null;

    const { data, error } = await supabase
      .from("tribe_channels")
      .insert({
        tribe_id: id,
        name: cleanName,
        slug: slug || "canal",
        type: newChannelType,
        is_private: false,
        created_by: currentUserId,
      } as any)
      .select("id")
      .single();

    if (error) {
      Alert.alert("Ops", (error as any)?.message || "Não foi possível criar o canal.");
      return;
    }

    setChannelModalVisible(false);
    setNewChannelName("");
    setNewChannelType("text");

    const newId = (data as any)?.id as string | undefined;
    await loadChannels({ selectChannelId: newId ?? null, forceSelectFirst: true });
  };

  // ---------- CANAIS ----------
  useEffect(() => {
    if (!id) return;
    let isMounted = true;

    const run = async () => {
      if (!isMounted) return;
      await loadChannels();
    };

    run();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  // ---------- MENSAGENS DO CANAL ATUAL ----------
  useEffect(() => {
    if (!activeChannelId || !id) {
      setChatMessages([]);
      return;
    }

    let isMounted = true;

    const loadMessages = async () => {
      setChatLoading(true);
      const { data, error } = await supabase
        .from("tribe_messages")
        .select("*")
        .eq("tribe_id", id)
        .eq("channel_id", activeChannelId)
        .order("created_at", { ascending: true });

      if (!isMounted) return;

      if (!error && data) {
        const hydrated = await applyMessageMeta(data as TribeMessage[]);
        if (!isMounted) return;
        setChatMessages(hydrated);
      }
      setChatLoading(false);
    };

    loadMessages();

    return () => {
      isMounted = false;
    };
  }, [id, activeChannelId]);

  // ---------- TEMPO REAL ----------
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`tribe_messages_${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tribe_messages",
          filter: `tribe_id=eq.${id}`,
        },
        (payload: RealtimePostgresChangesPayload<TribeMessage>) => {
          const newMsg = payload.new as TribeMessage;

          if (!activeChannelId || newMsg.channel_id !== activeChannelId) {
            return;
          }

          setChatMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      );

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, activeChannelId]);

// ---------- MEMBROS ----------
useEffect(() => {
  if (!id) return;

  let isMounted = true;

  const loadMembers = async () => {
    if (!tribe) return;

    const canView = tribe.is_public || isMember;
    if (!canView) {
      if (isMounted) setMembers([]);
      return;
    }

    setMembersLoading(true);

    const { data, error } = await supabase
      .from("view_tribe_members_detailed")
      .select("*")
      .eq("tribe_id", id)
      .order("role", { ascending: true })
      .order("joined_at", { ascending: true });

    if (!isMounted) return;

    if (!error && data) {
      setMembers(data as TribeMemberDetailed[]);
    } else {
      setMembers([]);
    }

    setMembersLoading(false);
  };

  if (activeTab === "members") {
    loadMembers();
  }

  return () => {
    isMounted = false;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [id, activeTab, isMember, tribe]);

const roleLabel = (role: "owner" | "moderator" | "member") => {
  if (role === "owner") return "Dono";
  if (role === "moderator") return "Moderador";
  return "Membro";
};

const canOpenMemberActions = () => {
  return isMember && (myRole === "owner" || myRole === "moderator");
};

const openMemberModal = (m: TribeMemberDetailed) => {
  if (!canOpenMemberActions()) return;
  setSelectedMember(m);
  setMemberModalVisible(true);
};

const closeMemberModal = () => {
  setMemberModalVisible(false);
  setSelectedMember(null);
};

const refreshMembersCount = async (tribeId: string) => {
  const { count } = await supabase
    .from("tribe_members")
    .select("user_id", { count: "exact", head: true })
    .eq("tribe_id", tribeId);

  if (typeof count === "number") {
    setTribe((prev) => (prev ? { ...prev, members_count: count } : prev));
  }
};

const handleRemoveMember = async () => {
  if (!tribe || !selectedMember) return;

  const targetId = selectedMember.user_id;

  if (!userId) return;
  if (targetId === userId) return;
  if (selectedMember.role === "owner") return;

  const { error } = await supabase
    .from("tribe_members")
    .delete()
    .eq("tribe_id", tribe.id)
    .eq("user_id", targetId);

  if (error) {
    Alert.alert("Ops", error.message || "Não foi possível remover o membro.");
    return;
  }

  setMembers((prev) => prev.filter((x) => x.user_id !== targetId));
  setTribe({ ...tribe, members_count: Math.max(0, tribe.members_count - 1) });
  closeMemberModal();
};

const handleSetMemberRole = async (role: "moderator" | "member") => {
  if (!tribe || !selectedMember) return;

  if (myRole !== "owner") return;

  const targetId = selectedMember.user_id;

  if (!userId) return;
  if (targetId === userId) return;
  if (selectedMember.role === "owner") return;

  const { error } = await supabase
    .from("tribe_members")
    .update({ role } as any)
    .eq("tribe_id", tribe.id)
    .eq("user_id", targetId);

  if (error) {
    Alert.alert("Ops", error.message || "Não foi possível alterar o cargo.");
    return;
  }

  setMembers((prev) =>
    prev.map((x) => (x.user_id === targetId ? { ...x, role } : x))
  );
  setSelectedMember((prev) => (prev ? { ...prev, role } : prev));
};

  // ---------- AÇÕES ----------
  const handleToggleMembership = async () => {
  if (!tribe || joining) return;

  const notify = (title: string, message: string) => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      // @ts-ignore
      window.alert(`${title}

${message}`);
      return;
    }
    Alert.alert(title, message);
  };

  setJoining(true);
  try {
    let currentUserId = userId;

    if (!currentUserId) {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      currentUserId = authData?.user?.id ?? null;
      if (currentUserId) setUserId(currentUserId);
      if (authErr || !currentUserId) {
        notify("Entrar na tribo", "Você precisa estar logado para entrar na tribo.");
        return;
      }
    }

    if (isMember) {
      const { error } = await supabase
        .from("tribe_members")
        .delete()
        .eq("tribe_id", tribe.id)
        .eq("user_id", currentUserId);

      if (error) {
        console.error("Erro ao sair da tribo:", error);
        notify("Ops", (error as any)?.message || "Não foi possível sair da tribo. Tente novamente.");
        return;
      }

      setIsMember(false);
      await refreshMembersCount(tribe.id);
      return;
    }

    const { error } = await supabase.from("tribe_members").insert({
            tribe_id: tribe.id,
            user_id: currentUserId,
            role: "member",
          } as any);

    if (error) {
      // se já existe membership, apenas sincroniza estado (evita duplicate key)
      const code = (error as any)?.code;
      const msg = (error as any)?.message as string | undefined;

      if (code === "23505" || (msg && msg.toLowerCase().includes("duplicate key"))) {
        setIsMember(true);
        await refreshMembersCount(tribe.id);
        return;
      }

      console.error("Erro ao entrar na tribo:", error);
      notify("Ops", msg || "Não foi possível entrar na tribo. Tente novamente.");
      return;
    }

    setIsMember(true);
    await refreshMembersCount(tribe.id);
  } finally {
    setJoining(false);
  }
};

  const handleCreatePost = async () => {
    if (!tribe || !userId || !isMember || creatingPost) return;

    const content = newPostContent.trim();
    if (!content.length) return;

    setCreatingPost(true);

    const { data, error } = await supabase
      .from("tribe_posts")
      .insert({
        tribe_id: tribe.id,
        user_id: userId,
        content,
      } as any)
      .select("*")
      .single();

    if (!error && data) {
      setPosts((prev) => [data as TribePost, ...prev]);
      setNewPostContent("");
    }

    setCreatingPost(false);
  };

  const handleSendChatMessage = async () => {
    if (!tribe || !userId || !isMember || sendingChat) return;
    if (!activeChannelId) return;

    const content = newChatMessage.trim();
    if (!content.length) return;

    setSendingChat(true);

    const { data, error } = await supabase
      .from("tribe_messages")
      .insert({
        tribe_id: tribe.id,
        channel_id: activeChannelId,
        user_id: userId,
        content: replyingTo
          ? `↩︎ ${replyingTo.user_id === userId ? "Você" : "Membro"}: ${replyingTo.content.slice(0, 80)}\n${content}`
          : content,
      } as any)
      .select("*")
      .single();

    if (!error && data) {
      const inserted = data as TribeMessage;
      setChatMessages((prev) => {
        if (prev.some((m) => m.id === inserted.id)) return prev;
        return [...prev, inserted];
      });
      setNewChatMessage("");
      setReplyingTo(null);
    }

    setSendingChat(false);
  };

  const applyMessageMeta = async (base: TribeMessage[]) => {
    if (!id || !activeChannelId || base.length === 0) return base;

    const ids = base.map((m) => m.id);

    const [{ data: deletions }, { data: reactions }] = await Promise.all([
      supabase
        .from("tribe_message_deletions")
        .select("message_id, deleted_by_role, deleted_at")
        .in("message_id", ids),
      supabase
        .from("tribe_message_reactions")
        .select("message_id, emoji")
        .in("message_id", ids),
    ]);

    const deletedMap = new Map<
      string,
      { deleted_by_role: "owner" | "moderator"; deleted_at: string }
    >();
    (deletions || []).forEach((d: any) => {
      deletedMap.set(d.message_id, {
        deleted_by_role: d.deleted_by_role,
        deleted_at: d.deleted_at,
      });
    });

    const reactionMap = new Map<string, Map<string, number>>();
    (reactions || []).forEach((r: any) => {
      const perMsg = reactionMap.get(r.message_id) || new Map<string, number>();
      perMsg.set(r.emoji, (perMsg.get(r.emoji) || 0) + 1);
      reactionMap.set(r.message_id, perMsg);
    });

    return base.map((m) => {
      const del = deletedMap.get(m.id);
      const per = reactionMap.get(m.id);
      const summary = per
        ? Array.from(per.entries()).map(([emoji, count]) => ({ emoji, count }))
        : [];
      return {
        ...m,
        is_deleted: !!del,
        deleted_by_role: del?.deleted_by_role,
        deleted_at: del?.deleted_at,
        reactions: summary,
      };
    });
  };

  const openMessageActions = (msg: TribeMessage) => {
    setSelectedMessage(msg);
    setMessageActionsVisible(true);
  };

  const closeMessageActions = () => {
    setMessageActionsVisible(false);
    setSelectedMessage(null);
    setEmojiPickerVisible(false);
  };

  const startReply = () => {
    if (!selectedMessage || selectedMessage.is_deleted) return;
    setReplyingTo(selectedMessage);
    closeMessageActions();
  };

  const cancelReply = () => {
    setReplyingTo(null);
  };

  const addReaction = async (emoji: string) => {
    if (!selectedMessage || !userId || !id || !activeChannelId) return;
    if (selectedMessage.is_deleted) return;

    await supabase.from("tribe_message_reactions").insert({
      tribe_id: id,
      channel_id: activeChannelId,
      message_id: selectedMessage.id,
      user_id: userId,
      emoji,
    } as any);

    const hydrated = await applyMessageMeta(chatMessages);
    setChatMessages(hydrated);
    closeMessageActions();
  };

  const deleteMessage = async () => {
    if (!selectedMessage || !userId || !id || !activeChannelId) return;
    if (!canManageMessages) return;
    if (selectedMessage.is_deleted) return;

    const role = myRole === "owner" ? "owner" : "moderator";

    await supabase.from("tribe_message_deletions").insert({
      tribe_id: id,
      channel_id: activeChannelId,
      message_id: selectedMessage.id,
      deleted_by: userId,
      deleted_by_role: role,
    } as any);

    const hydrated = await applyMessageMeta(chatMessages);
    setChatMessages(hydrated);
    closeMessageActions();
  };



  const canManageCover = myRole === "owner" || myRole === "moderator";

  const pickAndUploadCover = async () => {
    if (!id || !tribe) return;
    if (!canManageCover) return;
    if (uploadingCover) return;

    try {
      setUploadingCover(true);

      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (perm.status !== "granted") {
          Alert.alert("Permissão necessária", "Autorize acesso às fotos para trocar a capa.");
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ((ImagePicker as any).MediaType?.Images ?? (ImagePicker as any).MediaTypeOptions?.Images),
        quality: 0.85,
        allowsEditing: true,
        aspect: [16, 9],
      });

      if ((result as any)?.canceled) return;

      const asset = (result as any)?.assets?.[0];
      const uri = asset?.uri as string | undefined;
      if (!uri) return;

      const prepared = await prepareCoverImage(uri);
      const path = `covers/${id}/${Date.now()}.${prepared.ext}`;

      const { body, contentType } = await uriToUploadBody(prepared.uri);

      const { error: upErr } = await supabase.storage.from("tribes").upload(path, body as any, {
        contentType: contentType || prepared.contentType,
        upsert: true,
      });

      if (upErr) {
        Alert.alert("Ops", (upErr as any)?.message || "Não foi possível enviar a capa.");
        return;
      }

      const { error: dbErr } = await supabase.from("tribes").update({ cover_url: path } as any).eq("id", id);

      if (dbErr) {
        Alert.alert("Ops", (dbErr as any)?.message || "Não foi possível salvar a capa.");
        return;
      }

      setTribe((prev) => (prev ? { ...prev, cover_url: path } : prev));
    } finally {
      setUploadingCover(false);
    }
  };

  const openCoverActions = () => {
    if (!canManageCover) return;
    setCoverActionsVisible(true);
  };

  const confirmCoverPick = async () => {
    if (uploadingCover) return;
    setCoverActionsVisible(false);
    await pickAndUploadCover();
  };

  // ---------- HELPERS ----------
  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // ---------- CONTEÚDO DAS TABS ----------
  const renderTabContent = () => {
    if (!tribe) return null;

    // FEED
    if (activeTab === "feed") {
      return (
        <View style={{ marginTop: 16 }}>
          {/* Header feed */}
          <View
            style={[
              styles.cardSection,
              { backgroundColor: theme.colors.surfaceElevated },
            ]}
          >
            <Text style={styles.sectionHeaderLabel}>Feed da tribo</Text>
            <Text style={[styles.sectionHeaderHelper, { color: "#9CA3AF" }]}>
              Espaço para anúncios, posts mais longos e recados importantes.
            </Text>
          </View>

          {/* Novo post */}
          {isMember ? (
            <View
              style={[
                styles.cardSection,
                { backgroundColor: theme.colors.surfaceElevated, marginTop: 8 },
              ]}
            >
              <Text style={styles.sectionHeaderLabel}>Criar post no feed</Text>
              
                {replyingTo ? (
                  <View style={styles.replyPreview}>
                    <View style={styles.replyPreviewLeft}>
                      <Text style={styles.replyPreviewLabel}>Respondendo</Text>
                      <Text style={styles.replyPreviewText} numberOfLines={1}>
                        {replyingTo.content}
                      </Text>
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={cancelReply}
                      style={styles.replyPreviewClose}
                    >
                      <Text style={styles.replyPreviewCloseText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

<View style={styles.row}>
                <View
                  style={[
                    styles.flex1,
                    styles.inputBox,
                    { backgroundColor: theme.colors.surface },
                  ]}
                >
                  <TextInput
                    value={newPostContent}
                    onChangeText={setNewPostContent}
                    placeholder="Compartilhe uma ideia, anúncio ou insight com toda a tribo..."
                    placeholderTextColor="#6B7280"
                    multiline
                    style={styles.feedInput}
                  />
                </View>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={handleCreatePost}
                  disabled={
                    creatingPost || !newPostContent.trim().length
                  }
                  style={[
                    styles.primaryChipButton,
                    {
                      backgroundColor:
                        creatingPost || !newPostContent.trim().length
                          ? theme.colors.surface
                          : theme.colors.primary,
                      marginLeft: 8,
                    },
                  ]}
                >
                  {creatingPost ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.primaryChipButtonText}>Postar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View
              style={[
                styles.cardSection,
                { backgroundColor: theme.colors.surfaceElevated, marginTop: 8 },
              ]}
            >
              <Text style={styles.infoTitle}>
                Entre na tribo para postar no feed.
              </Text>
              <Text style={styles.infoText}>
                Só membros podem criar posts. Mantém o mural organizado e com
                a cara da comunidade.
              </Text>
            </View>
          )}

          {/* Lista de posts */}
          <View style={{ marginTop: 12 }}>
            {postsLoading ? (
              <View style={styles.centeredBlock}>
                <ActivityIndicator />
                <Text style={styles.loadingSmallText}>
                  Carregando feed da tribo...
                </Text>
              </View>
            ) : posts.length === 0 ? (
              <View
                style={[
                  styles.cardSection,
                  { backgroundColor: theme.colors.surfaceElevated },
                ]}
              >
                <Text style={styles.infoTitle}>Nenhum post ainda.</Text>
                <Text style={styles.infoText}>
                  Quando surgirem novidades, o feed vira o mural oficial dessa
                  tribo.
                </Text>
              </View>
            ) : (
              posts.map((post) => {
                const isOwn = userId && post.user_id === userId;
                const authorLabel = isOwn ? "Você" : "Membro da tribo";

                return (
                  <View
                    key={post.id}
                    style={[
                      styles.cardSection,
                      {
                        backgroundColor: theme.colors.surfaceElevated,
                        marginTop: 8,
                      },
                    ]}
                  >
                    <View style={styles.rowSpaceBetween}>
                      <Text style={styles.postAuthor}>{authorLabel}</Text>
                      <Text style={styles.postMeta}>
                        {formatDate(post.created_at)} ·{" "}
                        {formatTime(post.created_at)}
                      </Text>
                    </View>
                    {post.content ? (
                      <Text style={styles.postContent}>{post.content}</Text>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        </View>
      );
    }

    // CHAT
    if (activeTab === "chat") {
      const activeChannel =
        channels.find((c) => c.id === activeChannelId) || null;

      const isWeb = Platform.OS === "web";

      const baseOffset = isWeb
        ? isLargeWeb
          ? 700
          : 540
        : 420;

      const chatHeight = isWeb
        ? isLargeWeb
          ? Math.max(320, Math.min(440, height - baseOffset))
          : Math.max(300, Math.min(420, height - baseOffset))
        : Math.max(360, Math.min(520, height - baseOffset));

      return (
        <View
          style={[
            styles.chatContainer,
            { backgroundColor: theme.colors.surfaceElevated },
            { height: chatHeight, marginTop: isWeb ? 8 : 16 },
            !isLargeWeb ? { flexDirection: "column" } : null,
          ]}
        >
          {/* Coluna canais */}
          <View
            style={[
              styles.channelsColumn,
              { borderColor: theme.colors.surface },
              !isLargeWeb
                ? {
                    width: "100%",
                    borderRightWidth: 0,
                    borderBottomWidth: 1,
                  }
                : null,
            ]}
          >
            <View style={styles.channelsHeaderRow}>
              <Text style={styles.channelsTitle}>Canais</Text>
              {canManageChannels ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => setChannelModalVisible(true)}
                  style={styles.channelsAddBtn}
                >
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              ) : null}
            </View>

            {channelsLoading ? (
              <View style={styles.centeredBlock}>
                <ActivityIndicator size="small" />
              </View>
            ) : channels.length === 0 ? (
              <View style={styles.channelsEmpty}>
                <Text style={styles.infoText}>
                  Nenhum canal criado ainda. O LUPYY já cria o canal{" "}
                  <Text style={styles.bold}>#geral</Text> nas tribos novas.
                </Text>
              </View>
            ) : (
              <ScrollView
                horizontal={!isLargeWeb}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={!isLargeWeb ? { paddingHorizontal: 6, paddingBottom: 8 } : undefined}
              >
                <View style={!isLargeWeb ? { flexDirection: "row", gap: 6 } : undefined}>
                  {channels.map((channel) => {
                    const isActive = channel.id === activeChannelId;
                    return (
                      <TouchableOpacity
                        key={channel.id}
                        activeOpacity={0.9}
                        onPress={() => setActiveChannelId(channel.id)}
                        style={[
                          styles.channelItem,
                          !isLargeWeb ? { marginHorizontal: 0, marginTop: 0 } : null,
                          {
                            backgroundColor: isActive
                              ? theme.colors.primary
                              : "transparent",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.channelItemText,
                            {
                              color: isActive
                                ? "#FFFFFF"
                                : theme.colors.textMuted,
                            },
                          ]}
                        >
                          #{channel.slug}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>

          {/* Área mensagens */}
          <KeyboardAvoidingView
            style={styles.chatMain}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 64 : 0}
          >
            {/* Header */}
            <View
              style={[
                styles.chatHeader,
                { borderColor: theme.colors.surface },
              ]}
            >
              {activeChannel ? (
                <>
                  <View>
                    <Text style={styles.chatHeaderTitle}>
                      #{activeChannel.slug}
                    </Text>
                    <Text style={styles.chatHeaderSubtitle}>
                      {activeChannel.description ||
                        "Canal principal da tribo."}
                    </Text>
                  </View>
                  <Text style={styles.chatHeaderMeta}>
                    {chatMessages.length} mensagem
                    {chatMessages.length === 1 ? "" : "s"}
                  </Text>
                </>
              ) : (
                <Text style={styles.infoText}>
                  Escolha um canal na coluna à esquerda.
                </Text>
              )}
            </View>

            {/* Mensagens */}
            <View
              style={[
                styles.chatMessagesArea,
                { flex: 1, minHeight: 0 },
              ]}
            >
              {activeChannel ? (
                chatLoading ? (
                  <View style={styles.centeredBlock}>
                    <ActivityIndicator size="small" />
                    <Text style={styles.loadingSmallText}>
                      Carregando mensagens...
                    </Text>
                  </View>
                ) : chatMessages.length === 0 ? (
                  <View style={styles.channelsEmpty}>
                    <Text style={styles.infoTitle}>
                      Nenhuma mensagem ainda.
                    </Text>
                    <Text style={styles.infoText}>
                      Seja a primeira pessoa a mandar algo nesse canal.
                    </Text>
                  </View>
                ) : (
                  <ScrollView
                    ref={chatScrollRef}
                    style={[{ flex: 1, minHeight: 0 }, Platform.OS === "web" ? ({ overflowY: "auto" } as any) : null]}
                    persistentScrollbar={Platform.OS === "android"}
                    keyboardShouldPersistTaps="handled"
                    onContentSizeChange={() => {
                      chatScrollRef.current?.scrollToEnd({ animated: true });
                    }}
                    contentContainerStyle={{
                      paddingHorizontal: 8,
                      paddingVertical: 6,
                      paddingBottom: Platform.OS === "web" ? 120 : 200,
          }}
                    showsVerticalScrollIndicator={true}
                  >
                    {chatMessages.map((msg) => {
                      const isOwn = userId && msg.user_id === userId;
                      const authorLabel = isOwn ? "Você" : "Membro da tribo";

                      return (
                        <View
                          key={msg.id}
                          style={[
                            styles.chatBubbleRow,
                            {
                              justifyContent: isOwn
                                ? "flex-end"
                                : "flex-start",
                            },
                          ]}
                        >
                          <TouchableOpacity activeOpacity={0.9} onPress={() => openMessageActions(msg)}>
                          <View
                            style={[
                              styles.chatBubble,
                              {
                                backgroundColor: isOwn
                                  ? theme.colors.primary
                                  : theme.colors.surface,
                              },
                            ]}
                          >
                            <View style={styles.rowSpaceBetween}>
                              <Text
                                style={[
                                  styles.chatBubbleAuthor,
                                  {
                                    color: isOwn
                                      ? "#ffffff"
                                      : "#e5e7eb",
                                  },
                                ]}
                              >
                                {authorLabel}
                              </Text>
                              <Text
                                style={[
                                  styles.chatBubbleTime,
                                  {
                                    color: isOwn
                                      ? "#f9fafb"
                                      : "#9ca3af",
                                  },
                                ]}
                              >
                                {formatTime(msg.created_at)}
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.chatBubbleText,
                                msg.is_deleted ? { fontStyle: "italic", opacity: 0.85 } : null,
                                {
                                  color: isOwn
                                    ? "#ffffff"
                                    : "#e5e7eb",
                                },
                              ]}
                            >
                              {msg.is_deleted ? (msg.deleted_by_role === "owner" ? "Excluída pelo dono" : "Excluída pelo moderador") : msg.content}
                            </Text>
                            {msg.reactions && msg.reactions.length > 0 ? (
                              <View style={styles.reactionsRow}>
                                {msg.reactions.slice(0, 6).map((r) => (
                                  <View key={`${msg.id}-${r.emoji}`} style={styles.reactionPill}>
                                    <Text style={styles.reactionPillText}>
                                      {r.emoji} {r.count}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            ) : null}
                          </View>
                        </TouchableOpacity>
                        </View>
                      );
                    })}
                  </ScrollView>
                )
              ) : (
                <View style={styles.channelsEmpty}>
                  <Text style={styles.infoText}>
                    Nenhum canal selecionado. Toque em{" "}
                    <Text style={styles.bold}>#geral</Text> para começar a
                    conversar.
                  </Text>
                </View>
              )}
            </View>

            {/* Input */}
            <View
              style={[
                styles.chatInputBar,
                { borderColor: theme.colors.surface },
                { paddingBottom: Math.max(6, insets.bottom) },
              ]}
            >
              {isMember ? (
                <View style={styles.row}>
                  <View
                    style={[
                      styles.flex1,
                      styles.inputBox,
                      { backgroundColor: theme.colors.surface },
                    ]}
                  >
                    <TextInput
                      value={newChatMessage}
                      onChangeText={setNewChatMessage}
                      onFocus={() => {
                        requestAnimationFrame(() => {
                          chatScrollRef.current?.scrollToEnd({ animated: true });
                        });
                      }}
                      placeholder={
                        activeChannel
                          ? `Enviar mensagem em #${activeChannel.slug}...`
                          : "Escolha um canal para mandar mensagem..."
                      }
                      placeholderTextColor="#6B7280"
                      multiline
                      textAlignVertical="top"
                      style={styles.chatInput}
                    />
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={handleSendChatMessage}
                    disabled={
                      sendingChat ||
                      !newChatMessage.trim().length ||
                      !activeChannelId
                    }
                    style={[
                      styles.primaryChipButton,
                      {
                        backgroundColor:
                          sendingChat ||
                          !newChatMessage.trim().length ||
                          !activeChannelId
                            ? theme.colors.surface
                            : theme.colors.primary,
                        marginLeft: 8,
                      },
                    ]}
                  >
                    {sendingChat ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.primaryChipButtonText}>
                        Enviar
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.infoText}>
                  Entre na tribo para participar do chat.
                </Text>
              )}
            </View>
          </KeyboardAvoidingView>

          
      {/* Modal ações da mensagem */}
      {messageActionsVisible && selectedMessage ? (
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: theme.colors.surfaceElevated },
            ]}
          >
            <View style={styles.rowSpaceBetween}>
              <Text style={styles.modalTitle}>Mensagem</Text>
              <TouchableOpacity activeOpacity={0.9} onPress={closeMessageActions}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={{ gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.modalAction}
                onPress={startReply}
              >
                <Text style={styles.modalActionText}>Responder</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.modalAction}
                onPress={() => setEmojiPickerVisible(true)}
              >
                <Text style={styles.modalActionText}>Reagir</Text>
              </TouchableOpacity>

              {canManageMessages ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.modalAction, styles.modalActionDanger]}
                  onPress={deleteMessage}
                >
                  <Text style={styles.modalActionText}>Apagar</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.modalAction}
                onPress={closeMessageActions}
              >
                <Text style={styles.modalActionText}>Cancelar</Text>
              </TouchableOpacity>
            </View>

            {emojiPickerVisible ? (
              <View style={styles.emojiGrid}>
                {["👍", "❤️", "😂", "🔥", "😮", "😢"].map((e) => (
                  <TouchableOpacity
                    key={e}
                    activeOpacity={0.9}
                    style={styles.emojiBtn}
                    onPress={() => addReaction(e)}
                  >
                    <Text style={styles.emojiText}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

{channelModalVisible ? (
            <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { backgroundColor: theme.colors.surfaceElevated }]}>
                <View style={styles.rowSpaceBetween}>
                  <Text style={styles.modalTitle}>Criar canal</Text>
                  <TouchableOpacity activeOpacity={0.9} onPress={() => setChannelModalVisible(false)}>
                    <Text style={styles.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalSubtitle}>
                  Apenas dono e moderadores podem criar salas.
                </Text>

                <View style={{ marginTop: 10 }}>
                  <TextInput
                    value={newChannelName}
                    onChangeText={setNewChannelName}
                    placeholder="Nome do canal (ex: Projetos)"
                    placeholderTextColor="#6B7280"
                    style={[styles.modalInput, { backgroundColor: theme.colors.surface, color: "#F9FAFB" }]}
                  />
                </View>

                <View style={styles.modalTypeRow}>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setNewChannelType("text")}
                    style={[
                      styles.modalTypeOption,
                      { backgroundColor: newChannelType === "text" ? theme.colors.primary : theme.colors.surface },
                    ]}
                  >
                    <Text style={[styles.modalTypeText, { color: newChannelType === "text" ? "#FFFFFF" : "#E5E7EB" }]}>
                      Texto
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setNewChannelType("voice")}
                    style={[
                      styles.modalTypeOption,
                      { backgroundColor: newChannelType === "voice" ? theme.colors.primary : theme.colors.surface },
                    ]}
                  >
                    <Text style={[styles.modalTypeText, { color: newChannelType === "voice" ? "#FFFFFF" : "#E5E7EB" }]}>
                      Voz
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={{ marginTop: 10, gap: 8 }}>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={createChannel}
                    disabled={!newChannelName.trim().length}
                    style={[
                      styles.modalAction,
                      {
                        backgroundColor: !newChannelName.trim().length ? theme.colors.surface : theme.colors.primary,
                      },
                    ]}
                  >
                    <Text style={styles.modalActionText}>Criar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setChannelModalVisible(false)}
                    style={[styles.modalCancel, { backgroundColor: theme.colors.surface }]}
                  >
                    <Text style={styles.modalCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : null}

        </View>
      );
    }


// MEMBROS
if (activeTab === "members") {
  const canView = tribe.is_public || isMember;

  if (!canView) {
    return (
      <View
        style={[
          styles.cardSection,
          { backgroundColor: theme.colors.surfaceElevated, marginTop: 16 },
        ]}
      >
        <Text style={styles.sectionTitle}>Membros</Text>
        <Text style={styles.infoText}>
          Entre na tribo para ver quem está aqui dentro.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.cardSection,
        { backgroundColor: theme.colors.surfaceElevated, marginTop: 16 },
      ]}
    >
      <View style={styles.rowSpaceBetween}>
        <View>
          <Text style={styles.sectionTitle}>Membros</Text>
          <Text style={styles.infoText}>
            Toque em um membro para ações (dono/mod).
          </Text>
        </View>
        {membersLoading ? <ActivityIndicator size="small" /> : null}
      </View>

      <View style={{ marginTop: 12, gap: 10 }}>
        {members.length === 0 && !membersLoading ? (
          <Text style={styles.infoText}>Nenhum membro encontrado.</Text>
        ) : (
          members.map((m) => {
            const isYou = userId && m.user_id === userId;
            const display =
              m.full_name?.trim() ||
              m.username?.trim() ||
              "Usuário";

            const sub =
              m.username?.trim() ? `@${m.username.trim()}` : "";

            const canClick =
              isMember &&
              (myRole === "owner" || myRole === "moderator") &&
              !isYou;

            return (
              <TouchableOpacity
                key={`${m.tribe_id}_${m.user_id}`}
                activeOpacity={0.9}
                onPress={() => (canClick ? openMemberModal(m) : undefined)}
                style={[
                  styles.memberRow,
                  { backgroundColor: theme.colors.surface },
                ]}
              >
                <View style={styles.row}>
                  <View style={styles.memberAvatarWrap}>
                    {m.avatar_url ? (
                      <Image
                        source={{ uri: m.avatar_url }}
                        style={styles.memberAvatar}
                      />
                    ) : (
                      <View style={styles.memberAvatarFallback}>
                        <Text style={styles.memberAvatarFallbackText}>
                          {display.slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>
                      {display}
                      {isYou ? " (você)" : ""}
                    </Text>
                    {sub ? (
                      <Text style={styles.memberUser}>{sub}</Text>
                    ) : null}
                  </View>

                  <View style={styles.rolePill}>
                    <Text style={styles.rolePillText}>
                      {roleLabel(m.role)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Modal ações */}
      {memberModalVisible && selectedMember ? (
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: theme.colors.surfaceElevated },
            ]}
          >
            <View style={styles.rowSpaceBetween}>
              <Text style={styles.modalTitle}>Gerenciar membro</Text>
              <TouchableOpacity activeOpacity={0.9} onPress={closeMemberModal}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              {selectedMember.full_name?.trim() ||
                selectedMember.username?.trim() ||
                "Usuário"}
            </Text>

            <View style={{ marginTop: 10, gap: 8 }}>
              {myRole === "owner" ? (
                <>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => handleSetMemberRole("moderator")}
                    disabled={selectedMember.role === "moderator"}
                    style={[
                      styles.modalAction,
                      {
                        backgroundColor:
                          selectedMember.role === "moderator"
                            ? theme.colors.surface
                            : theme.colors.primary,
                      },
                    ]}
                  >
                    <Text style={styles.modalActionText}>
                      Promover a moderador
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => handleSetMemberRole("member")}
                    disabled={selectedMember.role === "member"}
                    style={[
                      styles.modalAction,
                      {
                        backgroundColor:
                          selectedMember.role === "member"
                            ? theme.colors.surface
                            : theme.colors.primary,
                      },
                    ]}
                  >
                    <Text style={styles.modalActionText}>
                      Rebaixar para membro
                    </Text>
                  </TouchableOpacity>
                </>
              ) : null}

              {(myRole === "owner" || myRole === "moderator") ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={handleRemoveMember}
                  style={[
                    styles.modalDanger,
                    { backgroundColor: theme.colors.surface },
                  ]}
                >
                  <Text style={styles.modalDangerText}>Remover membro</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.9}
                onPress={closeMemberModal}
                style={[styles.modalCancel, { backgroundColor: theme.colors.surface }]}
              >
                <Text style={styles.modalCancelText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

    // RANKING
    if (activeTab === "ranking") {
      return (
        <View
          style={[
            styles.cardSection,
            { backgroundColor: theme.colors.surfaceElevated, marginTop: 16 },
          ]}
        >
          <Text style={styles.sectionTitle}>Ranking e gamificação</Text>
          <Text style={styles.infoText}>
            Em breve: ranking de engajamento, níveis sociais da tribo e badges
            que aparecem no seu perfil LUPYY.
          </Text>

          <View style={{ marginTop: 12, gap: 8 }}>
            {[1, 2, 3].map((pos) => (
              <View
                key={pos}
                style={[
                  styles.rankingRow,
                  { backgroundColor: theme.colors.surface },
                ]}
              >
                <View style={styles.row}>
                  <View style={styles.rankingBadge}>
                    <Text style={styles.rankingBadgeText}>{pos}</Text>
                  </View>
                  <View>
                    <Text style={styles.rankingName}>
                      Membro da tribo #{pos}
                    </Text>
                    <Text style={styles.rankingSubtitle}>
                      XP e participação (placeholder)
                    </Text>
                  </View>
                </View>
                <Text style={styles.rankingTag}>Em breve</Text>
              </View>
            ))}
          </View>
        </View>
      );
    }

    // SOBRE
    if (activeTab === "about") {
      return (
        <View
          style={[
            styles.cardSection,
            { backgroundColor: theme.colors.surfaceElevated, marginTop: 16 },
          ]}
        >
          <Text style={styles.sectionTitle}>Sobre a tribo</Text>

          {tribe.description ? (
            <Text style={styles.infoTextStrong}>{tribe.description}</Text>
          ) : (
            <Text style={styles.infoText}>
              Essa tribo ainda não tem uma descrição. O criador pode usar esse
              espaço para explicar o propósito, as regras e a vibe da comunidade.
            </Text>
          )}

          <View style={styles.chipsRow}>
            {tribe.category ? (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{tribe.category}</Text>
              </View>
            ) : null}

            <View style={styles.chip}>
              <Text style={styles.chipText}>
                {tribe.is_public ? "Tribo pública" : "Tribo privada"}
              </Text>
            </View>

            <View style={styles.chip}>
              <Text style={styles.chipText}>
                Criada em {formatDate(tribe.created_at)}
              </Text>
            </View>

            <View style={styles.chip}>
              <Text style={styles.chipText}>
                {isOwner ? "Criada por você" : "Criador: membro da tribo"}
              </Text>
            </View>
          </View>
        </View>
      );
    }

    return null;
  };

  // ---------- LOADING ----------
  if (loading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          paddingTop: insets.top,
          backgroundColor: theme.colors.background,
        }}
      >
        <View style={styles.centeredBlockFlex}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Carregando tribo...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!tribe) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          paddingTop: insets.top,
          backgroundColor: theme.colors.background,
        }}
      >
        <View style={styles.centeredBlockFlex}>
          <Text style={styles.loadingText}>
            Não foi possível carregar essa tribo.
          </Text>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={goBackToTribes}
            style={styles.primaryChipButton}
          >
            <Text style={styles.primaryChipButtonText}>
              Voltar para as tribos
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ---------- UI ----------
  const coverUri = getCoverUri(tribe?.cover_url ?? null);

  return (
    <SafeAreaView
      style={{
        flex: 1,
        paddingTop: insets.top,
        backgroundColor: theme.colors.background,
      }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={
          Platform.OS !== "web" && activeTab === "chat"
            ? { paddingBottom: insets.bottom }
            : { paddingBottom: 32 + insets.bottom }
        }
        keyboardShouldPersistTaps="handled"
        scrollEnabled={
          Platform.OS === "web"
            ? !(isLargeWeb && activeTab === "chat")
            : activeTab !== "chat"
        }
      >
        {/* HEADER / CAPA */}
        <View style={styles.coverContainer}>
          <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFill} onPress={() => {}} onLongPress={canManageCover ? openCoverActions : undefined} delayLongPress={350}>
          {coverUri ? (
            <Image
              source={{ uri: coverUri }}
              style={styles.coverImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.coverPlaceholder} />
          )}
          </TouchableOpacity>

          {/* Top bar */}
          <View style={styles.coverTopBar} pointerEvents="box-none">
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={goBackToTribes}
              style={styles.coverBackButton}
            >
              <Text style={styles.coverBackText}>{"‹"}</Text>
            </TouchableOpacity>

            <View style={styles.coverTag}>
              <Text style={styles.coverTagText}>TRIBO</Text>
            </View>
          </View>

          {/* Gradient overlay */}
          <View pointerEvents="none" style={styles.coverGradientOverlay} />

          {/* Nome + info básica */}
          <View style={styles.coverBottomInfo}>
            <Text style={styles.coverTitle} numberOfLines={2}>
              {tribe.name}
            </Text>
            <View style={styles.row}>
              <Text style={styles.coverMeta}>
                {tribe.members_count} membro
                {tribe.members_count === 1 ? "" : "s"}
              </Text>
              {tribe.category ? (
                <Text style={[styles.coverMeta, { marginLeft: 8 }]}>
                  • {tribe.category}
                </Text>
              ) : null}
            </View>
          
            {canManageCover ? (
              <View style={styles.coverEditHint}>
                <Text style={styles.coverEditHintText}>{uploadingCover ? "Enviando capa..." : "Segure na capa para trocar"}</Text>
              </View>
            ) : null}
</View>
        </View>

        {/* CONTEÚDO */}
        <View
          style={{
            paddingHorizontal: isLargeWeb ? 32 : 16,
            paddingTop: 16,
          }}
        >
          {isLargeWeb ? (
            // WEB: modal centralizado estilo Discord
            <View style={styles.webWrapper}>
              <View
                style={[
                  styles.webModal,
                  { backgroundColor: theme.colors.background },
                ]}
              >
                {/* CARD INTERNO */}
                <View
                  style={[
                    styles.webModalCard,
                    {
                      backgroundColor: theme.colors.surfaceElevated,
                      borderColor: theme.colors.surface,
                    },
                  ]}
                >
                  <View style={styles.webColumns}>
                    {/* COLUNA ESQUERDA */}
                    <View style={styles.webLeft}>
                      <Text style={styles.leftTitle}>Sobre essa tribo</Text>
                      <Text style={styles.leftDescription}>
                        {tribe.description
                          ? tribe.description
                          : "Entre para a tribo e começa a construir uma nova bolha social com a cara do LUPYY."}
                      </Text>

                      <View style={styles.chipsRow}>
                        {tribe.category ? (
                          <View style={styles.chip}>
                            <Text style={styles.chipText}>
                              {tribe.category}
                            </Text>
                          </View>
                        ) : null}

                        <View style={styles.chip}>
                          <Text style={styles.chipText}>
                            {tribe.is_public
                              ? "Tribo pública"
                              : "Tribo privada"}
                          </Text>
                        </View>

                        <View style={styles.chip}>
                          <Text style={styles.chipText}>
                            Criada em {formatDate(tribe.created_at)}
                          </Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={handleToggleMembership}
                        disabled={joining || membershipLoading}
                        style={[
                          styles.leftButton,
                          {
                            backgroundColor: isMember
                              ? theme.colors.surface
                              : theme.colors.primary,
                          },
                        ]}
                      >
                        {joining || membershipLoading ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text
                            style={[
                              styles.leftButtonText,
                              {
                                color: isMember
                                  ? theme.colors.text
                                  : "#FFFFFF",
                              },
                            ]}
                          >
                            {membershipLoading ? "Carregando..." : isMember ? "Sair da tribo" : "Entrar na tribo"}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>

                    {/* COLUNA DIREITA */}
                    <View style={styles.webRight}>
                      {/* Tabs */}
                      <View
                        style={[
                          styles.tabsContainer,
                          {
                            backgroundColor: theme.colors.background,
                          },
                        ]}
                      >
                        {tabs.map((tab) => (
                          <TouchableOpacity
                            key={tab.key}
                            activeOpacity={0.9}
                            onPress={() => setActiveTab(tab.key)}
                            style={[
                              styles.tabItem,
                              {
                                backgroundColor:
                                  activeTab === tab.key
                                    ? theme.colors.primary
                                    : "transparent",
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.tabItemText,
                                {
                                  color:
                                    activeTab === tab.key
                                      ? "#FFFFFF"
                                      : theme.colors.textMuted,
                                },
                              ]}
                            >
                              {tab.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {renderTabContent()}
                    </View>
                  </View>
                </View>
              </View>
            </View>
          ) : (
            // MOBILE / APP
            <>
              <View style={styles.mobileHeaderRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.mobileDescription} numberOfLines={3}>
                    {tribe.description
                      ? tribe.description
                      : "Entre para a tribo e começa a construir uma nova bolha social com a cara do LUPYY."}
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleToggleMembership}
                  disabled={joining || membershipLoading}
                  style={[
                    styles.leftButton,
                    {
                      backgroundColor: isMember
                        ? theme.colors.surface
                        : theme.colors.primary,
                    },
                  ]}
                >
                  {joining || membershipLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text
                      style={[
                        styles.leftButtonText,
                        {
                          color: isMember ? theme.colors.text : "#FFFFFF",
                        },
                      ]}
                    >
                      {membershipLoading ? "Carregando..." : isMember ? "Sair da tribo" : "Entrar na tribo"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Tabs */}
              <View
                style={[
                  styles.tabsContainer,
                  {
                    marginTop: 16,
                    backgroundColor: theme.colors.surfaceElevated,
                  },
                ]}
              >
                {tabs.map((tab) => (
                  <TouchableOpacity
                    key={tab.key}
                    activeOpacity={0.9}
                    onPress={() => setActiveTab(tab.key)}
                    style={[
                      styles.tabItem,
                      {
                        backgroundColor:
                          activeTab === tab.key
                            ? theme.colors.primary
                            : "transparent",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabItemText,
                        {
                          color:
                            activeTab === tab.key
                              ? "#FFFFFF"
                              : theme.colors.textMuted,
                        },
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {renderTabContent()}
            </>
          )}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {coverActionsVisible && canManageCover ? (
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: theme.colors.surfaceElevated },
            ]}
          >
            <View style={styles.rowSpaceBetween}>
              <Text style={styles.modalTitle}>Capa da tribo</Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setCoverActionsVisible(false)}
              >
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              {Platform.OS === "web"
                ? "Isso vai abrir o seletor de arquivos do navegador."
                : "Isso vai abrir sua galeria de fotos."}
            </Text>

            <TouchableOpacity
              activeOpacity={0.85}
              disabled={uploadingCover}
              onPress={confirmCoverPick}
              style={[
                styles.coverModalPrimary,
                { backgroundColor: theme.colors.primary },
                uploadingCover ? { opacity: 0.7 } : null,
              ]}
            >
              {uploadingCover ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.coverModalPrimaryText}>Trocar capa</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setCoverActionsVisible(false)}
              style={[
                styles.coverModalSecondary,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              <Text style={styles.coverModalSecondaryText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // gerais
  row: { flexDirection: "row", alignItems: "center" },
  rowSpaceBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  flex1: { flex: 1 },

  centeredBlockFlex: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  centeredBlock: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#E5E7EB",
  },
  loadingSmallText: {
    marginTop: 6,
    fontSize: 11,
    color: "#9CA3AF",
  },

  // capa
  coverContainer: { position: "relative", height: 210, width: "100%" },
  coverImage: { height: "100%", width: "100%" },
  coverPlaceholder: {
    height: "100%",
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#130636",
  },
  coverInitial: { fontSize: 42, fontWeight: "bold", color: "#fff" },
  coverTopBar: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 50,
    elevation: 50,
  },
  coverBackButton: {
    height: 36,
    width: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  coverBackText: { fontSize: 20, color: "#fff" },
  coverTag: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  coverTagText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    color: "#F9FAFB",
  },
  coverGradientOverlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    zIndex: 10,
    elevation: 10,
  },
  coverBottomInfo: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    zIndex: 40,
    elevation: 40,
  },
  coverTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  coverMeta: {
    fontSize: 12,
    fontWeight: "500",
    color: "#E5E7EB",
  },

  coverEditHint: {
    marginTop: 8,
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  coverEditHintText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#F9FAFB",
  },

  coverModalPrimary: {
    marginTop: 14,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  coverModalPrimaryText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  coverModalSecondary: {
    marginTop: 10,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  coverModalSecondaryText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#E5E7EB",
  },

  // web modal
  webWrapper: {
    width: "100%",
    alignItems: "center",
  },
  webModal: {
    width: "100%",
    maxWidth: 1200,
    borderRadius: 24,
    marginTop: -32,
    padding: 2,
  },
  webModalCard: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
  },
  webColumns: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 24,
  },
  webLeft: {
    width: 300,
  },
  webRight: {
    flex: 1,
  },

  leftTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#E5E7EB",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  leftDescription: {
    marginTop: 8,
    fontSize: 13,
    color: "#D1D5DB",
  },
  leftButton: {
    marginTop: 16,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    zIndex: 9999,
    elevation: 9999,
  },
  leftButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },

  // mobile header
  mobileHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  mobileDescription: {
    fontSize: 13,
    color: "#D1D5DB",
  },

  // chips
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#111827",
  },
  chipText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#E5E7EB",
  },

  // tabs
  tabsContainer: {
    flexDirection: "row",
    borderRadius: 999,
    padding: 3,
  },
  tabItem: {
    flex: 1,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  tabItemText: {
    fontSize: 12,
    fontWeight: "600",
  },

  // sections/card
  cardSection: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sectionHeaderLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#9CA3AF",
  },
  sectionHeaderHelper: { fontSize: 12, marginTop: 4 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#F9FAFB",
  },

  infoTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#E5E7EB",
  },
  infoText: {
    fontSize: 12,
    marginTop: 4,
    color: "#9CA3AF",
  },
  infoTextStrong: {
    fontSize: 13,
    marginTop: 4,
    color: "#E5E7EB",
  },

  // feed
  inputBox: {
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  feedInput: {
    maxHeight: 96,
    fontSize: 13,
    color: "#F9FAFB",
  },
  primaryChipButton: {
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  primaryChipButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  postAuthor: {
    fontSize: 11,
    fontWeight: "700",
    color: "#F9A8D4",
  },
  postMeta: {
    fontSize: 10,
    color: "#9CA3AF",
  },
  postContent: {
    marginTop: 6,
    fontSize: 13,
    color: "#F9FAFB",
  },

  // chat
  chatContainer: {
    marginTop: 16,
    borderRadius: 18,
    overflow: "hidden",
    flexDirection: "row",
  },
  channelsColumn: {
    width: 170,
    borderRightWidth: 1,
  },
  channelsTitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#9CA3AF",
  },  channelsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 6,
  },
  channelsAddBtn: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6D28D9",
  },

  channelsEmpty: {
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  channelItem: {
    marginHorizontal: 6,
    marginTop: 6,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  channelItemText: { fontSize: 12, fontWeight: "600" },
  chatMain: { flex: 1, position: "relative" },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  chatHeaderTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#F9FAFB",
  },
  chatHeaderSubtitle: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  chatHeaderMeta: {
    fontSize: 10,
    color: "#9CA3AF",
  },
  chatMessagesArea: { flex: 1, minHeight: 0 },
  chatBubbleRow: { marginVertical: 2, flexDirection: "row" },
  chatBubble: {
    maxWidth: "80%",
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chatBubbleAuthor: { fontSize: 11, fontWeight: "600" },
  chatBubbleTime: { fontSize: 9 },
  chatBubbleText: { marginTop: 2, fontSize: 12 },
  chatInputBar: {
    borderTopWidth: 1,
    borderTopColor: "rgba(156,74,255,0.18)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(10,6,22,0.92)",
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
  },
  chatInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    fontSize: 13,
    color: "#F9FAFB",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(156,74,255,0.22)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  // ranking
  rankingRow: {
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rankingBadge: {
    height: 32,
    width: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111827",
    marginRight: 8,
  },
  rankingBadgeText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#E5E7EB",
  },
  rankingName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#F9FAFB",
  },
  rankingSubtitle: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  rankingTag: {
    fontSize: 11,
    fontWeight: "600",
    color: "#F9A8D4",
  },


// members
memberRow: {
  borderRadius: 16,
  paddingHorizontal: 12,
  paddingVertical: 10,
},
memberAvatarWrap: {
  height: 40,
  width: 40,
  borderRadius: 999,
  overflow: "hidden",
  marginRight: 10,
  backgroundColor: "#0b1020",
  alignItems: "center",
  justifyContent: "center",
},
memberAvatar: { height: "100%", width: "100%" },
memberAvatarFallback: {
  height: "100%",
  width: "100%",
  alignItems: "center",
  justifyContent: "center",
},
memberAvatarFallbackText: {
  fontSize: 16,
  fontWeight: "800",
  color: "#E5E7EB",
},
memberName: {
  fontSize: 13,
  fontWeight: "700",
  color: "#F9FAFB",
},
memberUser: {
  fontSize: 11,
  marginTop: 2,
  color: "#9CA3AF",
},
rolePill: {
  borderRadius: 999,
  paddingHorizontal: 10,
  paddingVertical: 5,
  backgroundColor: "#111827",
},
rolePillText: {
  fontSize: 11,
  fontWeight: "700",
  color: "#E5E7EB",
  textTransform: "uppercase",
  letterSpacing: 0.6,
},

// modal (simples e consistente com o estilo atual)
modalOverlay: {
  position: "absolute",
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  backgroundColor: "rgba(0,0,0,0.55)",
},
modalCard: {
  width: "100%",
  maxWidth: 520,
  borderRadius: 20,
  paddingHorizontal: 14,
  paddingVertical: 12,
},
modalTitle: {
  fontSize: 14,
  fontWeight: "800",
  color: "#F9FAFB",
},
modalClose: {
  fontSize: 16,
  fontWeight: "800",
  color: "#E5E7EB",
  paddingHorizontal: 6,
  paddingVertical: 2,
},
modalSubtitle: {
  marginTop: 6,
  fontSize: 12,
  color: "#9CA3AF",
},
modalInput: {
  marginTop: 6,
  borderRadius: 14,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 14,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
},
modalTypeRow: {
  flexDirection: "row",
  gap: 10,
  marginTop: 12,
},
modalTypeOption: {
  flex: 1,
  borderRadius: 14,
  paddingVertical: 10,
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
},
modalTypeText: {
  fontSize: 13,
  fontWeight: "800",
},
modalAction: {
  borderRadius: 16,
  paddingHorizontal: 12,
  paddingVertical: 10,
  alignItems: "center",
  justifyContent: "center",
},
modalActionText: {
  fontSize: 13,
  fontWeight: "700",
  color: "#FFFFFF",
},
modalActionDanger: {
  backgroundColor: "rgba(239, 68, 68, 0.18)",
  borderWidth: 1,
  borderColor: "rgba(239, 68, 68, 0.35)",
},
modalDanger: {
  borderRadius: 16,
  paddingHorizontal: 12,
  paddingVertical: 10,
  alignItems: "center",
  justifyContent: "center",
},
modalDangerText: {
  fontSize: 13,
  fontWeight: "800",
  color: "#FCA5A5",
},
modalCancel: {
  borderRadius: 16,
  paddingHorizontal: 12,
  paddingVertical: 10,
  alignItems: "center",
  justifyContent: "center",
},
modalCancelText: {
  fontSize: 13,
  fontWeight: "700",
  color: "#E5E7EB",
},
  bold: { fontWeight: "600", color: "#E5E7EB" },
  reactionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  reactionPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  reactionPillText: {
    fontSize: 12,
    color: "#e5e7eb",
    fontWeight: "700",
  },
  replyPreview: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  replyPreviewLeft: {
    flex: 1,
    paddingRight: 10,
  },
  replyPreviewLabel: {
    fontSize: 12,
    color: "#9ca3af",
    fontWeight: "700",
    marginBottom: 2,
  },
  replyPreviewText: {
    fontSize: 13,
    color: "#e5e7eb",
    fontWeight: "600",
  },
  replyPreviewClose: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  replyPreviewCloseText: {
    color: "#e5e7eb",
    fontWeight: "900",
    fontSize: 14,
  },
  emojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },
  emojiBtn: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  emojiText: {
    fontSize: 22,
  },

});