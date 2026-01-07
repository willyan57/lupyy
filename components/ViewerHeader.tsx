// components/ViewerHeader.tsx
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  title?: string;
  onBack?: () => void;
};

function ViewerHeader({ title = "Reels", onBack }: Props) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar}>
        <Pressable
          onPress={onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          style={styles.backBtn}
        >
          <Text style={styles.back}>←</Text>
        </Pressable>

        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>

        <View style={styles.spacer} />

        <Text style={styles.friends} numberOfLines={1}>
          Amigos ●●●
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 10,
    left: 12,
    right: 12,
    zIndex: 10,
  },
  bar: {
    height: 48,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.25)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  backBtn: { paddingVertical: 6, paddingRight: 8 },
  back: { color: "#fff", fontSize: 24, marginRight: 6 },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    textShadowColor: "#0006",
    textShadowRadius: 8,
  },
  spacer: { flex: 1 },
  friends: { color: "#fff", opacity: 0.9 },
});

export default memo(ViewerHeader);
