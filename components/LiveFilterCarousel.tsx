// components/LiveFilterCarousel.tsx — Instagram-style filter carousel for camera screen
// Shows filter thumbnails at the bottom that can be swiped to change the live CSS filter

import { useCallback, useRef, useState } from "react";
import {
    Animated,
    Dimensions,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";

const { width: W } = Dimensions.get("window");
const ITEM_W = 72;

export type LiveFilterDef = {
  id: string;
  name: string;
  cssFilter: string;
  accent: string;
};

export const LIVE_FILTERS: LiveFilterDef[] = [
  { id: "none", name: "Normal", cssFilter: "none", accent: "transparent" },
  { id: "clarendon", name: "Clarendon", cssFilter: "contrast(1.2) saturate(1.35)", accent: "#4A90D9" },
  { id: "gingham", name: "Gingham", cssFilter: "brightness(1.05) hue-rotate(-10deg) saturate(0.8)", accent: "#E8D5C4" },
  { id: "moon", name: "Moon", cssFilter: "grayscale(1) contrast(1.1) brightness(1.1)", accent: "#888888" },
  { id: "lark", name: "Lark", cssFilter: "contrast(0.9) brightness(1.1) saturate(1.1)", accent: "#C4E8D5" },
  { id: "reyes", name: "Reyes", cssFilter: "sepia(0.22) brightness(1.1) contrast(0.85) saturate(0.75)", accent: "#F0D8C4" },
  { id: "juno", name: "Juno", cssFilter: "contrast(1.15) saturate(1.8) sepia(0.05)", accent: "#FFD4A0" },
  { id: "slumber", name: "Slumber", cssFilter: "saturate(0.66) brightness(1.05) sepia(0.12)", accent: "#A0B4C8" },
  { id: "crema", name: "Crema", cssFilter: "sepia(0.3) contrast(0.9) brightness(1.05) saturate(0.8)", accent: "#F5DCC0" },
  { id: "ludwig", name: "Ludwig", cssFilter: "contrast(1.05) saturate(0.9) brightness(1.02)", accent: "#D4C4A0" },
  { id: "aden", name: "Aden", cssFilter: "hue-rotate(-20deg) contrast(0.9) saturate(0.85) brightness(1.2)", accent: "#FFE4C8" },
  { id: "perpetua", name: "Perpetua", cssFilter: "contrast(1.1) brightness(1.1) saturate(1.1) hue-rotate(5deg)", accent: "#7BC8A4" },
  { id: "amaro", name: "Amaro", cssFilter: "brightness(1.1) contrast(0.9) saturate(1.5) hue-rotate(-10deg)", accent: "#E8C4D5" },
  { id: "mayfair", name: "Mayfair", cssFilter: "contrast(1.1) saturate(1.1) brightness(1.05) sepia(0.05)", accent: "#FFD0E0" },
  { id: "rise", name: "Rise", cssFilter: "brightness(1.05) sepia(0.08) contrast(0.9) saturate(0.9)", accent: "#FFE8C0" },
  { id: "hudson", name: "Hudson", cssFilter: "brightness(1.1) contrast(0.9) saturate(0.85) hue-rotate(10deg)", accent: "#A0C8E0" },
  { id: "valencia", name: "Valencia", cssFilter: "contrast(1.08) brightness(1.08) sepia(0.08) saturate(1.2)", accent: "#FFB088" },
  { id: "xpro2", name: "X-Pro II", cssFilter: "sepia(0.3) contrast(1.35) brightness(0.9) saturate(1.3)", accent: "#FF8844" },
  { id: "sierra", name: "Sierra", cssFilter: "contrast(0.85) saturate(0.75) brightness(1.05) sepia(0.15)", accent: "#E0D0B8" },
  { id: "willow", name: "Willow", cssFilter: "grayscale(0.5) contrast(0.95) brightness(0.9)", accent: "#B0B0A0" },
  { id: "lo_fi", name: "Lo-Fi", cssFilter: "contrast(1.5) saturate(1.1) brightness(0.95)", accent: "#FF5050" },
  { id: "earlybird", name: "Earlybird", cssFilter: "contrast(0.9) sepia(0.2) brightness(1.05) saturate(1.15) hue-rotate(-5deg)", accent: "#FFD480" },
  { id: "brannan", name: "Brannan", cssFilter: "sepia(0.5) contrast(1.4) brightness(0.9)", accent: "#C8A060" },
  { id: "inkwell", name: "Inkwell", cssFilter: "sepia(0.3) contrast(1.1) brightness(1.1) saturate(0) grayscale(1)", accent: "#666666" },
  { id: "nashville", name: "Nashville", cssFilter: "sepia(0.2) contrast(1.2) brightness(1.05) saturate(1.2) hue-rotate(-5deg)", accent: "#FF9EBB" },
];

export function getLiveFilterById(id: string | undefined): LiveFilterDef | undefined {
  if (id == null || id === "") return undefined;
  return LIVE_FILTERS.find((f) => f.id === id);
}

type LiveFilterCarouselProps = {
  activeFilter: string;
  onFilterChange: (filter: LiveFilterDef) => void;
};

export default function LiveFilterCarousel({ activeFilter, onFilterChange }: LiveFilterCarouselProps) {
  const listRef = useRef<any>(null);
  const labelOpacity = useRef(new Animated.Value(0)).current;
  const labelScale = useRef(new Animated.Value(0.9)).current;
  const [labelText, setLabelText] = useState("");
  const hideLabelRef = useRef<any>(null);

  const showLabel = useCallback((name: string) => {
    setLabelText(name);
    if (hideLabelRef.current) clearTimeout(hideLabelRef.current);
    labelOpacity.setValue(0);
    labelScale.setValue(0.9);
    Animated.parallel([
      Animated.timing(labelOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.spring(labelScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 0 }),
    ]).start();
    hideLabelRef.current = setTimeout(() => {
      Animated.timing(labelOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }, 1000);
  }, []);

  const handleSelect = useCallback((f: LiveFilterDef) => {
    onFilterChange(f);
    showLabel(f.name);
  }, [onFilterChange, showLabel]);

  const renderItem = useCallback(({ item }: { item: LiveFilterDef }) => {
    const isActive = item.id === activeFilter;
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => handleSelect(item)}
        style={styles.filterItem}
      >
        <View style={[
          styles.filterThumb,
          { backgroundColor: item.accent || "rgba(255,255,255,0.15)" },
          isActive && styles.filterThumbActive,
        ]}>
          {item.id === "none" && <Text style={styles.filterThumbIcon}>⊘</Text>}
        </View>
        <Text style={[styles.filterName, isActive && styles.filterNameActive]} numberOfLines={1}>
          {item.name}
        </Text>
      </TouchableOpacity>
    );
  }, [activeFilter, handleSelect]);

  return (
    <View style={styles.container}>
      {/* Filter name label */}
      <Animated.View style={[styles.label, { opacity: labelOpacity, transform: [{ scale: labelScale }] }]}>
        <Text style={styles.labelText}>{labelText}</Text>
      </Animated.View>

      <FlatList
        ref={listRef}
        data={LIVE_FILTERS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        snapToInterval={ITEM_W}
        decelerationRate="fast"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  label: {
    position: "absolute",
    top: -40,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.6)",
    zIndex: 10,
  },
  labelText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  listContent: {
    paddingHorizontal: 12,
    gap: 4,
  },
  filterItem: {
    width: ITEM_W,
    alignItems: "center",
    paddingVertical: 6,
  },
  filterThumb: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  filterThumbActive: {
    borderColor: "#fff",
    borderWidth: 3,
  },
  filterThumbIcon: {
    color: "#fff",
    fontSize: 18,
  },
  filterName: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  filterNameActive: {
    color: "#fff",
    fontWeight: "800",
  },
});
