import { supabase } from "@/lib/supabase";
import { Feather, Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ViewToken } from "react-native";
import {
    Alert,
    Dimensions,
    FlatList,
    Modal,
    NativeScrollEvent,
    NativeSyntheticEvent,
    Platform,
    Pressable,
    StatusBar,
    StyleSheet,
    TextInput,
    Text as TextRaw,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CommentsSheet from "./CommentsSheet";
import { CrossPlatformVideo } from "./CrossPlatformVideo";

export type ViewerItem = {
  id: string | number;
  /** Id real do post (likes, comentários, BD). Se omitido, usa-se `id` (ex.: itens duplicados no modo reel). */
  postId?: string | number;
  media_type: "image" | "video";
  media_url: string;
  filter?: string | null;
  thumb_url?: string | null;
  username?: string | null;
  caption?: string | null;
  user_id?: string | null;
  avatar_url?: string | null;
};

export function viewerItemPostId(item: ViewerItem): string | number {
  return item.postId ?? item.id;
}

export type Counts = {
  likes: number;
  comments: number;
  reposts: number;
  liked: boolean;
};

type Props = {
  visible: boolean;
  items: ViewerItem[];
  startIndex: number;
  onClose: () => void;
  getCounts?: (id: string | number) => Counts | undefined;
  onLike?: (id: string | number) => void;
  onComment?: (id: string | number) => void;
  onRepost?: (id: string | number) => void;
  onShare?: (id: string | number) => void;
  onPressUser?: (userId: string) => void;
  currentUserId?: string | null;
  onDeletePost?: (id: string | number) => void | Promise<void>;
  /** Called when user scrolls near the end — parent should load more items */
  onLoadMore?: () => void;
};

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get("window");
const COMMENT_BAR_HEIGHT = 74;

type FilterId = "none" | "warm" | "cool" | "pink" | "gold" | "night";

const FILTERS: { id: FilterId; overlay?: string; blur?: number; vignette?: boolean; glow?: boolean }[] = [
  { id: "none" },
  { id: "warm", overlay: "rgba(255,140,90,0.18)", glow: true },
  { id: "cool", overlay: "rgba(70,150,255,0.18)", glow: true },
  { id: "pink", overlay: "rgba(255,80,160,0.16)", glow: true },
  { id: "gold", overlay: "rgba(255,220,120,0.16)", glow: true, vignette: true },
  { id: "night", overlay: "rgba(0,0,0,0.28)", blur: 18, vignette: true },
];

const getFilter = (id?: string | null) =>
  FILTERS.find((f) => f.id === (id as FilterId)) ?? FILTERS[0];

const TextLite: React.FC<React.ComponentProps<typeof TextRaw>> = (props) => (
  <TextRaw allowFontScaling={false} {...props} />
);

const formatCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")} mi`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")} mil`;
  return String(n);
};

/* ─── Video with preload-ready player ─── */
const ViewerVideo: React.FC<{ uri: string; playing: boolean }> = React.memo(({
  uri,
  playing,
}) => {
  const [muted, setMuted] = useState(Platform.OS === "web");

  const toggleMute = useCallback(() => {
    setMuted((m) => !m);
  }, []);

  return (
    <View style={{ width: "100%", height: "100%" }}>
      <CrossPlatformVideo
        uri={uri}
        playing={playing}
        muted={muted}
        style={styles.media}
        contentFit="cover"
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />
      {Platform.OS === "web" && playing && (
        <Pressable
          onPress={toggleMute}
          style={{
            position: "absolute",
            bottom: 16,
            right: 16,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "rgba(0,0,0,0.5)",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
          hitSlop={8}
        >
          <Ionicons name={muted ? "volume-mute" : "volume-high"} size={20} color="#fff" />
        </Pressable>
      )}
    </View>
  );
});

/* ─── Filter Overlay ─── */
const FilterOverlay = React.memo(({ filterId }: { filterId?: string | null }) => {
  const f = getFilter(filterId);
  if (!f || f.id === "none") return null;
  return (
    <>
      {f.blur ? (
        <BlurView intensity={f.blur} tint="dark" style={StyleSheet.absoluteFill} />
      ) : null}
      {f.overlay ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: f.overlay }]} />
      ) : null}
      {f.glow ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <LinearGradient
            colors={["rgba(255,255,255,0.28)", "rgba(255,255,255,0.0)"]}
            style={styles.glowTop}
          />
        </View>
      ) : null}
      {f.vignette ? (
        <>
          <LinearGradient
            colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0)"]}
            style={styles.vignetteTop}
          />
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.65)"]}
            style={styles.vignetteBottom}
          />
        </>
      ) : null}
    </>
  );
});

/* ─── Single Page — Instagram Reels style ─── */
const ViewerPage = React.memo(function ViewerPage({
  item,
  index,
  current,
  counts,
  controlsVisible,
  commentBarH,
  onLike,
  onComment,
  onRepost,
  onShare,
  onToggleControls,
  onHideControls,
  onPressUser,
  themeColor,
}: {
  item: ViewerItem;
  index: number;
  current: number;
  counts: Counts;
  controlsVisible: boolean;
  commentBarH: number;
  onLike?: () => void;
  onComment?: () => void;
  onRepost?: () => void;
  onShare?: () => void;
  onToggleControls: () => void;
  onHideControls: () => void;
  onPressUser?: () => void;
  themeColor: string;
}) {
  const playing = index === current;
  const isVideo = item.media_type === "video";
  const likeColor = counts.liked ? "#ff4f7d" : "#ffffff";
  const shouldRenderVideo = isVideo && Math.abs(index - current) <= 1;

  return (
    <Pressable
      style={styles.page}
      onPress={onToggleControls}
      onLongPress={onHideControls}
      delayLongPress={250}
    >
      {/* Media area — respects comment bar */}
      <View style={[styles.mediaContainer, { bottom: commentBarH }]}>
        {isVideo ? (
          shouldRenderVideo ? (
            <ViewerVideo uri={item.media_url} playing={playing} />
          ) : item.thumb_url ? (
            <Image
              source={{ uri: item.thumb_url }}
              style={styles.media}
              contentFit="cover"
              cachePolicy="disk"
            />
          ) : (
            <View style={[styles.media, { backgroundColor: "#111" }]} />
          )
        ) : (
          <Image
            source={{ uri: item.media_url }}
            style={styles.media}
            contentFit="contain"
            transition={150}
            cachePolicy="disk"
          />
        )}

        <FilterOverlay filterId={item.filter} />
      </View>

      {/* Bottom dark area behind comment bar */}
      <View style={[styles.commentBarBg, { height: commentBarH }]} />

      {/* Bottom gradient for readability — above comment bar */}
      <LinearGradient
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.75)"]}
        style={[styles.pageBottomGradient, { bottom: commentBarH }]}
        pointerEvents="none"
      />

      {/* Top gradient */}
      <LinearGradient
        colors={["rgba(0,0,0,0.5)", "rgba(0,0,0,0)"]}
        style={styles.pageTopGradient}
        pointerEvents="none"
      />

      {controlsVisible && (
        <>
          {/* Side actions — positioned above comment bar */}
          <View style={[styles.sideActions, { bottom: commentBarH + 24 }]}>
            <Pressable onPress={onLike} style={styles.sideButton} hitSlop={10}>
              <Ionicons
                name={counts.liked ? "heart" : "heart-outline"}
                size={30}
                color={likeColor}
              />
              {counts.likes > 0 && (
                <TextLite style={styles.sideCount}>{formatCount(counts.likes)}</TextLite>
              )}
            </Pressable>

            <Pressable onPress={onComment} style={styles.sideButton} hitSlop={10}>
              <Ionicons name="chatbubble-outline" size={26} color="#ffffff" />
              {counts.comments > 0 && (
                <TextLite style={styles.sideCount}>{formatCount(counts.comments)}</TextLite>
              )}
            </Pressable>

            <Pressable onPress={onRepost} style={styles.sideButton} hitSlop={10}>
              <Ionicons name="arrow-redo-outline" size={26} color="#ffffff" />
              {counts.reposts > 0 && (
                <TextLite style={styles.sideCount}>{formatCount(counts.reposts)}</TextLite>
              )}
            </Pressable>

            <Pressable onPress={onShare} style={styles.sideButton} hitSlop={10}>
              <Feather name="send" size={24} color="#ffffff" />
            </Pressable>
          </View>

          {/* Footer — user info + caption — above comment bar */}
          <View style={[styles.footer, { bottom: commentBarH + 2 }]}> 
            <Pressable style={styles.userRow} onPress={onPressUser}>
              {item.avatar_url ? (
                <Image
                  source={{ uri: item.avatar_url }}
                  style={styles.avatar}
                  contentFit="cover"
                  cachePolicy="disk"
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={16} color="rgba(255,255,255,0.6)" />
                </View>
              )}
              <TextLite numberOfLines={1} style={styles.username}>{item.username ?? "Usuário"}</TextLite>
            </Pressable>
            {item.caption ? (
              <TextLite numberOfLines={2} style={styles.caption}>
                {item.caption}
              </TextLite>
            ) : null}
          </View>
        </>
      )}
    </Pressable>
  );
});

/* ─── Main FullscreenViewer ─── */
export default function FullscreenViewer({
  visible,
  items,
  startIndex,
  onClose,
  getCounts,
  onLike,
  onComment,
  onRepost,
  onShare,
  onPressUser,
  currentUserId,
  onDeletePost,
  onLoadMore,
}: Props) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ViewerItem>>(null);
  const [current, setCurrent] = useState<number>(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [initialIndex, setInitialIndex] = useState<number>(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuBusy, setMenuBusy] = useState(false);
  const [fsCommentsOpen, setFsCommentsOpen] = useState(false);
  const [fsCommentsPostId, setFsCommentsPostId] = useState<number | null>(null);
  const [commentText, setCommentText] = useState("");
  const [loadMoreLocked, setLoadMoreLocked] = useState(false);

  const commentBarH = COMMENT_BAR_HEIGHT + Math.max(insets.bottom, 16);
  const themeColor = "#00C26F";

  const data = useMemo(() => items ?? [], [items]);
  const itemCount = data.length;

  const clampIndex = useCallback(
    (index: number) => {
      if (itemCount === 0) return 0;
      return Math.min(Math.max(index, 0), itemCount - 1);
    },
    [itemCount]
  );

  const currentItem = data[clampIndex(current)] as ViewerItem | undefined;
  const canManage =
    !!currentUserId &&
    !!currentItem?.user_id &&
    currentUserId === currentItem.user_id;

  const openMenu = useCallback(() => {
    if (!currentItem || !canManage) return;
    setMenuOpen(true);
  }, [currentItem, canManage]);

  const closeMenu = useCallback(() => {
    if (menuBusy) return;
    setMenuOpen(false);
  }, [menuBusy]);

  const confirmDelete = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        Alert.alert(
          "Apagar postagem",
          "Essa ação é permanente. Quer apagar esta postagem?",
          [
            { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
            { text: "Apagar", style: "destructive", onPress: () => resolve(true) },
          ]
        );
      }),
    []
  );

  const doDelete = useCallback(async () => {
    if (!currentItem || !canManage || !onDeletePost) return;
    const ok = await confirmDelete();
    if (!ok) return;
    try {
      setMenuBusy(true);
      await onDeletePost(viewerItemPostId(currentItem));
      setMenuOpen(false);
    } finally {
      setMenuBusy(false);
    }
  }, [currentItem, canManage, onDeletePost, confirmDelete]);

  // Reset on open
  useEffect(() => {
    if (!visible) return;
    if (itemCount === 0) {
      setCurrent(0);
      setInitialIndex(0);
      return;
    }
    const safeIndex = clampIndex(startIndex ?? 0);
    setCurrent(safeIndex);
    setInitialIndex(safeIndex);

    if (Platform.OS !== "web" && listRef.current) {
      requestAnimationFrame(() => {
        try {
          listRef.current?.scrollToIndex({ index: safeIndex, animated: false });
        } catch {
          try {
            listRef.current?.scrollToIndex({ index: 0, animated: false });
            setCurrent(0);
            setInitialIndex(0);
          } catch {}
        }
      });
    }
  }, [visible, startIndex, itemCount, clampIndex]);

  const keyExtractor = useCallback((it: ViewerItem) => String(it.id), []);

  const toggleControls = useCallback(() => setControlsVisible((p) => !p), []);
  const onHideControls = useCallback(() => setControlsVisible(false), []);

  const countsForId = useCallback(
    (id: string | number): Counts => {
      const c = getCounts?.(id);
      return {
        likes: c?.likes ?? 0,
        comments: c?.comments ?? 0,
        reposts: c?.reposts ?? 0,
        liked: !!c?.liked,
      };
    },
    [getCounts]
  );

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (!viewableItems || viewableItems.length === 0) return;
      const first = viewableItems[0];
      if (first.index == null) return;
      setCurrent(first.index);
    }
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<ViewerItem> | null | undefined, index: number) => ({
      length: SCREEN_H,
      offset: SCREEN_H * index,
      index,
    }),
    []
  );

  const handleSubmitComment = useCallback(async () => {
    if (!commentText.trim()) return;
    const item = data[clampIndex(current)];
    if (!item) return;
    const pid = viewerItemPostId(item);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id;
      if (!uid) return;
      await supabase.from("comments").insert({
        post_id: typeof pid === "number" ? pid : Number(pid),
        user_id: uid,
        content: commentText.trim(),
      });
      setCommentText("");
      setFsCommentsPostId(typeof pid === "number" ? pid : Number(pid));
      setFsCommentsOpen(true);
    } catch (err) {
      console.log("Comment error:", err);
    }
  }, [commentText, data, current, clampIndex]);

  if (!visible) return null;

  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = e.nativeEvent.contentOffset.y || 0;
    const pageIndex = Math.round(offsetY / SCREEN_H);
    setCurrent(clampIndex(pageIndex));

    const visibleBottom = offsetY + SCREEN_H * 1.5;
    const totalHeight = SCREEN_H * itemCount;
    if (!loadMoreLocked && visibleBottom >= totalHeight) {
      setLoadMoreLocked(true);
      onLoadMore?.();
      setTimeout(() => setLoadMoreLocked(false), 900);
    }
  };

  return (
    <Modal visible={visible} onRequestClose={onClose} animationType="fade" statusBarTranslucent navigationBarTranslucent>
      <View style={styles.container}>
        <StatusBar translucent backgroundColor="#000" barStyle="light-content" />

        {controlsVisible && (
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.headerBtn} hitSlop={10}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </Pressable>
            <View style={{ width: 40 }} />
            <View style={styles.headerRightGroup}>
              {canManage && (
                <Pressable onPress={openMenu} hitSlop={12} style={styles.headerBtn}>
                  <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
                </Pressable>
              )}
              {!canManage && <View style={{ width: 40 }} />}
            </View>
          </View>
        )}

        {itemCount === 0 ? (
          <View style={styles.emptyWrapper}>
            <TextLite style={styles.emptyText}>Não há conteúdo para exibir.</TextLite>
          </View>
        ) : (
          <FlatList
            key={`viewer-v-${visible ? 1 : 0}-${initialIndex}`}
            ref={listRef}
            data={data}
            keyExtractor={keyExtractor}
            horizontal={false}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            snapToInterval={SCREEN_H}
            snapToAlignment="start"
            decelerationRate="fast"
            bounces={false}
            overScrollMode="never"
            onViewableItemsChanged={onViewableItemsChanged.current}
            viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
            initialScrollIndex={Platform.OS === "web" ? initialIndex : undefined}
            getItemLayout={getItemLayout}
            onMomentumScrollEnd={handleScrollEnd}
            onEndReached={() => {
              if (!loadMoreLocked) {
                setLoadMoreLocked(true);
                onLoadMore?.();
                setTimeout(() => setLoadMoreLocked(false), 900);
              }
            }}
            onEndReachedThreshold={0.6}
            windowSize={9}
            maxToRenderPerBatch={5}
            removeClippedSubviews={Platform.OS !== "web"}
            extraData={{ current, itemCount }}
            renderItem={({ item, index }) => (
              <ViewerPage
                item={item}
                index={index}
                current={current}
                counts={countsForId(viewerItemPostId(item))}
                controlsVisible={controlsVisible}
                commentBarH={commentBarH}
                onLike={() => onLike?.(viewerItemPostId(item))}
                onComment={() => {
                  const pid = viewerItemPostId(item);
                  setFsCommentsPostId(typeof pid === "number" ? pid : Number(pid));
                  setFsCommentsOpen(true);
                }}
                onRepost={() => onRepost?.(viewerItemPostId(item))}
                onShare={() => onShare?.(viewerItemPostId(item))}
                onPressUser={() => item.user_id && onPressUser?.(item.user_id)}
                onToggleControls={toggleControls}
                onHideControls={onHideControls}
                themeColor={themeColor}
              />
            )}
          />
        )}

        {/* Comment input bar — Instagram style, fixed bottom, dark background */}
        {controlsVisible && itemCount > 0 && (
          <View style={[styles.commentBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.commentInputRow}>
              {currentItem?.avatar_url ? (
                <Image
                  source={{ uri: currentItem.avatar_url }}
                  style={styles.commentAvatar}
                  contentFit="cover"
                  cachePolicy="disk"
                />
              ) : (
                <View style={styles.commentAvatarPlaceholder}>
                  <Ionicons name="person" size={14} color="rgba(255,255,255,0.5)" />
                </View>
              )}
              <TextInput
                style={styles.commentInput}
                placeholder="Faça um comentário..."
                placeholderTextColor="rgba(255,255,255,0.45)"
                value={commentText}
                onChangeText={setCommentText}
                onSubmitEditing={handleSubmitComment}
                returnKeyType="send"
              />
              {commentText.trim().length > 0 && (
                <TouchableOpacity
                  style={styles.commentSendBtn}
                  activeOpacity={0.7}
                  onPress={handleSubmitComment}
                >
                  <Ionicons name="send" size={18} color="#0095f6" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Options menu modal */}
        <Modal
          visible={menuOpen}
          transparent
          animationType="fade"
          onRequestClose={closeMenu}
        >
          <Pressable style={styles.menuBackdrop} onPress={closeMenu} />
          <View style={styles.menuWrapper} pointerEvents="box-none">
            <View style={styles.menuCard}>
              <View style={styles.menuHandle} />
              <View style={styles.menuHeaderRow}>
                <TextLite style={styles.menuTitle}>Opções</TextLite>
                <Pressable
                  onPress={closeMenu}
                  disabled={menuBusy}
                  style={styles.menuCloseBtn}
                  hitSlop={10}
                >
                  <Ionicons name="close" size={18} color="#fff" />
                </Pressable>
              </View>

              <Pressable disabled style={styles.menuItemDisabled}>
                <View style={styles.menuItemLeft}>
                  <Ionicons name="create-outline" size={18} color="rgba(255,255,255,0.35)" />
                  <TextLite style={styles.menuItemTextDisabled}>Editar legenda (em breve)</TextLite>
                </View>
              </Pressable>

              <Pressable disabled style={styles.menuItemDisabled}>
                <View style={styles.menuItemLeft}>
                  <Ionicons name="pin-outline" size={18} color="rgba(255,255,255,0.35)" />
                  <TextLite style={styles.menuItemTextDisabled}>Fixar no perfil (em breve)</TextLite>
                </View>
              </Pressable>

              <Pressable
                onPress={doDelete}
                disabled={!canManage || menuBusy || !onDeletePost}
                style={[
                  styles.menuItem,
                  (!canManage || !onDeletePost) && styles.menuItemDisabled,
                ]}
              >
                <View style={styles.menuItemLeft}>
                  <Ionicons name="trash-outline" size={18} color="#ff4f7d" />
                  <TextLite style={[styles.menuItemText, styles.menuItemDangerText]}>
                    Apagar postagem
                  </TextLite>
                </View>
                {menuBusy ? (
                  <Ionicons name="time-outline" size={18} color="rgba(255,255,255,0.55)" />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.55)" />
                )}
              </Pressable>

              <Pressable onPress={closeMenu} disabled={menuBusy} style={styles.menuCancel}>
                <TextLite style={styles.menuCancelText}>Cancelar</TextLite>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* Comments sheet */}
        <CommentsSheet
          visible={fsCommentsOpen}
          postId={fsCommentsPostId}
          onClose={() => { setFsCommentsOpen(false); setFsCommentsPostId(null); setCommentText(""); }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    overflow: "hidden" as any,
    ...(Platform.OS === "web" ? { alignItems: "center" as const } : {}),
  },

  header: {
    position: "absolute",
    top: Platform.OS === "web" ? 12 : 44,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    ...(Platform.OS === "web" ? { maxWidth: 500, alignSelf: "center" as const, width: "100%" as any } : {}),
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  headerRightGroup: {
    flexDirection: "row",
    alignItems: "center",
    width: 40,
  },

  page: {
    width: Platform.OS === "web" ? Math.min(SCREEN_W, 500) : SCREEN_W,
    height: SCREEN_H,
    overflow: "hidden" as any,
    backgroundColor: "#000",
    ...(Platform.OS === "web" ? { alignSelf: "center" as const, borderRadius: 16 } : {}),
  },
  pageBottomGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 200,
    zIndex: 2,
  },
  pageTopGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    zIndex: 2,
  },
  mediaContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    overflow: "hidden" as any,
  },
  media: { width: "100%", height: "100%" },

  /* Dark background for comment bar area */
  commentBarBg: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#000",
  },

  /* Side actions */
  sideActions: {
    position: "absolute",
    right: 12,
    zIndex: 5,
    alignItems: "center",
  },
  sideButton: {
    alignItems: "center",
    marginBottom: 20,
  },
  sideCount: {
    marginTop: 3,
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  /* Footer */
  footer: {
    position: "absolute",
    left: 16,
    right: 92,
    zIndex: 5,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.6)",
    marginRight: 10,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  username: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
    flexShrink: 1,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  caption: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    lineHeight: 19,
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  emptyWrapper: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: "#fff", fontSize: 16 },

  menuBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  menuWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: Platform.OS === "web" ? "auto" : 0,
    top: Platform.OS === "web" ? 0 : "auto",
    alignItems: "center",
    justifyContent: Platform.OS === "web" ? "center" : "flex-end",
    paddingHorizontal: 14,
    paddingBottom: Platform.OS === "web" ? 0 : 18,
  },
  menuCard: {
    width: Platform.OS === "web" ? 420 : "100%",
    borderRadius: 22,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: "rgba(18,18,18,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  menuHandle: {
    alignSelf: "center",
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
    marginBottom: 10,
  },
  menuHeaderRow: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  menuTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  menuCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  menuItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  menuItemLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  menuItemDisabled: { opacity: 0.55 },
  menuItemText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  menuItemDangerText: { color: "#ff4f7d" },
  menuItemTextDisabled: { color: "rgba(255,255,255,0.45)", fontSize: 15, fontWeight: "600" },
  menuCancel: {
    marginTop: 10,
    marginHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  menuCancelText: { color: "#fff", fontSize: 15, fontWeight: "800" },

  glowTop: { position: "absolute", top: 0, left: 0, right: 0, height: 160 },
  vignetteTop: { position: "absolute", top: 0, left: 0, right: 0, height: 220 },
  vignetteBottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 260 },

  /* Comment bar — Instagram style, dark bg, fixed bottom */
  commentBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 8,
    backgroundColor: "#000",
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    ...(Platform.OS === "web" ? { maxWidth: 500, alignSelf: "center" as const, width: "100%" as any } : {}),
  },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  commentAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  commentInput: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 16,
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  commentSendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
});
