import { supabase } from "@/lib/supabase";
import { Image as ExpoImage } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type Mode = "followers" | "following" | "interested";

type PeopleListSheetProps = {
  visible: boolean;
  mode: Mode;
  profileId: string;
  isOwnProfile: boolean;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
};

type PersonRow = {
  follow_id: string;
  profile_id: string;
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  interest_type: string | null;
  created_at: string;
};

function getTitle(mode: Mode, isOwnProfile: boolean) {
  if (mode === "followers") {
    return isOwnProfile ? "Quem segue você" : "Seguidores";
  }
  if (mode === "following") {
    return isOwnProfile ? "Quem você segue" : "Seguindo";
  }
  if (mode === "interested") {
    return isOwnProfile ? "Interessados em você" : "Interessados";
  }
  return "";
}

function getEmptyText(mode: Mode, isOwnProfile: boolean) {
  if (mode === "followers") {
    return isOwnProfile
      ? "Ninguém segue você ainda."
      : "Esse perfil ainda não tem seguidores.";
  }
  if (mode === "following") {
    return isOwnProfile
      ? "Você ainda não está seguindo ninguém."
      : "Esse perfil ainda não segue ninguém.";
  }
  if (mode === "interested") {
    return isOwnProfile
      ? "Ainda não teve nenhum crush aqui."
      : "Ainda não há interessados por aqui.";
  }
  return "";
}

export default function PeopleListSheet(props: PeopleListSheetProps) {
  const { visible, mode, profileId, isOwnProfile, onClose, onOpenProfile } =
    props;

  const [data, setData] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(
    () => getTitle(mode, isOwnProfile),
    [mode, isOwnProfile]
  );

  useEffect(() => {
    let isCancelled = false;

    async function load() {
      if (!visible || !profileId) {
        setData([]);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      let viewName = "";
      if (mode === "followers") {
        viewName = "view_followers_detailed";
      } else if (mode === "following") {
        viewName = "view_following_detailed";
      } else if (mode === "interested") {
        viewName = "view_crush_detailed";
      }

      const { data, error } = await supabase
  .from(viewName)
  .select("*")
  .eq("profile_id", profileId)
  .order("created_at", { ascending: false });

if (isCancelled) {
  return;
}

if (error) {
  setError(error.message);
  setData([]);
} else {
  const rows = (data ?? []) as PersonRow[];
  setData(rows);
}

setLoading(false);

      if (isCancelled) {
        return;
      }

      if (error) {
        setError(error.message);
        setData([]);
      } else {
        setData(data ?? []);
      }

      setLoading(false);
    }

    load();

    return () => {
      isCancelled = true;
    };
  }, [visible, mode, profileId]);

  function renderItem({ item }: { item: PersonRow }) {
    const displayName =
      item.full_name?.trim() ||
      item.username?.trim() ||
      "Usuário do Lupyy";
    const username =
      item.username && item.username.trim().length > 0
        ? "@" + item.username
        : "";
    const showCrushBadge =
      mode === "interested" && item.interest_type === "crush";

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => onOpenProfile(item.user_id)}
      >
        <View style={styles.avatarWrapper}>
          {item.avatar_url ? (
            <ExpoImage
              source={{ uri: item.avatar_url }}
              style={styles.avatar}
            />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>
          {username ? (
            <Text style={styles.username} numberOfLines={1}>
              {username}
            </Text>
          ) : null}
        </View>

        {showCrushBadge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Crush 💘</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  }

  const showEmptyState = !loading && !error && data.length === 0;

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.bottomSheetContainer}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>

          {loading && (
            <View style={styles.center}>
              <ActivityIndicator />
            </View>
          )}

          {error && !loading && (
            <View style={styles.center}>
              <Text style={styles.errorText}>
                Não foi possível carregar a lista.
              </Text>
            </View>
          )}

          {showEmptyState && (
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                {getEmptyText(mode, isOwnProfile)}
              </Text>
            </View>
          )}

          {!loading && !error && data.length > 0 && (
            <FlatList
              data={data}
              keyExtractor={(item) => item.follow_id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
            />
          )}

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Fechar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  bottomSheetContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  sheet: {
    backgroundColor: "rgba(11,11,15,0.98)",
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "rgba(255,255,255,0.95)",
    textAlign: "center",
    marginBottom: 8,
  },
  center: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: "rgba(255,120,120,0.9)",
    fontSize: 13,
    textAlign: "center",
  },
  emptyText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  listContent: {
    paddingVertical: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  avatarWrapper: {
    marginRight: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 999,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "rgba(120,120,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 18,
    fontWeight: "600",
  },
  info: {
    flex: 1,
    paddingRight: 8,
  },
  name: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 14,
    fontWeight: "500",
  },
  username: {
    color: "rgba(200,200,255,0.7)",
    fontSize: 12,
    marginTop: 1,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,128,192,0.18)",
  },
  badgeText: {
    color: "rgba(255,180,220,0.95)",
    fontSize: 11,
    fontWeight: "500",
  },
  closeButton: {
    marginTop: 8,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  closeButtonText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
  },
});
