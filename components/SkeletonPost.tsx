// components/SkeletonPost.tsx
import Colors from "@/constants/Colors";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

export default function SkeletonPost() {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <View style={styles.card} accessible accessibilityLabel="Loading post">
      <View style={styles.header}>
        <Animated.View style={[styles.avatar, { opacity }]} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Animated.View style={[styles.lineShort, { opacity }]} />
          <Animated.View style={[styles.lineShort, { width: 60, marginTop: 6, opacity }]} />
        </View>
      </View>

      <Animated.View style={[styles.media, { opacity }]} />

      <View style={styles.row}>
        <Animated.View style={[styles.pill, { width: 80, opacity }]} />
        <Animated.View style={[styles.pill, { width: 80, marginLeft: 10, opacity }]} />
        <Animated.View style={[styles.pill, { width: 80, marginLeft: 10, opacity }]} />
      </View>

      <Animated.View
        style={[styles.line, { marginHorizontal: 12, marginBottom: 12, opacity }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginHorizontal: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.border,
  },
  line: {
    height: 10,
    borderRadius: 6,
    backgroundColor: Colors.border,
  },
  lineShort: {
    height: 10,
    width: 100,
    borderRadius: 6,
    backgroundColor: Colors.border,
  },
  media: {
    width: "100%",
    aspectRatio: 4 / 5,
    backgroundColor: Colors.border,
  },
  row: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  pill: {
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.border,
  },
});
