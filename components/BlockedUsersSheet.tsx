/**
 * BlockedUsersSheet — Lista de usuários bloqueados com opção de desbloquear.
 *
 * Acessado via Configurações > Privacidade > Contas bloqueadas.
 * Estilo Instagram: lista com avatar, username e botão desbloquear.
 */

import { useTheme } from "@/contexts/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";

import { BlockedUser, getBlockedUsers, unblockUser } from "@/lib/moderation";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function BlockedUsersSheet({ visible, onClose }: Props) {
  const { theme } = useTheme();

  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getBlockedUsers();
    setUsers(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const handleUnblock = (user: BlockedUser) => {
    Alert.alert(
      "Desbloquear",
      `Desbloquear @${user.username ?? "usuário"}? Essa pessoa poderá ver seu perfil e enviar mensagens novamente.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Desbloquear",
          style: "destructive",
          onPress: async () => {
            setUnblocking(user.blocked_id);
            const result = await unblockUser(user.blocked_id);
            setUnblocking(null);

            if (result.ok) {
              setUsers((prev) => prev.filter((u) => u.blocked_id !== user.blocked_id));
            } else {
              Alert.alert("Erro", "Não foi possível desbloquear.");
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: BlockedUser }) => {
    const isUnblocking = unblocking === item.blocked_id;
    const avatarUri = item.avatar_url;

    return (
      <View style={[styles.row, { borderBottomColor: theme.colors.border }]}>
        <View style={styles.rowLeft}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: theme.colors.surface }]}>
              <Ionicons name="person" size={20} color={theme.colors.textMuted} />
            </View>
          )}
          <View style={styles.info}>
            <Text style={[styles.username, { color: theme.colors.text }]} numberOfLines={1}>
              @{item.username ?? "usuário"}
            </Text>
            {item.full_name && (
              <Text style={[styles.fullName, { color: theme.colors.textMuted }]} numberOfLines={1}>
                {item.full_name}
              </Text>
            )}
          </View>
        </View>

        <Pressable
          style={[styles.unblockBtn, { borderColor: theme.colors.border }]}
          onPress={() => handleUnblock(item)}
          disabled={isUnblocking}
        >
          {isUnblocking ? (
            <ActivityIndicator size="small" color={theme.colors.text} />
          ) : (
            <Text style={[styles.unblockText, { color: theme.colors.text }]}>
              Desbloquear
            </Text>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            Contas bloqueadas
          </Text>
          <View style={{ width: 24 }} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : users.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="shield-checkmark-outline" size={56} color={theme.colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
              Nenhuma conta bloqueada
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.colors.textMuted }]}>
              Quando você bloquear alguém, a pessoa aparecerá aqui.
            </Text>
          </View>
        ) : (
          <FlatList
            data={users}
            keyExtractor={(item) => item.block_id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 10 : 0,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  info: {
    marginLeft: 12,
    flex: 1,
  },
  username: {
    fontSize: 15,
    fontWeight: "600",
  },
  fullName: {
    fontSize: 13,
    marginTop: 2,
  },
  unblockBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  unblockText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
