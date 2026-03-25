import { Feather, Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { VideoView, useVideoPlayer } from "expo-video";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ViewToken } from "react-native";
import {
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text as TextRaw,
  View,
} from "react-native";

export type ViewerItem = {
  id: string | number;
  media_type: "image" | "video";
  media_url: string;
  filter?: string | null;
  thumb_url?: string | null;
  username?: string | null;
  caption?: string | null;
  user_id?: string | null;
};

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
};

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get("window");

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

const ViewerHeader: React.FC<{ title: string; onBack: () => void }> = ({
  title,
  onBack,
}) => (
  <View style={styles.header}>
    <Pressable onPress={onBack} style={styles.headerBtn} hitSlop={10}>
      <Ionicons name="arrow-back" size={22} color="#fff" />
    </Pressable>
    <TextLite style={styles.headerTitle}>{title}</TextLite>
    <View style={styles.headerRightSpace} />
  </View>
);

/* ─── Video with preload-ready player ─── */
const ViewerVideo: React.FC<{ uri: string; playing: boolean }> = React.memo(({
  uri,
  playing,
}) => {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = Platform.OS === "web";
    if (playing) p.play();
  });

  useEffect(() => {
    if (!player) return;
    if (playing) {
      player.play();
    } else {
      player.pause();
    }
    return () => {
      try { player.pause(); } catch {}
    };
  }, [playing, player]);

  return (
    <VideoView
      style={styles.media}
      player={player}
      contentFit="cover"
      allowsFullscreen={false}
      allowsPictureInPicture={false}
    />
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

/* ─── Single Page ─── */
const ViewerPage = React.memo(function ViewerPage({
  item,
  index,
  current,
  counts,
  controlsVisible,
  onLike,
  onComment,
  onRepost,
  onShare,
  onToggleControls,
  onHideControls,
}: {
  item: ViewerItem;
  index: number;
  current: number;
  counts: Counts;
  controlsVisible: boolean;
  onLike?: () => void;
  onComment?: () => void;
  onRepost?: () => void;
  onShare?: () => void;
  onToggleControls: () => void;
  onHideControls: () => void;
}) {
  const playing = index === current;
  const isVideo = item.media_type === "video";
  const likeColor = counts.liked ? "#ff4f7d" : "#ffffff";

  // Only render video player for current ±1 items for performance
  const shouldRenderVideo = isVideo && Math.abs(index - current) <= 1;

  return (
    <Pressable
      style={styles.page}
      onPress={onToggleControls}
      onLongPress={onHideControls}
      delayLongPress={250}
    >
      {/* Bottom gradient for readability */}
      <LinearGradient
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.65)"]}
        style={styles.pageBottomGradient}
        pointerEvents="none"
      />

      <View style={styles.mediaContainer}>
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
            contentFit="cover"
            transition={150}
            cachePolicy="disk"
          />
        )}

        <FilterOverlay filterId={item.filter} />
      </View>

      {controlsVisible && (
        <View style={styles.actionsWrapper}>
          <View style={styles.sideActions}>
            <Pressable onPress={onLike} style={styles.sideButton} hitSlop={10}>
              <Ionicons
                name={counts.liked ? "heart" : "heart-outline"}
                size={34}
                color={likeColor}
              />
              {counts.likes > 0 && (
                <TextLite style={styles.sideCount}>{counts.likes}</TextLite>
              )}
            </Pressable>

            <Pressable onPress={onComment} style={styles.sideButton} hitSlop={10}>
              <Ionicons name="chatbubble-outline" size={30} color="#ffffff" />
              {counts.comments > 0 && (
                <TextLite style={styles.sideCount}>{counts.comments}</TextLite>
              )}
            </Pressable>

            <Pressable onPress={onRepost} style={styles.sideButton} hitSlop={10}>
              <Ionicons name="arrow-redo-outline" size={30} color="#ffffff" />
              {counts.reposts > 0 && (
                <TextLite style={styles.sideCount}>{counts.reposts}</TextLite>
              )}
            </Pressable>

            <Pressable onPress={onShare} style={styles.sideButton} hitSlop={10}>
              <Feather name="send" size={28} color="#ffffff" />
            </Pressable>
          </View>
        </View>
      )}

      {controlsVisible &&
        (item.username || item.caption || counts.likes > 0) && (
          <View style={styles.footer}>
            {counts.likes > 0 && (
              <TextLite style={styles.likes}>
                {counts.likes} curtida{counts.likes === 1 ? "" : "s"}
              </TextLite>
            )}
            {item.username && (
              <TextLite style={styles.username}>{item.username}</TextLite>
            )}
            {item.caption && (
              <TextLite numberOfLines={2} style={styles.caption}>
                {item.caption}
              </TextLite>
            )}
          </View>
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
  currentUserId,
  onDeletePost,
}: Props) {
  const listRef = useRef<FlatList<ViewerItem>>(null);
  const [current, setCurrent] = useState<number>(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [initialIndex, setInitialIndex] = useState<number>(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuBusy, setMenuBusy] = useState(false);

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
      await onDeletePost(currentItem.id);
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

  // VERTICAL layout — each page is full screen height
  const getItemLayout = useCallback(
    (_: ArrayLike<ViewerItem> | null | undefined, index: number) => ({
      length: SCREEN_H,
      offset: SCREEN_H * index,
      index,
    }),
    []
  );

  if (!visible) return null;

  return (
    <Modal visible={visible} onRequestClose={onClose} animationType="fade">
      <View style={styles.container}>
        <StatusBar translucent backgroundColor="#000" barStyle="light-content" />

        {controlsVisible && <ViewerHeader title="Reels" onBack={onClose} />}

        {controlsVisible && itemCount > 0 && canManage && (
          <Pressable onPress={openMenu} style={styles.moreBtn} hitSlop={12}>
            <Ionicons name="ellipsis-vertical" size={22} color="#fff" />
          </Pressable>
        )}

        {itemCount === 0 ? (
          <View style={styles.emptyWrapper}>
            <TextLite style={styles.emptyText}>Não há conteúdo para exibir.</TextLite>
          </View>
        ) : (
          <FlatList
            key={`viewer-v-${visible ? 1 : 0}-${initialIndex}-${itemCount}`}
            ref={listRef}
            data={data}
            keyExtractor={keyExtractor}
            horizontal={false}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            snapToInterval={SCREEN_H}
            snapToAlignment="start"
            decelerationRate="fast"
            onViewableItemsChanged={onViewableItemsChanged.current}
            viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
            initialScrollIndex={Platform.OS === "web" ? initialIndex : undefined}
            getItemLayout={getItemLayout}
            onMomentumScrollEnd={(e) => {
              const offsetY = e.nativeEvent.contentOffset.y || 0;
              const pageIndex = Math.round(offsetY / SCREEN_H);
              setCurrent(clampIndex(pageIndex));
            }}
            windowSize={3}
            maxToRenderPerBatch={2}
            removeClippedSubviews={Platform.OS !== "web"}
            extraData={current}
            renderItem={({ item, index }) => (
              <ViewerPage
                item={item}
                index={index}
                current={current}
                counts={countsForId(item.id)}
                controlsVisible={controlsVisible}
                onLike={() => onLike?.(item.id)}
                onComment={() => onComment?.(item.id)}
                onRepost={() => onRepost?.(item.id)}
                onShare={() => onShare?.(item.id)}
                onToggleControls={toggleControls}
                onHideControls={onHideControls}
              />
            )}
          />
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  header: {
    position: "absolute",
    top: Platform.OS === "web" ? 18 : 44,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  headerRightSpace: { width: 40, height: 40 },

  moreBtn: {
    position: "absolute",
    top: Platform.OS === "web" ? 20 : 52,
    right: 16,
    padding: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.35)",
    zIndex: 11,
  },

  // Each page fills the entire screen vertically
  page: {
    width: SCREEN_W,
    height: SCREEN_H,
    alignItems: "center",
    justifyContent: "center",
  },
  pageBottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    zIndex: 2,
  },
  mediaContainer: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
  },
  media: { width: "100%", height: "100%" },

  actionsWrapper: {
    position: "absolute",
    right: 12,
    bottom: Platform.select({ ios: 120, android: 100, default: 90 }),
    zIndex: 5,
    alignItems: "center",
  },
  sideActions: { alignItems: "center" },
  sideButton: { alignItems: "center", marginBottom: 18 },
  sideCount: {
    marginTop: 2,
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },

  footer: {
    position: "absolute",
    bottom: Platform.select({ ios: 120, android: 100, default: 90 }),
    left: 16,
    right: 80,
    zIndex: 5,
  },
  likes: { color: "#ffffff", fontSize: 13, fontWeight: "600", marginBottom: 4 },
  username: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  caption: { color: "#fff", marginTop: 6, fontSize: 14 },

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
});
