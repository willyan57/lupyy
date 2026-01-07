import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";
import { Href, useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type Profile = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

export default function SearchScreen() {
  const { theme } = useTheme();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  const swipeThreshold = 60;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        const { dx, dy } = gestureState;
        return Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10;
      },
      onPanResponderRelease: (_evt, gestureState) => {
        const { dx } = gestureState;
        if (dx > swipeThreshold) {
          if (Platform.OS !== "web") {
            router.replace("/conversations");
          }
        } else if (dx < -swipeThreshold) {
          if (Platform.OS !== "web") {
            router.replace("/profile");
          }
        }
      },
    })
  ).current;

  async function handleSearch(text: string) {
    setQuery(text);

    const value = text.trim();

    if (value.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url")
      .ilike("username", `%${value}%`)
      .limit(30);

    if (!error && data) {
      setResults(data as Profile[]);
    } else {
      setResults([]);
    }

    setLoading(false);
  }

  function openProfile(profileId: string) {
    Keyboard.dismiss();

    const href = {
      pathname: "/profile",
      params: {
        userId: profileId,
        profileId: profileId,
        id: profileId,
      },
    } as Href;

    router.push(href);
  }

  return (
    <View
      {...(Platform.OS !== "web" ? (panResponder as any).panHandlers : {})}
      style={[
        styles.container,
        { backgroundColor: theme.colors.background },
      ]}
    >
      <View
        style={[
          styles.searchBox,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <TextInput
          value={query}
          onChangeText={handleSearch}
          placeholder="Buscar por @username"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, { color: theme.colors.text }]}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      )}

      {!loading && results.length === 0 && query.trim().length >= 2 && (
        <View style={styles.empty}>
          <Text style={{ color: theme.colors.textMuted }}>
            Nenhum usuário encontrado.
          </Text>
        </View>
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openProfile(item.id)}
            style={({ pressed }) => [
              styles.item,
              {
                backgroundColor: pressed
                  ? theme.colors.surface
                  : "transparent",
                borderColor: theme.colors.border,
              },
            ]}
          >
            <View style={styles.itemTextWrapper}>
              <Text style={[styles.username, { color: theme.colors.text }]}>
                {item.username ? `@${item.username}` : "Usuário sem username"}
              </Text>
              {item.full_name && (
                <Text
                  style={[styles.fullName, { color: theme.colors.textMuted }]}
                >
                  {item.full_name}
                </Text>
              )}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Platform.OS === "web" ? 24 : 12,
    paddingTop: 12,
  },
  searchBox: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    marginBottom: 12,
  },
  input: {
    fontSize: 16,
  },
  loading: {
    paddingVertical: 16,
  },
  empty: {
    paddingVertical: 16,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  itemTextWrapper: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: "600",
  },
  fullName: {
    marginTop: 2,
    fontSize: 14,
  },
});
