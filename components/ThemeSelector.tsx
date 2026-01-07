import { THEMES, type AppTheme } from "@/constants/themes";
import { useTheme } from "@/contexts/ThemeContext";
import { memo, useMemo } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const FILTERED_THEMES: AppTheme[] = THEMES.filter(
  (t) => t.name === "NebulaFlow" || t.name === "SoftDream"
);

function ThemeChip({ themeData }: { themeData: AppTheme }) {
  const { themeId, setThemeId, theme } = useTheme();
  const selected = themeId === themeData.id;

  return (
    <TouchableOpacity
      style={[
        styles.chip,
        {
          borderColor: selected
            ? themeData.colors.primary
            : "rgba(255,255,255,0.15)",
          backgroundColor: selected
            ? "rgba(255,255,255,0.10)"
            : "rgba(255,255,255,0.04)",
        },
      ]}
      onPress={() => setThemeId(themeData.id)}
      activeOpacity={0.75}
    >
      <View
        style={[styles.dot, { backgroundColor: themeData.colors.primary }]}
      />
      <Text
        style={[
          styles.chipText,
          { color: selected ? themeData.colors.primary : theme.colors.text },
        ]}
      >
        {themeData.name}
      </Text>
    </TouchableOpacity>
  );
}

function ThemeSelector() {
  const { theme } = useTheme();

  const themes = useMemo(
    () => (FILTERED_THEMES.length > 0 ? FILTERED_THEMES : THEMES),
    []
  );

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: theme.colors.text }]}>
        Estilo visual
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      >
        {themes.map((t) => (
          <ThemeChip key={t.id} themeData={t} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    opacity: 0.85,
    marginBottom: 6,
  },
  list: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "500",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 100,
    marginRight: 6,
  },
});

export default memo(ThemeSelector);
