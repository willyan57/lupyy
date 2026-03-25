
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

type TribeChannel = {
  id: string;
  tribe_id: string;
  name: string;
  slug: string;
  type: string | null;
  is_private: boolean;
  created_at: string;
};

export default function TribeChannelsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

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

    if (!error) setChannels((data || []) as TribeChannel[]);
    setLoading(false);
  };

  const createChannel = async () => {
    if (!newName.trim()) return;
    const cleanName = newName.trim();
    const slug = cleanName.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");

    await supabase.from("tribe_channels").insert({
      tribe_id: id,
      name: cleanName,
      slug: slug || "canal",
      type: newType,
      is_private: false,
    });

    setModalVisible(false);
    setNewName("");
    setNewType("text");
    await loadChannels();
  };

  useEffect(() => { loadChannels(); }, []);

  const textChannels = channels.filter(c => c.type !== "voice");
  const voiceChannels = channels.filter(c => c.type === "voice");

  const renderChannel = (item: TribeChannel) => {
    const isVoice = item.type === "voice";
    return (
      <TouchableOpacity
        key={item.id}
        activeOpacity={0.85}
        onPress={() => isVoice ? undefined : router.push(`/tribes/${id}/channel/${item.id}` as any)}
        style={[s.channelItem, { backgroundColor: theme.colors.surfaceElevated }, Platform.OS === "web" ? { cursor: isVoice ? "default" : "pointer" } as any : null]}
      >
        <View style={[s.channelIcon, { backgroundColor: isVoice ? theme.colors.primary + "18" : theme.colors.surface }]}>
          <Ionicons
            name={isVoice ? "mic-outline" : "chatbubble-ellipses-outline"}
            size={18}
            color={isVoice ? theme.colors.primary : theme.colors.text}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.channelName, { color: theme.colors.text }]}>#{item.slug}</Text>
          <Text style={[s.channelType, { color: theme.colors.textMuted }]}>
            {isVoice ? "Canal de voz" : "Canal de texto"}
          </Text>
        </View>
        {isVoice ? (
          <View style={[s.badge, { backgroundColor: theme.colors.primary + "18" }]}>
            <Text style={[s.badgeText, { color: theme.colors.primary }]}>EM BREVE</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[s.header, { borderColor: theme.colors.border }]}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[s.title, { color: theme.colors.text }]}>Canais da tribo</Text>
        <TouchableOpacity activeOpacity={0.85} onPress={() => setModalVisible(true)} style={[s.addBtn, { backgroundColor: theme.colors.primary }]}>
          <Ionicons name="add" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator /></View>
      ) : channels.length === 0 ? (
        <View style={[s.emptyCard, { backgroundColor: theme.colors.surfaceElevated }]}>
          <Ionicons name="chatbubbles-outline" size={32} color={theme.colors.textMuted} />
          <Text style={[s.emptyTitle, { color: theme.colors.text }]}>Nenhum canal criado</Text>
          <Text style={[s.emptyText, { color: theme.colors.textMuted }]}>Crie o primeiro canal para a tribo começar a conversar.</Text>
        </View>
      ) : (
        <FlatList
          data={[]}
          renderItem={() => null}
          ListHeaderComponent={
            <View style={{ paddingHorizontal: 16, paddingBottom: 20 }}>
              {textChannels.length > 0 && (
                <>
                  <Text style={[s.sectionLabel, { color: theme.colors.textMuted }]}>CANAIS DE TEXTO — {textChannels.length}</Text>
                  {textChannels.map(renderChannel)}
                </>
              )}
              {voiceChannels.length > 0 && (
                <>
                  <Text style={[s.sectionLabel, { color: theme.colors.textMuted, marginTop: 16 }]}>CANAIS DE VOZ — {voiceChannels.length}</Text>
                  {voiceChannels.map(renderChannel)}
                </>
              )}
            </View>
          }
          refreshing={loading}
          onRefresh={loadChannels}
        />
      )}

      {/* Create channel modal */}
      <Modal transparent visible={modalVisible} animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={s.modalOverlay}>
          <TouchableOpacity activeOpacity={1} onPress={() => setModalVisible(false)} style={StyleSheet.absoluteFill} />
          <View style={[s.modalCard, { backgroundColor: theme.colors.surfaceElevated }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: theme.colors.text }]}>Criar canal</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={20} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Type selector */}
            <View style={s.typeRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setNewType("text")}
                style={[s.typeOption, { backgroundColor: newType === "text" ? theme.colors.primary : theme.colors.surface }]}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={newType === "text" ? "#fff" : theme.colors.textMuted} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: newType === "text" ? "#fff" : theme.colors.textMuted }}>Texto</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setNewType("voice")}
                style={[s.typeOption, { backgroundColor: newType === "voice" ? theme.colors.primary : theme.colors.surface }]}
              >
                <Ionicons name="mic-outline" size={18} color={newType === "voice" ? "#fff" : theme.colors.textMuted} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: newType === "voice" ? "#fff" : theme.colors.textMuted }}>Voz</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={[s.modalInput, { backgroundColor: theme.colors.surface, color: theme.colors.text, borderColor: theme.colors.border }]}
              placeholder={newType === "voice" ? "Nome da sala (ex: Reuniões)" : "Nome do canal (ex: Projetos)"}
              placeholderTextColor={theme.colors.textMuted}
              value={newName}
              onChangeText={setNewName}
            />

            {newType === "voice" && (
              <View style={[s.voiceInfo, { backgroundColor: theme.colors.primary + "12", borderColor: theme.colors.primary + "30" }]}>
                <Ionicons name="information-circle-outline" size={16} color={theme.colors.primary} />
                <Text style={{ fontSize: 12, color: theme.colors.primary, flex: 1, lineHeight: 17 }}>
                  Salas de voz permitem que membros conversem em tempo real.
                </Text>
              </View>
            )}

            <View style={{ gap: 8, marginTop: 14 }}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={createChannel}
                disabled={!newName.trim().length}
                style={[s.primaryBtn, { backgroundColor: !newName.trim().length ? theme.colors.surface : theme.colors.primary }]}
              >
                <Ionicons name={newType === "voice" ? "mic" : "add-circle"} size={16} color="#fff" />
                <Text style={s.primaryBtnText}>Criar {newType === "voice" ? "sala de voz" : "canal"}</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.85} onPress={() => setModalVisible(false)} style={[s.secondaryBtn, { backgroundColor: theme.colors.surface }]}>
                <Text style={[s.secondaryBtnText, { color: theme.colors.textMuted }]}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800" },
  addBtn: { width: 34, height: 34, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyCard: { margin: 16, borderRadius: 18, padding: 24, alignItems: "center", gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: "700" },
  emptyText: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1, marginBottom: 8, marginTop: 12 },
  channelItem: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, marginBottom: 6 },
  channelIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  channelName: { fontSize: 14, fontWeight: "700" },
  channelType: { fontSize: 11, marginTop: 1 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 16 },
  modalCard: { width: "100%", maxWidth: 440, borderRadius: 20, padding: 20 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  modalTitle: { fontSize: 17, fontWeight: "800" },
  modalInput: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1, marginTop: 10 },
  typeRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  typeOption: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 10 },
  voiceInfo: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginTop: 10 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 14, paddingVertical: 12 },
  primaryBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  secondaryBtn: { borderRadius: 14, paddingVertical: 12, alignItems: "center" },
  secondaryBtnText: { fontSize: 14, fontWeight: "600" },
});
