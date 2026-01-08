import Colors from "@/constants/Colors";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { memo, useCallback, useEffect, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

export type PostCardProps = {
  id: number | string;
  media_type: "image" | "video";
  media_url: string;
  thumb_url?: string | null;
  username?: string | null;
  created_at?: string | null;
  caption?: string | null;
  isVisible?: boolean;
  muted?: boolean;
  likesCount?: number;
  commentsCount?: number;
  repostsCount?: number;
  avatarUrl?: string | null;
  liked?: boolean;
  onPressMedia?: () => void;
  onLike?: () => void;
  onComment?: () => void;
  onRepost?: () => void;
  onShare?: () => void;
  onPressUser?: () => void;
};

function timeAgo(ts?: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function _PostCard(props: PostCardProps) {
  const {
    media_type,
    media_url,
    thumb_url,
    username,
    created_at,
    caption,
    isVisible = false,
    muted = true,
    likesCount = 0,
    commentsCount = 0,
    repostsCount = 0,
    liked = false,
    avatarUrl,
    onPressMedia,
    onLike,
    onComment,
    onRepost,
    onShare,
    onPressUser,
  } = props;

  const isWeb = Platform.OS === "web";

  const { width: windowWidth } = useWindowDimensions();

  const player = useVideoPlayer(media_url, (p) => {
    p.loop = true;
    // no WEB: nunca mutar o vídeo (som sempre liberado)
    // no APK / nativo: respeita a prop muted
    p.muted = isWeb ? false : !!muted;
  });

  const [paused, setPaused] = useState(!isVisible);

  // controla play/pause quando entra/sai da tela
  useEffect(() => {
    if (media_type !== "video") return;
    if (isVisible) {
      setPaused(false);
      player.play();
    } else {
      setPaused(true);
      player.pause();
    }
  }, [isVisible, player, media_type]);

  // controla play/pause quando toca na tela
  useEffect(() => {
    if (media_type !== "video") return;
    if (paused) {
      player.pause();
    } else if (isVisible) {
      player.play();
    }
  }, [paused, isVisible, player, media_type]);

  // mute / unmute — só no nativo, para não brigar com o navegador
  useEffect(() => {
    if (media_type !== "video" || isWeb) return;
    player.muted = !!muted;
  }, [muted, player, media_type, isWeb]);

  // cleanup
  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {}
    };
  }, [player]);

  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);

  const kickHeart = () => {
    heartOpacity.value = 1;
    heartScale.value = 0;
    heartScale.value = withSequence(
      withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) }),
      withTiming(0.9, { duration: 90 }),
      withTiming(0, { duration: 220, easing: Easing.in(Easing.cubic) })
    );
    heartOpacity.value = withSequence(
      withTiming(1, { duration: 120 }),
      withTiming(0, { duration: 250 })
    );
  };

  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
    opacity: heartOpacity.value,
  }));

  const onDoubleTapLike = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    kickHeart();
    if (!liked) onLike?.();
  };

  const togglePaused = useCallback(() => {
    setPaused((prev) => !prev);
  }, []);

  const handleSinglePress = useCallback(() => {
    if (media_type === "video") {
      if (onPressMedia) {
        onPressMedia();
      } else {
        togglePaused();
      }
    } else if (onPressMedia) {
      onPressMedia();
    }
  }, [media_type, onPressMedia, togglePaused]);

  const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd((_evt, success) => {
    if (success) runOnJS(onDoubleTapLike)();
  });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .requireExternalGestureToFail(doubleTap)
    .onEnd((_evt, success) => {
      if (!success) return;
      runOnJS(handleSinglePress)();
    });

  const composedGesture = Gesture.Exclusive(doubleTap, singleTap);

  const likeIconColor = liked ? Colors.brandStart : Colors.text;

  const shouldShowVideo = media_type === "video" && isVisible && !paused;

  const cardStyle = [
    styles.card,
    isWeb && windowWidth < 520
      ? { width: windowWidth, maxWidth: windowWidth }
      : null,
  ];

  return (
    <View style={cardStyle}>
      <View style={styles.header}>
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={styles.avatar}
            contentFit="cover"
            cachePolicy="disk"
          />
        ) : (
          <View style={styles.avatar} />
        )}
        <View style={{ flex: 1 }}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onPressUser}
            disabled={!onPressUser}
          >
            <Text style={styles.username}>{username || "user"}</Text>
          </TouchableOpacity>
          <Text style={styles.date}>{timeAgo(created_at)}</Text>
        </View>
      </View>

      <View style={styles.mediaContainer}>
        {isWeb ? (
          <TouchableOpacity
            activeOpacity={1}
            style={styles.mediaWrapper}
            accessible
            accessibilityRole="imagebutton"
            onPress={handleSinglePress}
          >
            {media_type === "image" ? (
              <Image
                source={{ uri: media_url }}
                style={styles.media}
                contentFit="cover"
                cachePolicy="disk"
              />
            ) : shouldShowVideo ? (
              <VideoView
                style={styles.media}
                player={player}
                contentFit="cover"
              />
            ) : thumb_url ? (
              <Image
                source={{ uri: thumb_url }}
                style={styles.media}
                contentFit="cover"
                cachePolicy="disk"
              />
            ) : (
              <View style={styles.videoPlaceholder} />
            )}

            <Animated.View
              pointerEvents="none"
              style={[styles.heartWrap, heartStyle]}
            >
              <Text style={styles.heart}>❤</Text>
            </Animated.View>
          </TouchableOpacity>
        ) : (
          <GestureDetector gesture={composedGesture}>
            <View
              style={styles.mediaWrapper}
              accessible
              accessibilityRole="imagebutton"
            >
              {media_type === "image" ? (
                <Image
                  source={{ uri: media_url }}
                  style={styles.media}
                  contentFit="cover"
                  cachePolicy="disk"
                />
              ) : shouldShowVideo ? (
                <VideoView
                  style={styles.media}
                  player={player}
                  contentFit="cover"
                />
              ) : thumb_url ? (
                <Image
                  source={{ uri: thumb_url }}
                  style={styles.media}
                  contentFit="cover"
                  cachePolicy="disk"
                />
              ) : (
                <View style={styles.videoPlaceholder} />
              )}

              <Animated.View
                pointerEvents="none"
                style={[styles.heartWrap, heartStyle]}
              >
                <Text style={styles.heart}>❤</Text>
              </Animated.View>
            </View>
          </GestureDetector>
        )}
      </View>

      <View style={styles.actionsBar}>
        <TouchableOpacity onPress={onLike} style={styles.actionBtn}>
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={24}
            color={likeIconColor}
          />
          <Text style={styles.actionCount}>{likesCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onComment} style={styles.actionBtn}>
          <Ionicons
            name="chatbubble-outline"
            size={24}
            color={Colors.text}
          />
          <Text style={styles.actionCount}>{commentsCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onRepost} style={styles.actionBtn}>
          <Ionicons
            name="arrow-redo-outline"
            size={24}
            color={Colors.text}
          />
          <Text style={styles.actionCount}>{repostsCount}</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        <TouchableOpacity onPress={onShare} style={styles.shareBtn}>
          <Feather name="send" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {likesCount > 0 && (
        <Text style={styles.likesText}>
          {likesCount} curtida{likesCount === 1 ? "" : "s"}
        </Text>
      )}

      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    width: "100%",
    alignSelf: "center",
    ...(Platform.OS === "web" && {
      maxWidth: 520,
      width: 520,
      marginTop: 24,
    }),
  },
  header: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.border,
  },
  username: { color: Colors.text, fontWeight: "700" },
  date: { color: Colors.textMuted, fontSize: 12 },
  mediaContainer: {
    width: "100%",
    aspectRatio: 4 / 5,
    position: "relative",
    backgroundColor: Colors.border,
  },
  mediaWrapper: {
    width: "100%",
    height: "100%",
  },
  media: { width: "100%", height: "100%" },
  videoPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  heartWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  heart: {
    fontSize: 96,
    color: "white",
    textShadowColor: "#0006",
    textShadowRadius: 12,
  },
  actionsBar: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
  },
  actionCount: {
    color: Colors.text,
    marginLeft: 6,
    fontWeight: "700",
  },
  shareBtn: { padding: 8 },
  likesText: {
    color: Colors.text,
    paddingHorizontal: 12,
    marginBottom: 4,
    fontSize: 13,
    fontWeight: "600",
  },
  caption: {
    color: Colors.text,
    paddingHorizontal: 12,
    paddingBottom: 12,
    fontSize: 14,
  },
});

export const PostCard = memo(_PostCard);
