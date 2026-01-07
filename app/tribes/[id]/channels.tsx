
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type TribeChannel = {
  id: string;
  tribe_id: string;
  name: string;
  slug: string;
  type: string | null;
  is_private: boolean;
};

export default function TribeChannelsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();

  const [channels, setChannels] = useState<TribeChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"text" | "voice">("text");

  const loadChannels = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tribe_channels")
      .select("*")
      .eq("tribe_id", id)
      .order("created_at", { ascending: true });

    if (!error) {
      setChannels((data || []) as TribeChannel[]);
    }
    setLoading(false);
  };

  const createChannel = async () => {
    if (!newName.trim()) return;

    const cleanName = newName.trim();
    const slug = cleanName.toLowerCase().replace(/\s+/g, "-");

    await supabase.from("tribe_channels").insert({
      tribe_id: id,
      name: cleanName,
      slug,
      type: newType,
      is_private: false,
    });

    setModalVisible(false);
    setNewName("");
    await loadChannels();
  };

  useEffect(() => {
    loadChannels();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>Canais da tribo</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)}>
          <Ionicons name="add-circle-outline" size={26} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList<TribeChannel>
        data={channels}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={loadChannels}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.channelItem, { backgroundColor: theme.colors.surface }]}
            onPress={() => router.push(`/tribes/${id}/channel/${item.id}`)}
          >
            <Ionicons
              name={item.type === "voice" ? "mic-outline" : "chatbubble-ellipses-outline"}
              size={20}
              color={theme.colors.text}
            />
            <Text style={[styles.channelText, { color: theme.colors.text }]}>#{item.slug}</Text>
          </TouchableOpacity>
        )}
      />

      <Modal transparent visible={modalVisible} animationType="fade">
        <View style={styles.modalOuter}>
          <View style={[styles.modalBox, { backgroundColor: theme.colors.surfaceElevated }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Criar canal</Text>

            <TextInput
              style={[styles.input, { backgroundColor: theme.colors.surface, color: theme.colors.text }]}
              placeholder="Nome do canal"
              placeholderTextColor={theme.colors.textMuted}
              value={newName}
              onChangeText={setNewName}
            />

            <View style={styles.typeRow}>
              <TouchableOpacity onPress={() => setNewType("text")} style={styles.typeOption}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={20}
                  color={newType === "text" ? theme.colors.primary : theme.colors.textMuted}
                />
                <Text style={{ color: newType === "text" ? theme.colors.primary : theme.colors.textMuted }}>
                  Texto
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setNewType("voice")} style={styles.typeOption}>
                <Ionicons
                  name="mic-outline"
                  size={20}
                  color={newType === "voice" ? theme.colors.primary : theme.colors.textMuted}
                />
                <Text style={{ color: newType === "voice" ? theme.colors.primary : theme.colors.textMuted }}>
                  Voz
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={{ color: theme.colors.textMuted }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={createChannel}>
                <Text style={{ color: theme.colors.primary, fontWeight: "600" }}>Criar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: "700" },
  channelItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
  },
  channelText: { fontSize: 14, fontWeight: "600" },
  modalOuter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalBox: { width: "100%", borderRadius: 18, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: "700", marginBottom: 10 },
  input: { borderRadius: 14, padding: 12, marginTop: 10, marginBottom: 20 },
  typeRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  typeOption: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalActions: { flexDirection: "row", justifyContent: "space-between" },
});
