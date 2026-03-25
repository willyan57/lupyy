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
  Modal,
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

/* ─── Types ─── */
type Tribe = {
  id: string; name: string; description: string | null; category: string | null;
  cover_url: string | null; members_count: number; is_public: boolean;
  created_at: string; owner_id: string;
};
type TribePost = {
  id: string; tribe_id: string; user_id: string; content: string | null;
  media_url: string | null; created_at: string;
  // enriched
  username?: string | null; avatar_url?: string | null; full_name?: string | null;
};
type TribeChannel = {
  id: string; tribe_id: string; name: string; slug: string;
  description: string | null; type: string; is_private: boolean;
  created_by: string | null; created_at: string;
};
type TribeMessage = {
  id: string; tribe_id: string; channel_id: string; user_id: string;
  content: string; created_at: string; is_deleted?: boolean;
  deleted_by_role?: "owner" | "moderator"; deleted_at?: string;
  reactions?: { emoji: string; count: number }[];
  // enriched
  username?: string | null; avatar_url?: string | null; full_name?: string | null;
};
type TribeMemberDetailed = {
  tribe_id: string; user_id: string; role: "owner" | "moderator" | "member";
  joined_at: string; username: string | null; full_name: string | null; avatar_url: string | null;
};

type TabKey = "feed" | "chat" | "ranking" | "about" | "members";

const TAB_ICONS: Record<TabKey, string> = {
  feed: "newspaper-outline",
  chat: "chatbubbles-outline",
  ranking: "trophy-outline",
  members: "people-outline",
  about: "information-circle-outline",
};

const tabs: { key: TabKey; label: string }[] = [
  { key: "feed", label: "Feed" },
  { key: "chat", label: "Chat" },
  { key: "ranking", label: "Ranking" },
  { key: "members", label: "Membros" },
  { key: "about", label: "Sobre" },
];

const EMOJI_LIST = ["👍", "❤️", "😂", "🔥", "😮", "😢", "🎉", "💯"];

/* ─── Helpers ─── */
const notify = (title: string, msg: string) => {
  if (Platform.OS === "web") { window.alert(`${title}\n\n${msg}`); return; }
  Alert.alert(title, msg);
};

export default function TribeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();
  const isLargeWeb = Platform.OS === "web" && width >= 1024;
  const chatScrollRef = useRef<ScrollView>(null);

  const goBackToTribes = () => {
    try { router.replace("/tribes" as any); } catch { try { router.push("/tribes" as any); } catch {} }
  };

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
    return "image/jpeg";
  };

  const prepareCoverImage = async (uri: string) => {
    try {
      const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG });
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
      return { body: blob as any, contentType: (blob as any)?.type || "image/jpeg" };
    }
    let readUri = uri;
    if (readUri.startsWith("content://")) {
      const target = `${FileSystem.cacheDirectory || ""}tribe_cover_${Date.now()}`;
      try { await FileSystem.copyAsync({ from: readUri, to: target }); readUri = target; } catch {}
    }
    const base64 = await FileSystem.readAsStringAsync(readUri, { encoding: FileSystem.EncodingType.Base64 });
    return { body: Buffer.from(base64, "base64") as any, contentType: null as any };
  };

  /* ─── State ─── */
  const [tribe, setTribe] = useState<Tribe | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("feed");

  // Join requests (private tribes)
  const [myJoinRequest, setMyJoinRequest] = useState<{ id: string; status: string } | null>(null);
  const [pendingRequests, setPendingRequests] = useState<{ id: string; user_id: string; message: string | null; created_at: string; username?: string | null; avatar_url?: string | null; full_name?: string | null }[]>([]);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  const [isOwner, setIsOwner] = useState(false);
  const [myRole, setMyRole] = useState<"owner" | "moderator" | "member" | null>(null);
  const [canManageMembers, setCanManageMembers] = useState(false);
  const [canManageChannels, setCanManageChannels] = useState(false);
  const [canManageRoles, setCanManageRoles] = useState(false);
  const [canManageMessages, setCanManageMessages] = useState(false);

  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverActionsVisible, setCoverActionsVisible] = useState(false);
  const canManageCover = myRole === "owner" || myRole === "moderator";

  // Members
  const [members, setMembers] = useState<TribeMemberDetailed[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberModalVisible, setMemberModalVisible] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TribeMemberDetailed | null>(null);

  // Profiles cache
  const profilesCache = useRef<Map<string, { username: string | null; avatar_url: string | null; full_name: string | null }>>(new Map());

  // Feed
  const [posts, setPosts] = useState<TribePost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [creatingPost, setCreatingPost] = useState(false);
  const [newPostContent, setNewPostContent] = useState("");

  // Chat
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

  /* ─── Profile enrichment ─── */
  const enrichWithProfiles = async <T extends { user_id: string }>(items: T[]): Promise<(T & { username?: string | null; avatar_url?: string | null; full_name?: string | null })[]> => {
    const uncached = items.filter(i => !profilesCache.current.has(i.user_id)).map(i => i.user_id);
    const unique = [...new Set(uncached)];
    if (unique.length > 0) {
      const { data } = await supabase.from("profiles").select("id, username, avatar_url, full_name").in("id", unique);
      (data || []).forEach((p: any) => {
        profilesCache.current.set(p.id, { username: p.username, avatar_url: p.avatar_url, full_name: p.full_name });
      });
    }
    return items.map(i => {
      const p = profilesCache.current.get(i.user_id);
      return { ...i, username: p?.username ?? null, avatar_url: p?.avatar_url ?? null, full_name: p?.full_name ?? null };
    });
  };

  /* ─── Load tribe ─── */
  useEffect(() => {
    if (!id) return;
    let isMounted = true;
    const load = async () => {
      setLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData?.user?.id ?? null;
      if (isMounted) setUserId(currentUserId);
      const { data: tribeData, error: tribeError } = await supabase.from("tribes").select("*").eq("id", id).single();
      if (tribeError) { setLoading(false); return; }
      if (isMounted && tribeData) { setTribe(tribeData as Tribe); refreshMembersCount(id as string); }
      if (isMounted) setLoading(false);
    };
    load();
    return () => { isMounted = false; };
  }, [id]);

  /* ─── Membership + Posts ─── */
  useEffect(() => {
    if (!id) return;
    let isMounted = true;
    const loadMembershipAndPosts = async () => {
      setMembershipLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData?.user?.id ?? null;
      if (currentUserId && isMounted) {
        const { data: membershipData, error: membershipErr } = await supabase.from("tribe_members").select("role").eq("tribe_id", id).eq("user_id", currentUserId).maybeSingle();
        const memberExists = !!membershipData && !membershipErr;
        if (isMounted) setIsMember(memberExists);
        if (memberExists) {
          const role = (membershipData as any)?.role as "owner" | "moderator" | "member" | undefined;
          const safeRole = role === "owner" || role === "moderator" || role === "member" ? role : "member";
          if (isMounted) {
            setMyRole(safeRole); setIsOwner(safeRole === "owner");
            const admin = safeRole === "owner" || safeRole === "moderator";
            setCanManageMembers(admin); setCanManageChannels(admin);
            setCanManageRoles(safeRole === "owner"); setCanManageMessages(admin);
          }
        } else if (isMounted) {
          setMyRole(null); setIsOwner(false); setCanManageMembers(false);
          setCanManageChannels(false); setCanManageRoles(false); setCanManageMessages(false);
        }
      }
      setPostsLoading(true);
      const { data: postsData } = await supabase.from("tribe_posts").select("*").eq("tribe_id", id).order("created_at", { ascending: false });
      if (isMounted && postsData) {
        const enriched = await enrichWithProfiles(postsData as TribePost[]);
        setPosts(enriched);
      }
      if (isMounted) { setPostsLoading(false); setMembershipLoading(false); }
    };
    loadMembershipAndPosts();
    return () => { isMounted = false; };
  }, [id]);

  /* ─── Channels ─── */
  const loadChannels = async (opts?: { forceSelectFirst?: boolean; selectChannelId?: string | null }) => {
    if (!id) return;
    setChannelsLoading(true);
    const { data, error } = await supabase.from("tribe_channels").select("*").eq("tribe_id", id).order("created_at", { ascending: true });
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
        if (!stillExists) { const geral = list.find((c) => c.slug === "geral") ?? (list.length > 0 ? list[0] : null); return geral ? geral.id : null; }
        return prev;
      });
    }
    setChannelsLoading(false);
  };

  const createChannel = async () => {
    if (!id || !canManageChannels) return;
    const cleanName = newChannelName.trim();
    if (!cleanName.length) return;
    const slug = cleanName.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    const { data: authData } = await supabase.auth.getUser();
    const currentUserId = authData?.user?.id ?? userId ?? null;
    const { data, error } = await supabase.from("tribe_channels").insert({
      tribe_id: id, name: cleanName, slug: slug || "canal", type: newChannelType, is_private: false, created_by: currentUserId,
    } as any).select("id").single();
    if (error) { notify("Ops", (error as any)?.message || "Não foi possível criar o canal."); return; }
    setChannelModalVisible(false); setNewChannelName(""); setNewChannelType("text");
    const newId = (data as any)?.id as string | undefined;
    await loadChannels({ selectChannelId: newId ?? null, forceSelectFirst: true });
  };

  useEffect(() => { if (id) loadChannels(); }, [id]);

  /* ─── Messages ─── */
  useEffect(() => {
    if (!activeChannelId || !id) { setChatMessages([]); return; }
    let isMounted = true;
    const loadMessages = async () => {
      setChatLoading(true);
      const { data, error } = await supabase.from("tribe_messages").select("*").eq("tribe_id", id).eq("channel_id", activeChannelId).order("created_at", { ascending: true });
      if (!isMounted) return;
      if (!error && data) {
        const hydrated = await applyMessageMeta(data as TribeMessage[]);
        if (!isMounted) return;
        const enriched = await enrichWithProfiles(hydrated);
        if (!isMounted) return;
        setChatMessages(enriched);
      }
      setChatLoading(false);
    };
    loadMessages();
    return () => { isMounted = false; };
  }, [id, activeChannelId]);

  /* ─── Realtime ─── */
  useEffect(() => {
    if (!id) return;
    const channel = supabase.channel(`tribe_messages_${id}`).on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "tribe_messages", filter: `tribe_id=eq.${id}` },
      async (payload: RealtimePostgresChangesPayload<TribeMessage>) => {
        const newMsg = payload.new as TribeMessage;
        if (!activeChannelId || newMsg.channel_id !== activeChannelId) return;
        const [enriched] = await enrichWithProfiles([newMsg]);
        setChatMessages((prev) => {
          if (prev.some((m) => m.id === enriched.id)) return prev;
          return [...prev, enriched];
        });
      }
    );
    return () => { supabase.removeChannel(channel); };
  }, [id, activeChannelId]);

  /* ─── Members ─── */
  useEffect(() => {
    if (!id || !tribe) return;
    let isMounted = true;
    const loadMembers = async () => {
      const canView = tribe.is_public || isMember;
      if (!canView) { if (isMounted) setMembers([]); return; }
      setMembersLoading(true);
      const { data, error } = await supabase.from("view_tribe_members_detailed").select("*").eq("tribe_id", id).order("role", { ascending: true }).order("joined_at", { ascending: true });
      if (!isMounted) return;
      if (!error && data) setMembers(data as TribeMemberDetailed[]); else setMembers([]);
      setMembersLoading(false);
    };
    if (activeTab === "members") loadMembers();
    return () => { isMounted = false; };
  }, [id, activeTab, isMember, tribe]);

  const refreshMembersCount = async (tribeId: string) => {
    const { count } = await supabase.from("tribe_members").select("user_id", { count: "exact", head: true }).eq("tribe_id", tribeId);
    if (typeof count === "number") setTribe((prev) => (prev ? { ...prev, members_count: count } : prev));
  };

  /* ─── Message meta (deletions + reactions) ─── */
  const applyMessageMeta = async (base: TribeMessage[]) => {
    if (!id || !activeChannelId || base.length === 0) return base;
    const ids = base.map((m) => m.id);
    const [{ data: deletions }, { data: reactions }] = await Promise.all([
      supabase.from("tribe_message_deletions").select("message_id, deleted_by_role, deleted_at").in("message_id", ids),
      supabase.from("tribe_message_reactions").select("message_id, emoji").in("message_id", ids),
    ]);
    const deletedMap = new Map<string, { deleted_by_role: "owner" | "moderator"; deleted_at: string }>();
    (deletions || []).forEach((d: any) => { deletedMap.set(d.message_id, { deleted_by_role: d.deleted_by_role, deleted_at: d.deleted_at }); });
    const reactionMap = new Map<string, Map<string, number>>();
    (reactions || []).forEach((r: any) => {
      const perMsg = reactionMap.get(r.message_id) || new Map<string, number>();
      perMsg.set(r.emoji, (perMsg.get(r.emoji) || 0) + 1);
      reactionMap.set(r.message_id, perMsg);
    });
    return base.map((m) => {
      const del = deletedMap.get(m.id);
      const per = reactionMap.get(m.id);
      const summary = per ? Array.from(per.entries()).map(([emoji, count]) => ({ emoji, count })) : [];
      return { ...m, is_deleted: !!del, deleted_by_role: del?.deleted_by_role, deleted_at: del?.deleted_at, reactions: summary };
    });
  };

  /* ─── Load join request status ─── */
  const loadMyJoinRequest = async (uid: string, tribeId: string) => {
    const { data } = await supabase.from("tribe_join_requests").select("id, status").eq("tribe_id", tribeId).eq("user_id", uid).maybeSingle();
    setMyJoinRequest(data ? { id: data.id as string, status: data.status as string } : null);
  };

  const loadPendingRequests = async (tribeId: string) => {
    const { data } = await supabase.from("tribe_join_requests").select("id, user_id, message, created_at").eq("tribe_id", tribeId).eq("status", "pending").order("created_at", { ascending: true });
    if (data && data.length > 0) {
      const enriched = await enrichWithProfiles(data as any[]);
      setPendingRequests(enriched);
      setPendingRequestsCount(enriched.length);
    } else {
      setPendingRequests([]);
      setPendingRequestsCount(0);
    }
  };

  useEffect(() => {
    if (!id || !userId) return;
    loadMyJoinRequest(userId, id);
    if (canManageMembers) loadPendingRequests(id);
  }, [id, userId, canManageMembers]);

  /* ─── Actions ─── */
  const handleToggleMembership = async () => {
    if (!tribe || joining) return;
    setJoining(true);
    try {
      let currentUserId = userId;
      if (!currentUserId) {
        const { data: authData } = await supabase.auth.getUser();
        currentUserId = authData?.user?.id ?? null;
        if (currentUserId) setUserId(currentUserId);
        if (!currentUserId) { notify("Entrar na tribo", "Você precisa estar logado."); return; }
      }
      if (isMember) {
        const { error } = await supabase.from("tribe_members").delete().eq("tribe_id", tribe.id).eq("user_id", currentUserId);
        if (error) { notify("Ops", (error as any)?.message || "Erro ao sair."); return; }
        setIsMember(false); await refreshMembersCount(tribe.id); return;
      }

      // Private tribe → send join request
      if (!tribe.is_public) {
        if (myJoinRequest?.status === "pending") {
          // Cancel request
          await supabase.from("tribe_join_requests").delete().eq("id", myJoinRequest.id);
          setMyJoinRequest(null);
          notify("Solicitação cancelada", "Sua solicitação foi cancelada.");
          return;
        }
        const { data, error } = await supabase.from("tribe_join_requests").insert({
          tribe_id: tribe.id, user_id: currentUserId, status: "pending",
        } as any).select("id, status").single();
        if (error) {
          const code = (error as any)?.code;
          if (code === "23505") { notify("Já solicitado", "Você já enviou uma solicitação."); return; }
          notify("Ops", (error as any)?.message || "Erro ao solicitar."); return;
        }
        if (data) setMyJoinRequest({ id: data.id as string, status: "pending" });
        notify("Solicitação enviada! 🎉", "O dono ou moderador da tribo vai analisar seu pedido.");
        return;
      }

      // Public tribe → join directly
      const { error } = await supabase.from("tribe_members").insert({ tribe_id: tribe.id, user_id: currentUserId, role: "member" } as any);
      if (error) {
        const code = (error as any)?.code;
        if (code === "23505") { setIsMember(true); await refreshMembersCount(tribe.id); return; }
        notify("Ops", (error as any)?.message || "Erro ao entrar."); return;
      }
      setIsMember(true); await refreshMembersCount(tribe.id);
    } finally { setJoining(false); }
  };

  const handleApproveRequest = async (requestId: string) => {
    if (!userId || !id) return;
    try {
      const { error } = await supabase.rpc("approve_join_request", { _request_id: requestId, _reviewer_id: userId });
      if (error) { notify("Ops", (error as any)?.message || "Erro ao aprovar."); return; }
      notify("Aprovado! ✅", "O membro foi adicionado à tribo.");
      await loadPendingRequests(id);
      await refreshMembersCount(id);
    } catch (err: any) { notify("Ops", err?.message || "Erro ao aprovar."); }
  };

  const handleRejectRequest = async (requestId: string) => {
    if (!userId || !id) return;
    try {
      const { error } = await supabase.rpc("reject_join_request", { _request_id: requestId, _reviewer_id: userId });
      if (error) { notify("Ops", (error as any)?.message || "Erro ao rejeitar."); return; }
      notify("Rejeitado", "A solicitação foi recusada.");
      await loadPendingRequests(id);
    } catch (err: any) { notify("Ops", err?.message || "Erro ao rejeitar."); }
  };

  const handleCreatePost = async () => {
    if (!tribe || !userId || !isMember || creatingPost) return;
    const content = newPostContent.trim();
    if (!content.length) return;
    setCreatingPost(true);
    const { data, error } = await supabase.from("tribe_posts").insert({ tribe_id: tribe.id, user_id: userId, content } as any).select("*").single();
    if (!error && data) {
      const [enriched] = await enrichWithProfiles([data as TribePost]);
      setPosts((prev) => [enriched, ...prev]);
      setNewPostContent("");
    }
    setCreatingPost(false);
  };

  const handleSendChatMessage = async () => {
    if (!tribe || !userId || !isMember || sendingChat || !activeChannelId) return;
    const content = newChatMessage.trim();
    if (!content.length) return;
    setSendingChat(true);
    const finalContent = replyingTo
      ? `↩︎ ${replyingTo.user_id === userId ? "Você" : (replyingTo.username || replyingTo.full_name || "Membro")}: ${replyingTo.content.slice(0, 80)}\n${content}`
      : content;
    const { data, error } = await supabase.from("tribe_messages").insert({
      tribe_id: tribe.id, channel_id: activeChannelId, user_id: userId, content: finalContent,
    } as any).select("*").single();
    if (!error && data) {
      const [enriched] = await enrichWithProfiles([data as TribeMessage]);
      setChatMessages((prev) => { if (prev.some((m) => m.id === enriched.id)) return prev; return [...prev, enriched]; });
      setNewChatMessage(""); setReplyingTo(null);
    }
    setSendingChat(false);
  };

  const openMessageActions = (msg: TribeMessage) => { setSelectedMessage(msg); setMessageActionsVisible(true); };
  const closeMessageActions = () => { setMessageActionsVisible(false); setSelectedMessage(null); setEmojiPickerVisible(false); };
  const startReply = () => { if (!selectedMessage || selectedMessage.is_deleted) return; setReplyingTo(selectedMessage); closeMessageActions(); };
  const cancelReply = () => setReplyingTo(null);

  const addReaction = async (emoji: string) => {
    if (!selectedMessage || !userId || !id || !activeChannelId || selectedMessage.is_deleted) return;
    await supabase.from("tribe_message_reactions").insert({ tribe_id: id, channel_id: activeChannelId, message_id: selectedMessage.id, user_id: userId, emoji } as any);
    const hydrated = await applyMessageMeta(chatMessages);
    const enriched = await enrichWithProfiles(hydrated);
    setChatMessages(enriched);
    closeMessageActions();
  };

  const deleteMessage = async () => {
    if (!selectedMessage || !userId || !id || !activeChannelId || !canManageMessages || selectedMessage.is_deleted) return;
    const role = myRole === "owner" ? "owner" : "moderator";
    await supabase.from("tribe_message_deletions").insert({ tribe_id: id, channel_id: activeChannelId, message_id: selectedMessage.id, deleted_by: userId, deleted_by_role: role } as any);
    const hydrated = await applyMessageMeta(chatMessages);
    const enriched = await enrichWithProfiles(hydrated);
    setChatMessages(enriched);
    closeMessageActions();
  };

  // Member actions
  const roleLabel = (role: "owner" | "moderator" | "member") => role === "owner" ? "Dono" : role === "moderator" ? "Mod" : "Membro";
  const openMemberModal = (m: TribeMemberDetailed) => { if (!(myRole === "owner" || myRole === "moderator")) return; setSelectedMember(m); setMemberModalVisible(true); };
  const closeMemberModal = () => { setMemberModalVisible(false); setSelectedMember(null); };

  const handleRemoveMember = async () => {
    if (!tribe || !selectedMember || !userId || selectedMember.user_id === userId || selectedMember.role === "owner") return;
    const { error } = await supabase.from("tribe_members").delete().eq("tribe_id", tribe.id).eq("user_id", selectedMember.user_id);
    if (error) { notify("Ops", error.message || "Erro ao remover."); return; }
    setMembers((prev) => prev.filter((x) => x.user_id !== selectedMember.user_id));
    setTribe({ ...tribe, members_count: Math.max(0, tribe.members_count - 1) });
    closeMemberModal();
  };

  const handleSetMemberRole = async (role: "moderator" | "member") => {
    if (!tribe || !selectedMember || myRole !== "owner" || !userId || selectedMember.user_id === userId || selectedMember.role === "owner") return;
    const { error } = await supabase.from("tribe_members").update({ role } as any).eq("tribe_id", tribe.id).eq("user_id", selectedMember.user_id);
    if (error) { notify("Ops", error.message || "Erro ao alterar cargo."); return; }
    setMembers((prev) => prev.map((x) => (x.user_id === selectedMember.user_id ? { ...x, role } : x)));
    setSelectedMember((prev) => (prev ? { ...prev, role } : prev));
  };

  // Cover
  const pickAndUploadCover = async () => {
    if (!id || !tribe || !canManageCover || uploadingCover) return;
    try {
      setUploadingCover(true);
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (perm.status !== "granted") { notify("Permissão necessária", "Autorize acesso às fotos."); return; }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ((ImagePicker as any).MediaType?.Images ?? (ImagePicker as any).MediaTypeOptions?.Images),
        quality: 0.85, allowsEditing: true, aspect: [16, 9],
      });
      if ((result as any)?.canceled) return;
      const asset = (result as any)?.assets?.[0];
      const uri = asset?.uri as string | undefined;
      if (!uri) return;
      const prepared = await prepareCoverImage(uri);
      const path = `covers/${id}/${Date.now()}.${prepared.ext}`;
      const { body, contentType } = await uriToUploadBody(prepared.uri);
      const { error: upErr } = await supabase.storage.from("tribes").upload(path, body as any, { contentType: contentType || prepared.contentType, upsert: true });
      if (upErr) { notify("Ops", "Não foi possível enviar a capa."); return; }
      const { error: dbErr } = await supabase.from("tribes").update({ cover_url: path } as any).eq("id", id);
      if (dbErr) { notify("Ops", "Não foi possível salvar a capa."); return; }
      setTribe((prev) => (prev ? { ...prev, cover_url: path } : prev));
    } finally { setUploadingCover(false); }
  };

  /* ─── Helpers ─── */
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const formatRelativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "agora";
    if (mins < 60) return `${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  };

  const getDisplayName = (item: { user_id: string; username?: string | null; full_name?: string | null }) => {
    if (userId && item.user_id === userId) return "Você";
    return item.full_name?.trim() || item.username?.trim() || "Membro";
  };

  const getAvatarInitial = (name: string) => name.charAt(0).toUpperCase();

  /* ─────────────────────────────────────────── */
  /*  TAB CONTENT                                */
  /* ─────────────────────────────────────────── */
  const renderTabContent = () => {
    if (!tribe) return null;

    /* ═══ FEED ═══ */
    if (activeTab === "feed") {
      return (
        <View style={{ marginTop: 12, gap: 10 }}>
          {/* New post */}
          {isMember ? (
            <View style={[st.feedCard, { backgroundColor: theme.colors.surfaceElevated }]}>
              <View style={st.feedNewHeader}>
                <Ionicons name="create-outline" size={16} color={theme.colors.primary} />
                <Text style={[st.feedNewLabel, { color: theme.colors.text }]}>Compartilhar com a tribo</Text>
              </View>
              <View style={[st.feedInputWrap, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <TextInput
                  value={newPostContent}
                  onChangeText={setNewPostContent}
                  placeholder="Compartilhe uma ideia, anúncio ou insight..."
                  placeholderTextColor={theme.colors.textMuted}
                  multiline
                  style={[st.feedInput, { color: theme.colors.text }]}
                />
              </View>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={handleCreatePost}
                disabled={creatingPost || !newPostContent.trim().length}
                style={[st.postBtn, { backgroundColor: creatingPost || !newPostContent.trim().length ? theme.colors.surface : theme.colors.primary }]}
              >
                {creatingPost ? <ActivityIndicator size="small" color="#fff" /> : (
                  <View style={st.postBtnContent}>
                    <Ionicons name="send" size={14} color="#fff" />
                    <Text style={st.postBtnText}>Publicar</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[st.feedCard, { backgroundColor: theme.colors.surfaceElevated }]}>
              <Text style={[st.infoTitle, { color: theme.colors.text }]}>Entre na tribo para postar no feed.</Text>
              <Text style={[st.infoText, { color: theme.colors.textMuted }]}>Só membros podem criar posts.</Text>
            </View>
          )}

          {/* Posts */}
          {postsLoading ? (
            <View style={st.centeredBlock}><ActivityIndicator /><Text style={[st.loadingSmall, { color: theme.colors.textMuted }]}>Carregando feed...</Text></View>
          ) : posts.length === 0 ? (
            <View style={[st.feedCard, { backgroundColor: theme.colors.surfaceElevated, alignItems: "center", paddingVertical: 28 }]}>
              <Ionicons name="newspaper-outline" size={32} color={theme.colors.textMuted} />
              <Text style={[st.infoTitle, { color: theme.colors.text, marginTop: 10 }]}>Nenhum post ainda</Text>
              <Text style={[st.infoText, { color: theme.colors.textMuted, textAlign: "center" }]}>Quando surgirem novidades, o feed vira o mural oficial da tribo.</Text>
            </View>
          ) : (
            posts.map((post) => (
              <View key={post.id} style={[st.feedCard, { backgroundColor: theme.colors.surfaceElevated }]}>
                <View style={st.postHeader}>
                  {post.avatar_url ? (
                    <Image source={{ uri: post.avatar_url }} style={st.postAvatar} />
                  ) : (
                    <View style={[st.postAvatarFallback, { backgroundColor: theme.colors.primary + "22" }]}>
                      <Text style={[st.postAvatarText, { color: theme.colors.primary }]}>{getAvatarInitial(getDisplayName(post))}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[st.postAuthor, { color: theme.colors.text }]}>{getDisplayName(post)}</Text>
                    <Text style={[st.postTime, { color: theme.colors.textMuted }]}>{formatRelativeTime(post.created_at)} · {formatDate(post.created_at)}</Text>
                  </View>
                </View>
                {post.content ? <Text style={[st.postContent, { color: theme.colors.text }]}>{post.content}</Text> : null}
              </View>
            ))
          )}
        </View>
      );
    }

    /* ═══ CHAT (Discord-style) ═══ */
    if (activeTab === "chat") {
      const activeChannel = channels.find((c) => c.id === activeChannelId) || null;
      const isWeb = Platform.OS === "web";
      const chatHeight = isWeb ? (isLargeWeb ? Math.max(400, Math.min(520, height - 600)) : Math.max(350, Math.min(480, height - 500))) : Math.max(380, Math.min(540, height - 380));

      // Group consecutive messages from same user
      const groupedMessages: (TribeMessage & { showHeader: boolean })[] = chatMessages.map((msg, i) => {
        const prev = i > 0 ? chatMessages[i - 1] : null;
        const sameUser = prev && prev.user_id === msg.user_id;
        const timeDiff = prev ? (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) : Infinity;
        const showHeader = !sameUser || timeDiff > 300000; // 5 min
        return { ...msg, showHeader };
      });

      return (
        <View style={[st.chatContainer, { backgroundColor: theme.colors.surfaceElevated, height: chatHeight, marginTop: isWeb ? 8 : 12 }]}>
          {/* Channels sidebar */}
          <View style={[
            st.channelsSidebar,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            !isLargeWeb ? { width: "100%", borderRightWidth: 0, borderBottomWidth: 1, maxHeight: 50 } : null,
          ]}>
            {isLargeWeb && (
              <View style={st.channelsSidebarHeader}>
                <Text style={[st.channelsSidebarTitle, { color: theme.colors.textMuted }]}>CANAIS DE TEXTO</Text>
                {canManageChannels && (
                  <TouchableOpacity activeOpacity={0.8} onPress={() => setChannelModalVisible(true)}>
                    <Ionicons name="add" size={18} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            )}
            <ScrollView horizontal={!isLargeWeb} showsHorizontalScrollIndicator={false} contentContainerStyle={!isLargeWeb ? { paddingHorizontal: 8, gap: 4 } : { paddingHorizontal: 4 }}>
              {!isLargeWeb && canManageChannels && (
                <TouchableOpacity activeOpacity={0.8} onPress={() => setChannelModalVisible(true)} style={[st.channelPill, { backgroundColor: theme.colors.primary + "22" }]}>
                  <Ionicons name="add" size={14} color={theme.colors.primary} />
                </TouchableOpacity>
              )}
              {channels.filter(c => c.type !== "voice").map((channel) => {
                const isActive = channel.id === activeChannelId;
                return (
                  <TouchableOpacity
                    key={channel.id}
                    activeOpacity={0.85}
                    onPress={() => setActiveChannelId(channel.id)}
                    style={[
                      isLargeWeb ? st.channelRow : st.channelPill,
                      { backgroundColor: isActive ? theme.colors.primary + "22" : "transparent" },
                    ]}
                  >
                    <Text style={{ fontSize: 14, color: theme.colors.textMuted }}>#</Text>
                    <Text style={[
                      isLargeWeb ? st.channelRowText : st.channelPillText,
                      { color: isActive ? theme.colors.text : theme.colors.textMuted },
                    ]}>{channel.name}</Text>
                  </TouchableOpacity>
                );
              })}
              {/* Voice channels */}
              {isLargeWeb && channels.filter(c => c.type === "voice").length > 0 && (
                <View style={[st.channelsSidebarHeader, { marginTop: 8 }]}>
                  <Text style={[st.channelsSidebarTitle, { color: theme.colors.textMuted }]}>CANAIS DE VOZ</Text>
                </View>
              )}
              {channels.filter(c => c.type === "voice").map((channel) => (
                <TouchableOpacity
                  key={channel.id}
                  activeOpacity={0.85}
                  onPress={() => notify("Sala de Voz", `A sala "${channel.name}" será ativada em breve com áudio em tempo real.`)}
                  style={[
                    isLargeWeb ? st.channelRow : st.channelPill,
                    { backgroundColor: "transparent" },
                  ]}
                >
                  <Ionicons name="mic-outline" size={14} color={theme.colors.primary} />
                  <Text style={[isLargeWeb ? st.channelRowText : st.channelPillText, { color: theme.colors.textMuted }]}>{channel.name}</Text>
                  <View style={{ backgroundColor: theme.colors.primary + "22", borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 8, color: theme.colors.primary, fontWeight: "800" }}>EM BREVE</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Chat area */}
          <View style={st.chatArea}>
            {/* Chat header */}
            <View style={[st.chatAreaHeader, { borderColor: theme.colors.border }]}>
              {activeChannel ? (
                <View style={st.chatAreaHeaderContent}>
                  <Text style={{ fontSize: 16, color: theme.colors.textMuted }}>#</Text>
                  <Text style={[st.chatAreaHeaderTitle, { color: theme.colors.text }]}>{activeChannel.name}</Text>
                  <View style={[st.chatAreaHeaderDivider, { backgroundColor: theme.colors.border }]} />
                  <Text style={[st.chatAreaHeaderDesc, { color: theme.colors.textMuted }]} numberOfLines={1}>
                    {activeChannel.description || "Canal principal"}
                  </Text>
                </View>
              ) : (
                <Text style={[st.infoText, { color: theme.colors.textMuted }]}>Selecione um canal</Text>
              )}
            </View>

            {/* Messages - Discord style */}
            <View style={{ flex: 1, minHeight: 0 }}>
              {activeChannel ? (
                chatLoading ? (
                  <View style={st.centeredBlock}><ActivityIndicator size="small" /></View>
                ) : chatMessages.length === 0 ? (
                  <View style={[st.centeredBlock, { paddingHorizontal: 20 }]}>
                    <View style={[st.emptyChannelIcon, { backgroundColor: theme.colors.primary + "18" }]}>
                      <Text style={{ fontSize: 28 }}>#</Text>
                    </View>
                    <Text style={[st.emptyChannelTitle, { color: theme.colors.text }]}>
                      Bem-vindo ao #{activeChannel.name}!
                    </Text>
                    <Text style={[st.emptyChannelSub, { color: theme.colors.textMuted }]}>
                      Este é o começo do canal. Mande a primeira mensagem!
                    </Text>
                  </View>
                ) : (
                  <ScrollView
                    ref={chatScrollRef}
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, paddingBottom: Platform.OS === "web" ? 80 : 120 }}
                    onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}
                    showsVerticalScrollIndicator
                  >
                    {groupedMessages.map((msg) => (
                      <TouchableOpacity
                        key={msg.id}
                        activeOpacity={0.8}
                        onLongPress={() => openMessageActions(msg)}
                        onPress={Platform.OS === "web" ? () => {} : undefined}
                        delayLongPress={400}
                        style={[st.discordMsgRow, msg.showHeader ? { marginTop: 12 } : { marginTop: 2 }]}
                        {...(Platform.OS === "web" ? {
                          // @ts-ignore
                          onContextMenu: (e: any) => { e.preventDefault?.(); openMessageActions(msg); },
                        } : {})}
                      >
                        {msg.showHeader ? (
                          <>
                            {/* Avatar */}
                            <View style={st.discordAvatarCol}>
                              {msg.avatar_url ? (
                                <Image source={{ uri: msg.avatar_url }} style={st.discordAvatar} />
                              ) : (
                                <View style={[st.discordAvatarFallback, { backgroundColor: theme.colors.primary + "33" }]}>
                                  <Text style={[st.discordAvatarText, { color: theme.colors.primary }]}>{getAvatarInitial(getDisplayName(msg))}</Text>
                                </View>
                              )}
                            </View>
                            <View style={{ flex: 1 }}>
                              <View style={st.discordNameRow}>
                                <Text style={[st.discordUsername, { color: theme.colors.primary }]}>{getDisplayName(msg)}</Text>
                                <Text style={[st.discordTimestamp, { color: theme.colors.textMuted }]}>{formatDate(msg.created_at)} {formatTime(msg.created_at)}</Text>
                              </View>
                              <Text style={[
                                st.discordContent,
                                msg.is_deleted ? { fontStyle: "italic", opacity: 0.5 } : null,
                                { color: theme.colors.text },
                              ]}>
                                {msg.is_deleted ? (msg.deleted_by_role === "owner" ? "Mensagem excluída pelo dono" : "Mensagem excluída por moderador") : msg.content}
                              </Text>
                              {msg.reactions && msg.reactions.length > 0 && (
                                <View style={st.reactionsRow}>
                                  {msg.reactions.slice(0, 8).map((r) => (
                                    <View key={`${msg.id}-${r.emoji}`} style={[st.reactionPill, { backgroundColor: theme.colors.primary + "18", borderColor: theme.colors.primary + "30" }]}>
                                      <Text style={st.reactionText}>{r.emoji} {r.count}</Text>
                                    </View>
                                  ))}
                                </View>
                              )}
                            </View>
                          </>
                        ) : (
                          <>
                            <View style={st.discordAvatarCol}>
                              <Text style={[st.discordCompactTime, { color: theme.colors.textMuted }]}>{formatTime(msg.created_at)}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[
                                st.discordContent,
                                msg.is_deleted ? { fontStyle: "italic", opacity: 0.5 } : null,
                                { color: theme.colors.text },
                              ]}>
                                {msg.is_deleted ? "Mensagem excluída" : msg.content}
                              </Text>
                              {msg.reactions && msg.reactions.length > 0 && (
                                <View style={st.reactionsRow}>
                                  {msg.reactions.slice(0, 8).map((r) => (
                                    <View key={`${msg.id}-${r.emoji}`} style={[st.reactionPill, { backgroundColor: theme.colors.primary + "18", borderColor: theme.colors.primary + "30" }]}>
                                      <Text style={st.reactionText}>{r.emoji} {r.count}</Text>
                                    </View>
                                  ))}
                                </View>
                              )}
                            </View>
                          </>
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )
              ) : null}
            </View>

            {/* Input */}
            <View style={[st.chatInputBar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              {isMember ? (
                <>
                  {replyingTo && (
                    <View style={[st.replyBanner, { backgroundColor: theme.colors.primary + "12", borderColor: theme.colors.primary + "30" }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[st.replyLabel, { color: theme.colors.primary }]}>Respondendo a {getDisplayName(replyingTo)}</Text>
                        <Text style={[st.replyPreview, { color: theme.colors.textMuted }]} numberOfLines={1}>{replyingTo.content}</Text>
                      </View>
                      <TouchableOpacity onPress={cancelReply}><Ionicons name="close" size={16} color={theme.colors.textMuted} /></TouchableOpacity>
                    </View>
                  )}
                  <View style={st.chatInputRow}>
                    <TextInput
                      value={newChatMessage}
                      onChangeText={setNewChatMessage}
                      placeholder={activeChannel ? `Conversar em #${activeChannel.name}` : "Selecione um canal"}
                      placeholderTextColor={theme.colors.textMuted}
                      multiline
                      style={[st.chatInput, { color: theme.colors.text, backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}
                      onSubmitEditing={handleSendChatMessage}
                    />
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={handleSendChatMessage}
                      disabled={sendingChat || !newChatMessage.trim().length}
                      style={[st.chatSendBtn, { backgroundColor: sendingChat || !newChatMessage.trim().length ? theme.colors.border : theme.colors.primary }]}
                    >
                      {sendingChat ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={16} color="#fff" />}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <Text style={[st.infoText, { color: theme.colors.textMuted, textAlign: "center", paddingVertical: 8 }]}>Entre na tribo para participar do chat.</Text>
              )}
            </View>
          </View>
        </View>
      );
    }

    /* ═══ RANKING ═══ */
    if (activeTab === "ranking") {
      // Calculate ranking from members + post/message counts
      const rankedMembers = [...members].sort((a, b) => {
        const aScore = (a.role === "owner" ? 100 : a.role === "moderator" ? 50 : 0);
        const bScore = (b.role === "owner" ? 100 : b.role === "moderator" ? 50 : 0);
        return bScore - aScore;
      });

      const getRankIcon = (pos: number) => {
        if (pos === 0) return "🥇";
        if (pos === 1) return "🥈";
        if (pos === 2) return "🥉";
        return `#${pos + 1}`;
      };

      const getRoleBadgeColor = (role: string) => {
        if (role === "owner") return "#FFD700";
        if (role === "moderator") return "#7C3AED";
        return theme.colors.textMuted;
      };

      return (
        <View style={{ marginTop: 12, gap: 10 }}>
          <View style={[st.feedCard, { backgroundColor: theme.colors.surfaceElevated }]}>
            <View style={st.rankingHeader}>
              <Ionicons name="trophy" size={20} color="#FFD700" />
              <Text style={[st.rankingTitle, { color: theme.colors.text }]}>Ranking da Tribo</Text>
            </View>
            <Text style={[st.infoText, { color: theme.colors.textMuted }]}>
              Membros mais ativos e engajados da comunidade.
            </Text>
          </View>

          {membersLoading || members.length === 0 ? (
            <View style={[st.feedCard, { backgroundColor: theme.colors.surfaceElevated, alignItems: "center", paddingVertical: 24 }]}>
              {membersLoading ? <ActivityIndicator /> : (
                <>
                  <Ionicons name="people-outline" size={28} color={theme.colors.textMuted} />
                  <Text style={[st.infoText, { color: theme.colors.textMuted, marginTop: 8 }]}>Ranking disponível quando a tribo tiver membros.</Text>
                </>
              )}
            </View>
          ) : (
            rankedMembers.slice(0, 20).map((m, i) => {
              const display = m.full_name?.trim() || m.username?.trim() || "Usuário";
              const isYou = userId && m.user_id === userId;
              return (
                <View key={`${m.tribe_id}_${m.user_id}`} style={[st.rankRow, { backgroundColor: theme.colors.surfaceElevated, borderLeftColor: i < 3 ? getRoleBadgeColor(m.role) : "transparent" }]}>
                  <View style={st.rankPos}>
                    <Text style={[st.rankPosText, { color: i < 3 ? "#FFD700" : theme.colors.textMuted }]}>{getRankIcon(i)}</Text>
                  </View>
                  {m.avatar_url ? (
                    <Image source={{ uri: m.avatar_url }} style={st.rankAvatar} />
                  ) : (
                    <View style={[st.rankAvatarFallback, { backgroundColor: theme.colors.primary + "22" }]}>
                      <Text style={[st.rankAvatarText, { color: theme.colors.primary }]}>{display.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[st.rankName, { color: theme.colors.text }]}>{display}{isYou ? " (você)" : ""}</Text>
                    <Text style={[st.rankSub, { color: theme.colors.textMuted }]}>{m.username ? `@${m.username}` : roleLabel(m.role)}</Text>
                  </View>
                  <View style={[st.rankRolePill, { backgroundColor: getRoleBadgeColor(m.role) + "22" }]}>
                    <Text style={[st.rankRoleText, { color: getRoleBadgeColor(m.role) }]}>{roleLabel(m.role)}</Text>
                  </View>
                </View>
              );
            })
          )}

          <View style={[st.feedCard, { backgroundColor: theme.colors.surfaceElevated, alignItems: "center" }]}>
            <View style={st.comingSoonRow}>
              <Ionicons name="sparkles" size={16} color={theme.colors.primary} />
              <Text style={[st.comingSoonText, { color: theme.colors.primary }]}>Em breve: XP, badges e níveis</Text>
            </View>
            <Text style={[st.infoText, { color: theme.colors.textMuted, textAlign: "center" }]}>
              Sistema de XP baseado em mensagens, posts e engajamento com badges exclusivas no perfil LUPYY.
            </Text>
          </View>
        </View>
      );
    }

    /* ═══ MEMBERS ═══ */
    if (activeTab === "members") {
      const canView = tribe.is_public || isMember;
      if (!canView) {
        return (
          <View style={[st.feedCard, { backgroundColor: theme.colors.surfaceElevated, marginTop: 12 }]}>
            <Text style={[st.infoTitle, { color: theme.colors.text }]}>Membros</Text>
            <Text style={[st.infoText, { color: theme.colors.textMuted }]}>Entre na tribo para ver quem está aqui.</Text>
          </View>
        );
      }

      const owners = members.filter(m => m.role === "owner");
      const mods = members.filter(m => m.role === "moderator");
      const regularMembers = members.filter(m => m.role === "member");

      const renderMemberSection = (title: string, list: TribeMemberDetailed[], icon: string) => {
        if (list.length === 0) return null;
        return (
          <View style={{ marginTop: 12 }}>
            <View style={st.memberSectionHeader}>
              <Text style={[st.memberSectionTitle, { color: theme.colors.textMuted }]}>{title} — {list.length}</Text>
            </View>
            {list.map((m) => {
              const display = m.full_name?.trim() || m.username?.trim() || "Usuário";
              const isYou = userId && m.user_id === userId;
              const canClick = isMember && (myRole === "owner" || myRole === "moderator") && !isYou;
              return (
                <TouchableOpacity
                  key={`${m.tribe_id}_${m.user_id}`}
                  activeOpacity={0.85}
                  onPress={() => (canClick ? openMemberModal(m) : undefined)}
                  style={[st.memberRow, { backgroundColor: theme.colors.surfaceElevated }]}
                >
                  {m.avatar_url ? (
                    <Image source={{ uri: m.avatar_url }} style={st.memberAvatar} />
                  ) : (
                    <View style={[st.memberAvatarFallback, { backgroundColor: theme.colors.primary + "22" }]}>
                      <Text style={[st.memberAvatarText, { color: theme.colors.primary }]}>{display.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[st.memberName, { color: theme.colors.text }]}>{display}{isYou ? " (você)" : ""}</Text>
                    {m.username && <Text style={[st.memberUsername, { color: theme.colors.textMuted }]}>@{m.username}</Text>}
                  </View>
                  <View style={[st.memberRolePill, { backgroundColor: m.role === "owner" ? "#FFD700" + "22" : m.role === "moderator" ? theme.colors.primary + "22" : theme.colors.surface }]}>
                    <Text style={[st.memberRoleText, { color: m.role === "owner" ? "#FFD700" : m.role === "moderator" ? theme.colors.primary : theme.colors.textMuted }]}>{roleLabel(m.role)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        );
      };

      return (
        <View style={{ marginTop: 8 }}>
          <View style={[st.feedCard, { backgroundColor: theme.colors.surfaceElevated }]}>
            <View style={st.membersTotalRow}>
              <Ionicons name="people" size={18} color={theme.colors.primary} />
              <Text style={[st.membersTotalText, { color: theme.colors.text }]}>{members.length} membro{members.length !== 1 ? "s" : ""}</Text>
              {membersLoading && <ActivityIndicator size="small" />}
            </View>
          </View>
          {/* Pending join requests (admin only) */}
          {canManageMembers && pendingRequests.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <View style={st.memberSectionHeader}>
                <Text style={[st.memberSectionTitle, { color: "#F59E0B" }]}>SOLICITAÇÕES PENDENTES — {pendingRequests.length}</Text>
              </View>
              {pendingRequests.map((req) => {
                const display = req.full_name?.trim() || req.username?.trim() || "Usuário";
                return (
                  <View key={req.id} style={[st.memberRow, { backgroundColor: theme.colors.surfaceElevated }]}>
                    {req.avatar_url ? (
                      <Image source={{ uri: req.avatar_url }} style={st.memberAvatar} />
                    ) : (
                      <View style={[st.memberAvatarFallback, { backgroundColor: "#F59E0B" + "22" }]}>
                        <Text style={[st.memberAvatarText, { color: "#F59E0B" }]}>{display.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[st.memberName, { color: theme.colors.text }]}>{display}</Text>
                      <Text style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 1 }}>Solicitou {formatRelativeTime(req.created_at)}</Text>
                    </View>
                    <TouchableOpacity activeOpacity={0.85} onPress={() => handleApproveRequest(req.id)} style={{ backgroundColor: theme.colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>Aceitar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity activeOpacity={0.85} onPress={() => handleRejectRequest(req.id)} style={{ backgroundColor: "#EF4444" + "18", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
                      <Ionicons name="close" size={14} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {renderMemberSection("DONO", owners, "crown")}
          {renderMemberSection("MODERADORES", mods, "shield")}
          {renderMemberSection("MEMBROS", regularMembers, "person")}
        </View>
      );
    }

    /* ═══ ABOUT ═══ */
    if (activeTab === "about") {
      return (
        <View style={[st.feedCard, { backgroundColor: theme.colors.surfaceElevated, marginTop: 12 }]}>
          <View style={st.aboutHeader}>
            <Ionicons name="information-circle" size={20} color={theme.colors.primary} />
            <Text style={[st.aboutTitle, { color: theme.colors.text }]}>Sobre a tribo</Text>
          </View>
          {tribe.description ? (
            <Text style={[st.aboutDesc, { color: theme.colors.text }]}>{tribe.description}</Text>
          ) : (
            <Text style={[st.infoText, { color: theme.colors.textMuted }]}>Sem descrição ainda.</Text>
          )}
          <View style={st.aboutChips}>
            {tribe.category && (
              <View style={[st.aboutChip, { backgroundColor: theme.colors.primary + "18" }]}>
                <Text style={[st.aboutChipText, { color: theme.colors.primary }]}>{tribe.category}</Text>
              </View>
            )}
            <View style={[st.aboutChip, { backgroundColor: theme.colors.surface }]}>
              <Ionicons name={tribe.is_public ? "globe-outline" : "lock-closed-outline"} size={12} color={theme.colors.textMuted} />
              <Text style={[st.aboutChipText, { color: theme.colors.textMuted }]}>{tribe.is_public ? "Pública" : "Privada"}</Text>
            </View>
            <View style={[st.aboutChip, { backgroundColor: theme.colors.surface }]}>
              <Ionicons name="calendar-outline" size={12} color={theme.colors.textMuted} />
              <Text style={[st.aboutChipText, { color: theme.colors.textMuted }]}>Criada em {formatDate(tribe.created_at)}</Text>
            </View>
            <View style={[st.aboutChip, { backgroundColor: theme.colors.surface }]}>
              <Ionicons name="people-outline" size={12} color={theme.colors.textMuted} />
              <Text style={[st.aboutChipText, { color: theme.colors.textMuted }]}>{tribe.members_count} membro{tribe.members_count !== 1 ? "s" : ""}</Text>
            </View>
          </View>
        </View>
      );
    }

    return null;
  };

  /* ─── Loading / Not found ─── */
  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, paddingTop: insets.top, backgroundColor: theme.colors.background }}>
        <View style={st.centeredFlex}><ActivityIndicator /><Text style={[st.loadingText, { color: theme.colors.textMuted }]}>Carregando tribo...</Text></View>
      </SafeAreaView>
    );
  }

  if (!tribe) {
    return (
      <SafeAreaView style={{ flex: 1, paddingTop: insets.top, backgroundColor: theme.colors.background }}>
        <View style={st.centeredFlex}>
          <Text style={[st.loadingText, { color: theme.colors.textMuted }]}>Tribo não encontrada.</Text>
          <TouchableOpacity activeOpacity={0.9} onPress={goBackToTribes} style={[st.backBtn, { backgroundColor: theme.colors.primary }]}>
            <Text style={st.backBtnText}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  /* ─── Main UI ─── */
  const coverUri = getCoverUri(tribe.cover_url);

  return (
    <SafeAreaView style={{ flex: 1, paddingTop: insets.top, backgroundColor: theme.colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={Platform.OS === "web" ? { flex: 1, touchAction: "pan-y" } as any : { flex: 1 }}
          contentContainerStyle={{ paddingBottom: 32 + insets.bottom }}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={activeTab !== "chat" || !isLargeWeb}
        >
          {/* Cover */}
          <View style={st.coverContainer}>
            <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFill} onLongPress={canManageCover ? () => setCoverActionsVisible(true) : undefined} delayLongPress={350}>
              {coverUri ? <Image source={{ uri: coverUri }} style={st.coverImage} resizeMode="cover" /> : <View style={[st.coverPlaceholder, { backgroundColor: theme.colors.primary + "22" }]} />}
            </TouchableOpacity>
            <View style={st.coverTopBar} pointerEvents="box-none">
              <TouchableOpacity activeOpacity={0.8} onPress={goBackToTribes} style={st.coverBackButton}>
                <Ionicons name="chevron-back" size={20} color="#fff" />
              </TouchableOpacity>
              <View style={st.coverTag}><Text style={st.coverTagText}>TRIBO</Text></View>
            </View>
            <View pointerEvents="none" style={st.coverGradient} />
            <View style={st.coverBottomInfo}>
              <Text style={st.coverTitle} numberOfLines={2}>{tribe.name}</Text>
              <View style={st.coverMetaRow}>
                <View style={st.coverMetaBadge}><Ionicons name="people" size={12} color="#E5E7EB" /><Text style={st.coverMetaText}>{tribe.members_count} membro{tribe.members_count !== 1 ? "s" : ""}</Text></View>
                {tribe.category && <View style={st.coverMetaBadge}><Text style={st.coverMetaText}>{tribe.category}</Text></View>}
              </View>
              {canManageCover && (
                <Text style={st.coverEditHint}>{uploadingCover ? "Enviando..." : "Segure na capa para trocar"}</Text>
              )}
            </View>
          </View>

          {/* Content */}
          <View style={{ paddingHorizontal: isLargeWeb ? 32 : 16, paddingTop: 12 }}>
            {/* Description + Join */}
            <View style={st.descriptionRow}>
              <View style={{ flex: 1 }}>
                <Text style={[st.descriptionText, { color: theme.colors.textMuted }]} numberOfLines={3}>
                  {tribe.description || "Entre e faça parte dessa comunidade."}
                </Text>
                {!tribe.is_public && !isMember && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                    <Ionicons name="lock-closed-outline" size={12} color={theme.colors.primary} />
                    <Text style={{ fontSize: 11, fontWeight: "600", color: theme.colors.primary }}>Tribo privada · entrada por solicitação</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleToggleMembership}
                disabled={joining || membershipLoading || (myJoinRequest?.status === "rejected" && !isMember)}
                style={[st.joinBtn, {
                  backgroundColor: isMember
                    ? theme.colors.surface
                    : myJoinRequest?.status === "pending"
                      ? "#F59E0B"
                      : myJoinRequest?.status === "rejected"
                        ? theme.colors.surface
                        : theme.colors.primary,
                }]}
              >
                {joining || membershipLoading ? <ActivityIndicator size="small" color={isMember ? theme.colors.text : "#fff"} /> : (
                  <View style={st.joinBtnContent}>
                    <Ionicons
                      name={isMember ? "exit-outline" : myJoinRequest?.status === "pending" ? "time-outline" : myJoinRequest?.status === "rejected" ? "close-circle-outline" : !tribe.is_public ? "hand-left-outline" : "enter-outline"}
                      size={16}
                      color={isMember ? theme.colors.text : myJoinRequest?.status === "rejected" ? theme.colors.textMuted : "#fff"}
                    />
                    <Text style={[st.joinBtnText, { color: isMember ? theme.colors.text : myJoinRequest?.status === "rejected" ? theme.colors.textMuted : "#FFFFFF" }]}>
                      {isMember ? "Sair" : myJoinRequest?.status === "pending" ? "Cancelar" : myJoinRequest?.status === "rejected" ? "Rejeitado" : !tribe.is_public ? "Solicitar" : "Entrar"}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Pending requests badge for admins */}
            {canManageMembers && pendingRequestsCount > 0 && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setActiveTab("members")}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, backgroundColor: "#F59E0B" + "18", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}
              >
                <Ionicons name="notifications" size={16} color="#F59E0B" />
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#F59E0B", flex: 1 }}>
                  {pendingRequestsCount} solicitação{pendingRequestsCount !== 1 ? "ões" : ""} pendente{pendingRequestsCount !== 1 ? "s" : ""}
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#F59E0B" />
              </TouchableOpacity>
            )}

            {/* Tabs */}
            <View style={[st.tabsContainer, { backgroundColor: theme.colors.surfaceElevated, marginTop: 12 }]}>
              {tabs.map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  activeOpacity={0.85}
                  onPress={() => setActiveTab(tab.key)}
                  style={[st.tabItem, { backgroundColor: activeTab === tab.key ? theme.colors.primary : "transparent" }]}
                >
                  <Ionicons name={TAB_ICONS[tab.key] as any} size={14} color={activeTab === tab.key ? "#fff" : theme.colors.textMuted} />
                  <Text style={[st.tabItemText, { color: activeTab === tab.key ? "#FFFFFF" : theme.colors.textMuted }]}>{tab.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {renderTabContent()}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ─── Modals ─── */}

      {/* Message actions */}
      <Modal transparent visible={messageActionsVisible && !!selectedMessage} animationType="fade" onRequestClose={closeMessageActions}>
        <TouchableOpacity activeOpacity={1} onPress={closeMessageActions} style={st.modalOverlay}>
          <View style={[st.modalCard, { backgroundColor: theme.colors.surfaceElevated }]} onStartShouldSetResponder={() => true}>
            <View style={st.modalHeader}>
              <Text style={[st.modalTitle, { color: theme.colors.text }]}>Ações da mensagem</Text>
              <TouchableOpacity onPress={closeMessageActions}><Ionicons name="close" size={20} color={theme.colors.textMuted} /></TouchableOpacity>
            </View>
            {selectedMessage && !selectedMessage.is_deleted && (
              <View style={[st.modalMsgPreview, { backgroundColor: theme.colors.surface }]}>
                <Text style={[st.modalMsgText, { color: theme.colors.text }]} numberOfLines={3}>{selectedMessage.content}</Text>
              </View>
            )}
            <View style={{ gap: 6, marginTop: 12 }}>
              <TouchableOpacity activeOpacity={0.85} style={[st.modalAction, { backgroundColor: theme.colors.surface }]} onPress={startReply}>
                <Ionicons name="arrow-undo" size={16} color={theme.colors.text} /><Text style={[st.modalActionText, { color: theme.colors.text }]}>Responder</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.85} style={[st.modalAction, { backgroundColor: theme.colors.surface }]} onPress={() => setEmojiPickerVisible(!emojiPickerVisible)}>
                <Ionicons name="happy-outline" size={16} color={theme.colors.text} /><Text style={[st.modalActionText, { color: theme.colors.text }]}>Reagir</Text>
              </TouchableOpacity>
              {canManageMessages && (
                <TouchableOpacity activeOpacity={0.85} style={[st.modalAction, { backgroundColor: "#EF4444" + "18" }]} onPress={deleteMessage}>
                  <Ionicons name="trash-outline" size={16} color="#EF4444" /><Text style={[st.modalActionText, { color: "#EF4444" }]}>Apagar</Text>
                </TouchableOpacity>
              )}
            </View>
            {emojiPickerVisible && (
              <View style={st.emojiGrid}>
                {EMOJI_LIST.map((e) => (
                  <TouchableOpacity key={e} activeOpacity={0.85} style={[st.emojiBtn, { backgroundColor: theme.colors.surface }]} onPress={() => addReaction(e)}>
                    <Text style={{ fontSize: 24 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Create channel */}
      <Modal transparent visible={channelModalVisible} animationType="fade" onRequestClose={() => setChannelModalVisible(false)}>
        <View style={st.modalOverlay}>
          <TouchableOpacity activeOpacity={1} onPress={() => setChannelModalVisible(false)} style={StyleSheet.absoluteFill} />
          <View style={[st.modalCard, { backgroundColor: theme.colors.surfaceElevated }]}>
            <View style={st.modalHeader}>
              <Text style={[st.modalTitle, { color: theme.colors.text }]}>Criar canal</Text>
              <TouchableOpacity onPress={() => setChannelModalVisible(false)}><Ionicons name="close" size={20} color={theme.colors.textMuted} /></TouchableOpacity>
            </View>
            <Text style={[st.modalSub, { color: theme.colors.textMuted }]}>Apenas dono e moderadores podem criar canais.</Text>

            {/* Channel type selector */}
            <View style={st.channelTypeRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setNewChannelType("text")}
                style={[st.channelTypeOption, { backgroundColor: newChannelType === "text" ? theme.colors.primary : theme.colors.surface }]}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={newChannelType === "text" ? "#fff" : theme.colors.textMuted} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: newChannelType === "text" ? "#fff" : theme.colors.textMuted }}>Texto</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setNewChannelType("voice")}
                style={[st.channelTypeOption, { backgroundColor: newChannelType === "voice" ? theme.colors.primary : theme.colors.surface }]}
              >
                <Ionicons name="mic-outline" size={18} color={newChannelType === "voice" ? "#fff" : theme.colors.textMuted} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: newChannelType === "voice" ? "#fff" : theme.colors.textMuted }}>Voz</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              value={newChannelName}
              onChangeText={setNewChannelName}
              placeholder={newChannelType === "voice" ? "Nome da sala (ex: Reuniões)" : "Nome do canal (ex: Projetos)"}
              placeholderTextColor={theme.colors.textMuted}
              style={[st.modalInput, { backgroundColor: theme.colors.surface, color: theme.colors.text, borderColor: theme.colors.border }]}
            />

            {newChannelType === "voice" && (
              <View style={[st.voiceInfoBox, { backgroundColor: theme.colors.primary + "12", borderColor: theme.colors.primary + "30" }]}>
                <Ionicons name="information-circle-outline" size={16} color={theme.colors.primary} />
                <Text style={{ fontSize: 12, color: theme.colors.primary, flex: 1, lineHeight: 17 }}>
                  Salas de voz permitem que membros entrem e conversem em tempo real.
                </Text>
              </View>
            )}

            <View style={{ gap: 8, marginTop: 14 }}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={createChannel}
                disabled={!newChannelName.trim().length}
                style={[st.modalPrimaryBtn, { backgroundColor: !newChannelName.trim().length ? theme.colors.surface : theme.colors.primary }]}
              >
                <Ionicons name={newChannelType === "voice" ? "mic" : "add-circle"} size={16} color="#fff" />
                <Text style={st.modalPrimaryBtnText}>Criar {newChannelType === "voice" ? "sala de voz" : "canal"}</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.85} onPress={() => setChannelModalVisible(false)} style={[st.modalSecondaryBtn, { backgroundColor: theme.colors.surface }]}>
                <Text style={[st.modalSecondaryBtnText, { color: theme.colors.textMuted }]}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Member actions */}
      <Modal transparent visible={memberModalVisible && !!selectedMember} animationType="fade" onRequestClose={closeMemberModal}>
        <TouchableOpacity activeOpacity={1} onPress={closeMemberModal} style={st.modalOverlay}>
          <View style={[st.modalCard, { backgroundColor: theme.colors.surfaceElevated }]} onStartShouldSetResponder={() => true}>
            <View style={st.modalHeader}>
              <Text style={[st.modalTitle, { color: theme.colors.text }]}>Gerenciar membro</Text>
              <TouchableOpacity onPress={closeMemberModal}><Ionicons name="close" size={20} color={theme.colors.textMuted} /></TouchableOpacity>
            </View>
            {selectedMember && (
              <>
                <Text style={[st.modalSub, { color: theme.colors.text }]}>{selectedMember.full_name?.trim() || selectedMember.username?.trim() || "Usuário"}</Text>
                <View style={{ gap: 8, marginTop: 12 }}>
                  {myRole === "owner" && (
                    <>
                      <TouchableOpacity activeOpacity={0.85} disabled={selectedMember.role === "moderator"} onPress={() => handleSetMemberRole("moderator")}
                        style={[st.modalAction, { backgroundColor: selectedMember.role === "moderator" ? theme.colors.surface : theme.colors.primary }]}>
                        <Ionicons name="shield-checkmark" size={16} color={selectedMember.role === "moderator" ? theme.colors.textMuted : "#fff"} />
                        <Text style={[st.modalActionText, { color: selectedMember.role === "moderator" ? theme.colors.textMuted : "#fff" }]}>Promover a moderador</Text>
                      </TouchableOpacity>
                      <TouchableOpacity activeOpacity={0.85} disabled={selectedMember.role === "member"} onPress={() => handleSetMemberRole("member")}
                        style={[st.modalAction, { backgroundColor: selectedMember.role === "member" ? theme.colors.surface : theme.colors.primary }]}>
                        <Ionicons name="person" size={16} color={selectedMember.role === "member" ? theme.colors.textMuted : "#fff"} />
                        <Text style={[st.modalActionText, { color: selectedMember.role === "member" ? theme.colors.textMuted : "#fff" }]}>Rebaixar para membro</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  <TouchableOpacity activeOpacity={0.85} onPress={handleRemoveMember} style={[st.modalAction, { backgroundColor: "#EF4444" + "18" }]}>
                    <Ionicons name="person-remove" size={16} color="#EF4444" />
                    <Text style={[st.modalActionText, { color: "#EF4444" }]}>Remover membro</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Cover actions */}
      <Modal transparent visible={coverActionsVisible && canManageCover} animationType="fade" onRequestClose={() => setCoverActionsVisible(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setCoverActionsVisible(false)} style={st.modalOverlay}>
          <View style={[st.modalCard, { backgroundColor: theme.colors.surfaceElevated }]} onStartShouldSetResponder={() => true}>
            <Text style={[st.modalTitle, { color: theme.colors.text }]}>Capa da tribo</Text>
            <Text style={[st.modalSub, { color: theme.colors.textMuted, marginTop: 6 }]}>Escolha uma nova imagem de capa.</Text>
            <View style={{ gap: 8, marginTop: 14 }}>
              <TouchableOpacity activeOpacity={0.85} disabled={uploadingCover} onPress={() => { setCoverActionsVisible(false); pickAndUploadCover(); }}
                style={[st.modalPrimaryBtn, { backgroundColor: theme.colors.primary }]}>
                {uploadingCover ? <ActivityIndicator size="small" color="#fff" /> : (
                  <><Ionicons name="image" size={16} color="#fff" /><Text style={st.modalPrimaryBtnText}>Trocar capa</Text></>
                )}
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.85} onPress={() => setCoverActionsVisible(false)} style={[st.modalSecondaryBtn, { backgroundColor: theme.colors.surface }]}>
                <Text style={[st.modalSecondaryBtnText, { color: theme.colors.textMuted }]}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

/* ─── Styles ─── */
const st = StyleSheet.create({
  // General
  centeredFlex: { flex: 1, alignItems: "center", justifyContent: "center" },
  centeredBlock: { alignItems: "center", justifyContent: "center", paddingVertical: 20 },
  loadingText: { marginTop: 10, fontSize: 14 },
  loadingSmall: { marginTop: 6, fontSize: 12 },
  infoTitle: { fontSize: 14, fontWeight: "700" },
  infoText: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  backBtn: { marginTop: 12, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 },
  backBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // Cover
  coverContainer: { position: "relative", height: 220, width: "100%" },
  coverImage: { height: "100%", width: "100%" },
  coverPlaceholder: { height: "100%", width: "100%", alignItems: "center", justifyContent: "center" },
  coverTopBar: { position: "absolute", left: 16, right: 16, top: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 50 },
  coverBackButton: { height: 38, width: 38, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  coverTag: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: "rgba(0,0,0,0.5)" },
  coverTagText: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: "#F9FAFB" },
  coverGradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: 120, backgroundColor: "transparent", zIndex: 10 },
  coverBottomInfo: { position: "absolute", left: 16, right: 16, bottom: 16, zIndex: 40 },
  coverTitle: { fontSize: 26, fontWeight: "800", color: "#FFFFFF", textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  coverMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  coverMetaBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  coverMetaText: { fontSize: 12, fontWeight: "600", color: "#E5E7EB" },
  coverEditHint: { fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.6)", marginTop: 6 },

  // Description + Join
  descriptionRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  descriptionText: { flex: 1, fontSize: 14, lineHeight: 20 },
  joinBtn: { borderRadius: 999, paddingVertical: 10, paddingHorizontal: 18 },
  joinBtnContent: { flexDirection: "row", alignItems: "center", gap: 6 },
  joinBtnText: { fontSize: 14, fontWeight: "700" },

  // Tabs
  tabsContainer: { flexDirection: "row", borderRadius: 14, padding: 3, gap: 2 },
  tabItem: { flex: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingVertical: 8, flexDirection: "row", gap: 4 },
  tabItemText: { fontSize: 11, fontWeight: "700" },

  // Feed
  feedCard: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14 },
  feedNewHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  feedNewLabel: { fontSize: 14, fontWeight: "700" },
  feedInputWrap: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  feedInput: { maxHeight: 100, fontSize: 14, lineHeight: 20 },
  postBtn: { marginTop: 10, borderRadius: 12, paddingVertical: 10, alignItems: "center" },
  postBtnContent: { flexDirection: "row", alignItems: "center", gap: 6 },
  postBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  postAvatar: { width: 36, height: 36, borderRadius: 999 },
  postAvatarFallback: { width: 36, height: 36, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  postAvatarText: { fontSize: 15, fontWeight: "800" },
  postAuthor: { fontSize: 14, fontWeight: "700" },
  postTime: { fontSize: 11, marginTop: 1 },
  postContent: { fontSize: 14, lineHeight: 21 },

  // Chat - Discord style
  chatContainer: { borderRadius: 16, overflow: "hidden", flexDirection: "row" },
  channelsSidebar: { width: 180, borderRightWidth: 1 },
  channelsSidebarHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  channelsSidebarTitle: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  channelRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 7, marginHorizontal: 4, marginTop: 2, borderRadius: 8 },
  channelRowText: { fontSize: 13, fontWeight: "600" },
  channelPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  channelPillText: { fontSize: 12, fontWeight: "600" },
  chatArea: { flex: 1, position: "relative" },
  chatAreaHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  chatAreaHeaderContent: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  chatAreaHeaderTitle: { fontSize: 15, fontWeight: "700" },
  chatAreaHeaderDivider: { width: 1, height: 16 },
  chatAreaHeaderDesc: { fontSize: 12, flex: 1 },

  // Discord messages
  discordMsgRow: { flexDirection: "row", paddingHorizontal: 4, paddingVertical: 2 },
  discordAvatarCol: { width: 42, alignItems: "center", paddingTop: 2 },
  discordAvatar: { width: 34, height: 34, borderRadius: 999 },
  discordAvatarFallback: { width: 34, height: 34, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  discordAvatarText: { fontSize: 14, fontWeight: "800" },
  discordCompactTime: { fontSize: 9, marginTop: 4 },
  discordNameRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 2 },
  discordUsername: { fontSize: 14, fontWeight: "700" },
  discordTimestamp: { fontSize: 11 },
  discordContent: { fontSize: 14, lineHeight: 20 },
  reactionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  reactionPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  reactionText: { fontSize: 12, fontWeight: "700" },

  emptyChannelIcon: { width: 60, height: 60, borderRadius: 999, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  emptyChannelTitle: { fontSize: 16, fontWeight: "800", textAlign: "center" },
  emptyChannelSub: { fontSize: 13, textAlign: "center", marginTop: 4 },

  // Chat input
  chatInputBar: { paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: 1, position: "absolute", left: 0, right: 0, bottom: 0 },
  replyBanner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginBottom: 6, borderWidth: 1 },
  replyLabel: { fontSize: 12, fontWeight: "700" },
  replyPreview: { fontSize: 12, marginTop: 1 },
  chatInputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  chatInput: { flex: 1, minHeight: 38, maxHeight: 100, fontSize: 14, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  chatSendBtn: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },

  // Ranking
  rankingHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  rankingTitle: { fontSize: 18, fontWeight: "800" },
  rankRow: { flexDirection: "row", alignItems: "center", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, gap: 10, borderLeftWidth: 3 },
  rankPos: { width: 28, alignItems: "center" },
  rankPosText: { fontSize: 16, fontWeight: "800" },
  rankAvatar: { width: 36, height: 36, borderRadius: 999 },
  rankAvatarFallback: { width: 36, height: 36, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  rankAvatarText: { fontSize: 14, fontWeight: "800" },
  rankName: { fontSize: 14, fontWeight: "700" },
  rankSub: { fontSize: 11, marginTop: 1 },
  rankRolePill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  rankRoleText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  comingSoonRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  comingSoonText: { fontSize: 13, fontWeight: "700" },

  // Members
  memberSectionHeader: { paddingHorizontal: 4, paddingVertical: 6 },
  memberSectionTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  memberRow: { flexDirection: "row", alignItems: "center", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, gap: 10, marginBottom: 4 },
  memberAvatar: { width: 38, height: 38, borderRadius: 999 },
  memberAvatarFallback: { width: 38, height: 38, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  memberAvatarText: { fontSize: 15, fontWeight: "800" },
  memberName: { fontSize: 14, fontWeight: "700" },
  memberUsername: { fontSize: 12, marginTop: 1 },
  memberRolePill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  memberRoleText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  membersTotalRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  membersTotalText: { fontSize: 15, fontWeight: "700" },

  // About
  aboutHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  aboutTitle: { fontSize: 18, fontWeight: "800" },
  aboutDesc: { fontSize: 14, lineHeight: 22 },
  aboutChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  aboutChip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  aboutChipText: { fontSize: 12, fontWeight: "600" },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 16 },
  modalCard: { width: "100%", maxWidth: 440, borderRadius: 20, padding: 20 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  modalTitle: { fontSize: 17, fontWeight: "800" },
  modalSub: { fontSize: 13, marginTop: 2 },
  modalInput: { marginTop: 10, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1 },
  modalAction: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  modalActionText: { fontSize: 14, fontWeight: "600" },
  modalPrimaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 14, paddingVertical: 12 },
  modalPrimaryBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  modalSecondaryBtn: { borderRadius: 14, paddingVertical: 12, alignItems: "center" },
  modalSecondaryBtnText: { fontSize: 14, fontWeight: "600" },
  modalMsgPreview: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8 },
  modalMsgText: { fontSize: 13, lineHeight: 18 },
  emojiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14, justifyContent: "center" },
  emojiBtn: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },

  // Channel type selector
  channelTypeRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  channelTypeOption: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 10 },
  voiceInfoBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginTop: 10 },
});
