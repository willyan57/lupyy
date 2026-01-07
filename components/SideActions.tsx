// components/SideActions.tsx
import * as Haptics from "expo-haptics";
import React, { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

export type Counts = {
  likes: number;
  comments: number;
  reposts: number;
  liked: boolean;
};

type Props = {
  counts: Counts;
  onLike?: () => void;
  onComment?: () => void;
  onRepost?: () => void;
  onShare?: () => void;
};

type TapProps = {
  children: React.ReactNode;
  onPress?: () => void;
  label: string;
  disabled?: boolean;
};

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

const SPRING_IN = { stiffness: 520, damping: 24, mass: 0.6 };
const SPRING_OUT = { stiffness: 360, damping: 22, mass: 0.8 };

const Tap = ({ children, onPress, label, disabled }: TapProps) => {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = useCallback(() => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress?.();
  }, [disabled, onPress]);

  return (
    <Pressable
      onPressIn={() => (scale.value = withSpring(0.92, SPRING_IN))}
      onPressOut={() => (scale.value = withSpring(1, SPRING_OUT))}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={12}
      android_ripple={{ color: "rgba(255,255,255,0.08)", borderless: true }}
      style={styles.btn}
    >
      <Animated.View style={style}>{children}</Animated.View>
    </Pressable>
  );
};

function SideActionsBase({ counts, onLike, onComment, onRepost, onShare }: Props) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Tap label="Like" onPress={onLike}>
        <View style={styles.center}>
          <Text style={[styles.icon, counts.liked && styles.liked]}>❤</Text>
          <Text style={styles.count}>{fmt(counts.likes)}</Text>
        </View>
      </Tap>

      <Tap label="Comment" onPress={onComment}>
        <View style={styles.center}>
          <Text style={styles.icon}>💬</Text>
          <Text style={styles.count}>{fmt(counts.comments)}</Text>
        </View>
      </Tap>

      <Tap label="Repost" onPress={onRepost}>
        <View style={styles.center}>
          <Text style={styles.icon}>🔁</Text>
          <Text style={styles.count}>{fmt(counts.reposts)}</Text>
        </View>
      </Tap>

      <Tap label="Share" onPress={onShare}>
        <View style={styles.center}>
          <Text style={styles.icon}>✈️</Text>
        </View>
      </Tap>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 12,
    bottom: 22,
    alignItems: "center",
    gap: 14,
  },
  btn: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 44,
    minHeight: 44,
  },
  center: { alignItems: "center", justifyContent: "center" },
  icon: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "800",
    textShadowColor: "#0006",
    textShadowRadius: 8,
  },
  liked: { color: "#ff3355" },
  count: { color: "#fff", fontSize: 12, marginTop: 2, opacity: 0.9 },
});

function areEqual(prev: Props, next: Props) {
  const a = prev.counts;
  const b = next.counts;
  return (
    a.likes === b.likes &&
    a.comments === b.comments &&
    a.reposts === b.reposts &&
    a.liked === b.liked &&
    prev.onLike === next.onLike &&
    prev.onComment === next.onComment &&
    prev.onRepost === next.onRepost &&
    prev.onShare === next.onShare
  );
}

export default memo(SideActionsBase, areEqual);
