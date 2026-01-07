import Colors from "@/constants/Colors";
import { supabase } from "@/lib/supabase";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Profile = {
  id: string;
  username: string | null;
  bio?: string | null;
};

export default function UserProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userId = params.id;

  useEffect(() => {
    let active = true;

    if (!userId) {
      setError("Usuário não encontrado.");
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);

      const { data, error: qErr } = await supabase
        .from("profiles")
        .select("id, username, bio")
        .eq("id", userId)
        .single();

      if (!active) return;

      if (qErr) {
        setError(qErr.message ?? "Erro ao carregar perfil.");
      } else {
        setProfile(data as Profile);
      }

      setLoading(false);
    };

    load();

    return () => {
      active = false;
    };
  }, [userId]);

  const title = profile?.username || "Usuário";

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : !profile ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Perfil não encontrado.</Text>
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.avatar} />
          <Text style={styles.username}>{profile.username || "Usuário"}</Text>
          {profile.bio ? (
            <Text style={styles.bio}>{profile.bio}</Text>
          ) : (
            <Text style={styles.bioPlaceholder}>
              Nenhuma bio adicionada ainda.
            </Text>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: {
    color: Colors.text,
    fontSize: 22,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: "#ff6b6b",
    fontSize: 14,
  },
  content: {
    alignItems: "center",
    paddingTop: 32,
    paddingHorizontal: 20,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.border,
    marginBottom: 16,
  },
  username: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  bio: {
    color: Colors.text,
    fontSize: 14,
    textAlign: "center",
  },
  bioPlaceholder: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: "center",
  },
});
