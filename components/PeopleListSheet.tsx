// components/PeopleListSheet.tsx — Premium followers/following modal (Instagram-style)
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";
import { Image as ExpoImage } from "expo-image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Mode = "followers" | "following" | "interested";

type PeopleListSheetProps = {
  visible: boolean;
  mode: Mode;
  profileId: string;
  isOwnProfile: boolean;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  myRelationshipStatus?: string | null;
};

type PersonRow = {
  follow_id: string;
  profile_id: string;
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  interest_type: string | null;
  created_at: string;
};

function getTitle(mode: Mode, isOwnProfile: boolean) {
  if (mode === "followers") return isOwnProfile ? "Quem segue você" : "Seguidores";
  if (mode === "following") return isOwnProfile ? "Quem você segue" : "Seguindo";
  if (mode === "interested") return isOwnProfile ? "Interessados em você" : "Interessados";
  return "";
}

function getEmptyText(mode: Mode, isOwnProfile: boolean) {
  if (mode === "followers")
    return isOwnProfile ? "Ninguém segue você ainda." : "Esse perfil ainda não tem seguidores.";
  if (mode === "following")
    return isOwnProfile ? "Você ainda não está seguindo ninguém." : "Esse perfil ainda não segue ninguém.";
  if (mode === "interested")
    return isOwnProfile ? "Ainda não teve nenhum crush aqui." : "Ainda não há interessados por aqui.";
  return "";
}

function isCommitted(status?: string | null) {
  return status === "committed" || status === "other";
}

// Use dynamic height that works reliably across web, mobile web, and Capacitor (APK)
function getSheetHeight() {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return Math.min(window.innerHeight * 0.82, 720);
  }
  return Math.min(Dimensions.get("window").height * 0.82, 720);
}

export default function PeopleListSheet(props: PeopleListSheetProps) {
  const {
    visible,
    mode,
    profileId,
    isOwnProfile,
    onClose,
    onOpenProfile,
    myRelationshipStatus,
  } = props;

  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [sheetHeight, setSheetHeight] = useState(() => getSheetHeight());
  const [data, setData] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const searchRef = useRef<TextInput>(null);

  // Recalculate height on mount and when visible changes (handles Capacitor viewport)
  useEffect(() => {
    if (visible) {
      setSheetHeight(getSheetHeight());
    }
  }, [visible]);

  const title = useMemo(() => getTitle(mode, isOwnProfile), [mode, isOwnProfile]);
  const isCrushBlocked = mode === "interested" && isCommitted(myRelationshipStatus);

  useEffect(() => {
    let isCancelled = false;

    async function load() {
      if (!visible || !profileId || isCrushBlocked) {
        setData([]);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      let viewName = "";
      if (mode === "followers") viewName = "view_followers_detailed";
      else if (mode === "following") viewName = "view_following_detailed";
      else if (mode === "interested") viewName = "view_crush_detailed";

      const { data: rows, error: fetchError } = await supabase
        .from(viewName)
        .select("*")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false });

      if (isCancelled) return;

      if (fetchError) {
        setError(fetchError.message);
        setData([]);
      } else {
        setData((rows ?? []) as PersonRow[]);
      }
      setLoading(false);
    }

    load();
    return () => { isCancelled = true; };
  }, [visible, mode, profileId, isCrushBlocked]);

  // Reset search when modal opens/closes
  useEffect(() => {
    if (!visible) setSearch("");
  }, [visible]);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.trim().toLowerCase();
    return data.filter(
      (p) =>
        (p.full_name && p.full_name.toLowerCase().includes(q)) ||
        (p.username && p.username.toLowerCase().includes(q))
    );
  }, [data, search]);

  const showEmptyState = !loading && !error && filtered.length === 0 && !isCrushBlocked;

  const renderItem = useCallback(
    ({ item }: { item: PersonRow }) => {
      const displayName = item.full_name?.trim() || item.username?.trim() || "Usuário do Lupyy";
      const uname = item.username?.trim() ? `@${item.username}` : "";
      const showCrushBadge = mode === "interested" && item.interest_type === "crush";

      return (
        <TouchableOpacity
          style={s.row}
          activeOpacity={0.7}
          onPress={() => {
            onClose();
            setTimeout(() => onOpenProfile(item.user_id), 150);
          }}
        >
          <View style={s.avatarWrap}>
            {item.avatar_url ? (
              <ExpoImage source={{ uri: item.avatar_url }} style={s.avatar} contentFit="cover" cachePolicy="disk" />
            ) : (
              <View style={[s.avatarFallback, { backgroundColor: theme.colors.surface }]}>
                <Text style={[s.avatarFallbackText, { color: theme.colors.primary || "#a855f7" }]}>
                  {displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          <View style={s.info}>
            <Text style={[s.name, { color: theme.colors.text }]} numberOfLines={1}>
              {displayName}
            </Text>
            {uname ? (
              <Text style={[s.username, { color: theme.colors.textMuted }]} numberOfLines={1}>
                {uname}
              </Text>
            ) : null}
          </View>

          {showCrushBadge && (
            <View style={s.crushBadge}>
              <Text style={s.crushBadgeText}>💘 Crush</Text>
            </View>
          )}

          <View style={[s.profileBtn, { borderColor: theme.colors.border }]}>
            <Text style={[s.profileBtnText, { color: theme.colors.text }]}>Ver</Text>
          </View>
        </TouchableOpacity>
      );
    },
    [mode, onClose, onOpenProfile, theme]
  );

  const keyExtractor = useCallback(
    (item: PersonRow, index: number) => item.follow_id || `${item.user_id}-${index}`,
    []
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={s.modalRoot}>
        <Pressable style={s.backdrop} onPress={onClose} />

        {/* Android/Capacitor: fixed height is required — maxHeight + flex:1 alone collapses FlatList to 0 */}
        <View
          style={[
            s.sheetContainer,
            {
              height: sheetHeight,
              maxHeight: sheetHeight,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View style={[s.sheet, { backgroundColor: theme.colors.background, flex: 1 }]}>
          {/* ── Handle ── */}
          <View style={s.handleWrap}>
            <View style={[s.handle, { backgroundColor: theme.colors.border }]} />
          </View>

          {/* ── Header ── */}
          <View style={[s.header, { borderBottomColor: theme.colors.border }]}>
            <View style={{ width: 40 }} />
            <Text style={[s.title, { color: theme.colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} activeOpacity={0.7}>
              <Text style={[s.closeBtnText, { color: theme.colors.text }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* ── Search (always when list allowed — not gated on data.length; avoids blank gap while loading on native) ── */}
          {!isCrushBlocked && (
            <View style={[s.searchWrap, { borderBottomColor: theme.colors.border }]}>
              <View style={[s.searchBox, { backgroundColor: theme.colors.surface }]}>
                <Text style={[s.searchIcon, { color: theme.colors.textMuted }]}>🔍</Text>
                <TextInput
                  ref={searchRef}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Pesquisar"
                  placeholderTextColor={theme.colors.textMuted}
                  style={[s.searchInput, { color: theme.colors.text }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {search.length > 0 && (
                  <TouchableOpacity onPress={() => { setSearch(""); searchRef.current?.focus(); }}>
                    <Text style={[s.searchClear, { color: theme.colors.textMuted }]}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* ── Crush blocked ── */}
          {isCrushBlocked ? (
            <View style={s.blockedContainer}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>🔒</Text>
              <Text style={[s.blockedTitle, { color: theme.colors.text }]}>Lista bloqueada</Text>
              <Text style={[s.blockedSubtext, { color: theme.colors.textMuted }]}>
                Enquanto seu status for comprometido, a lista de interessados fica oculta. Mude para Solteiro para
                desbloquear.
              </Text>
            </View>
          ) : (
            <View style={s.listArea}>
              {loading && (
                <View style={s.center}>
                  {/* Skeleton loading */}
                  {[0, 1, 2, 3, 4].map((i) => (
                    <View key={i} style={s.skeletonRow}>
                      <View style={[s.skeletonCircle, { backgroundColor: theme.colors.surface }]} />
                      <View style={s.skeletonText}>
                        <View
                          style={[
                            s.skeletonLine,
                            { backgroundColor: theme.colors.surface, width: 100 + Math.random() * 60 },
                          ]}
                        />
                        <View
                          style={[
                            s.skeletonLine,
                            { backgroundColor: theme.colors.surface, width: 60 + Math.random() * 40, marginTop: 6 },
                          ]}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {error && !loading && (
                <View style={s.center}>
                  <Text style={{ fontSize: 36, marginBottom: 8 }}>😕</Text>
                  <Text style={[s.errorText, { color: "#ff8080" }]}>Não foi possível carregar a lista.</Text>
                </View>
              )}

              {showEmptyState && (
                <View style={s.center}>
                  <Text style={{ fontSize: 36, marginBottom: 8 }}>
                    {mode === "interested" ? "💘" : "👥"}
                  </Text>
                  <Text style={[s.emptyText, { color: theme.colors.textMuted }]}>
                    {search.trim()
                      ? `Nenhum resultado para "${search.trim()}"`
                      : getEmptyText(mode, isOwnProfile)}
                  </Text>
                </View>
              )}

              {!loading && !error && filtered.length > 0 && (
                <FlatList
                  data={filtered}
                  keyExtractor={keyExtractor}
                  renderItem={renderItem}
                  style={s.flatList}
                  contentContainerStyle={s.listContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  initialNumToRender={15}
                  maxToRenderPerBatch={20}
                  windowSize={10}
                  removeClippedSubviews={Platform.OS !== "android"}
                  getItemLayout={(_, index) => ({
                    length: 64,
                    offset: 64 * index,
                    index,
                  })}
                />
              )}
            </View>
          )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheetContainer: {
    width: "100%",
    zIndex: 20,
  },
  sheet: {
    minHeight: 280,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 -4px 30px rgba(0,0,0,0.3)",
      } as any,
      default: {
        elevation: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
    }),
  },
  handleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 2,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    flex: 1,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: "600",
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "web" ? 8 : 6,
    gap: 8,
  },
  searchIcon: {
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    padding: 0,
    margin: 0,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } as any : {}),
  },
  searchClear: {
    fontSize: 14,
    padding: 4,
  },
  listArea: {
    flex: 1,
    minHeight: 120,
  },
  flatList: {
    flex: 1,
  },
  center: {
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 20,
  },
  blockedContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  blockedTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 8,
  },
  blockedSubtext: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 280,
  },
  listContent: {
    paddingVertical: 4,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    height: 64,
  },
  avatarWrap: {
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    fontSize: 20,
    fontWeight: "700",
  },
  info: {
    flex: 1,
    paddingRight: 8,
  },
  name: {
    fontSize: 14,
    fontWeight: "600",
  },
  username: {
    fontSize: 13,
    marginTop: 1,
  },
  crushBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255,128,192,0.15)",
    marginRight: 8,
  },
  crushBadgeText: {
    color: "rgba(255,180,220,0.95)",
    fontSize: 11,
    fontWeight: "600",
  },
  profileBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  profileBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  // Skeleton
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    width: "100%",
  },
  skeletonCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  skeletonText: {
    flex: 1,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
  },
});
