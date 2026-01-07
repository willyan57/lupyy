
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type TribeChannel = {
  id: string;
  tribe_id: string;
  name: string;
  slug: string;
  type: string | null;
  is_private: boolean;
};

type TribeMessage = {
  id: string;
  tribe_id: string;
  channel_id: string;
  user_id: string;
  text: string | null;
  created_at: string;
};

export default function ChannelScreen() {
  const { id, channelId } = useLocalSearchParams<{ id: string; channelId: string }>();
  const router = useRouter();
  const { theme } = useTheme();

  const [channel, setChannel] = useState<TribeChannel | null>(null);
  const [messages, setMessages] = useState<TribeMessage[]>([]);
  const [text, setText] = useState("");

  const loadChannelInfo = async () => {
    const { data, error } = await supabase
      .from("tribe_channels")
      .select("*")
      .eq("id", channelId)
      .single();

    if (!error) {
      setChannel((data || null) as TribeChannel | null);
    }
  };

  const loadMessages = async () => {
    const { data, error } = await supabase
      .from("tribe_messages")
      .select("*")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true });

    if (!error) {
      setMessages((data || []) as TribeMessage[]);
    }
  };

  const sendMessage = async () => {
    if (!text.trim()) return;

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) return;

    await supabase.from("tribe_messages").insert({
      tribe_id: id,
      channel_id: channelId,
      user_id: authData.user.id,
      text: text.trim(),
    });

    setText("");
    await loadMessages();
  };

  useEffect(() => {
    loadChannelInfo();
    loadMessages();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          # {channel?.slug ?? "canal"}
        </Text>
      </View>

      <FlatList<TribeMessage>
        data={messages}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        renderItem={({ item }) => (
          <View style={styles.messageRow}>
            <Text style={[styles.messageUser, { color: theme.colors.primary }]}>
              {item.user_id}
            </Text>
            <Text style={[styles.messageText, { color: theme.colors.text }]}>
              {item.text}
            </Text>
          </View>
        )}
      />

      <View style={[styles.inputRow, { backgroundColor: theme.colors.surface }]}>
        <TextInput
          style={[styles.input, { color: theme.colors.text }]}
          placeholder="Escreva uma mensagem..."
          placeholderTextColor={theme.colors.textMuted}
          value={text}
          onChangeText={setText}
        />
        <TouchableOpacity onPress={sendMessage}>
          <Ionicons name="send" size={22} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16 },
  title: { fontSize: 16, fontWeight: "700" },
  messageRow: { padding: 10, flexDirection: "row", gap: 8 },
  messageUser: { fontSize: 12, fontWeight: "700" },
  messageText: { fontSize: 14 },
  inputRow: { flexDirection: "row", alignItems: "center", padding: 10 },
  input: { flex: 1, marginRight: 10 },
});
