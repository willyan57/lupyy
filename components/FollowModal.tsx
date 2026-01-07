// components/FollowModal.tsx
import { LinearGradient } from "expo-linear-gradient";
import { memo } from "react";
import {
    ActivityIndicator,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

type InterestType = "friend" | "crush" | "silent_crush";
type RelationshipStatus = "single" | "committed" | "other";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (interestType: InterestType) => void;
  relationshipStatus?: RelationshipStatus | null;
  existingInterestType?: InterestType | null;
  loading?: boolean;
};

function FollowModalComponent({
  visible,
  onClose,
  onSelect,
  relationshipStatus,
  existingInterestType,
  loading,
}: Props) {
  const isCrushBlocked = relationshipStatus === "committed";

  const handleSelect = (value: InterestType) => {
    if (loading) return;
    if (value === "crush" && isCrushBlocked) return;
    onSelect(value);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={styles.container}>
          <LinearGradient
            colors={["#6C63FF", "#FF4D6D", "#00D2D3"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradient}
          >
            <Text style={styles.title}>Seguir como</Text>
            <Text style={styles.subtitle}>
              Escolha o tipo de conexão com este perfil.
            </Text>

            <View style={styles.optionsWrapper}>
              <TouchableOpacity
                style={[
                  styles.option,
                  existingInterestType === "friend" && styles.optionActive,
                  loading && styles.optionDisabled,
                ]}
                activeOpacity={0.8}
                onPress={() => handleSelect("friend")}
              >
                <View style={styles.optionLeft}>
                  <Text style={styles.emoji}>👥</Text>
                  <View>
                    <Text style={styles.optionLabel}>Amigo</Text>
                    <Text style={styles.optionDescription}>
                      Conexão leve, amizade e proximidade.
                    </Text>
                  </View>
                </View>
                {existingInterestType === "friend" && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>Atual</Text>
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.option,
                  existingInterestType === "crush" && styles.optionActive,
                  (isCrushBlocked || loading) && styles.optionDisabled,
                ]}
                activeOpacity={isCrushBlocked ? 1 : 0.8}
                onPress={() => handleSelect("crush")}
              >
                <View style={styles.optionLeft}>
                  <Text style={styles.emoji}>❤️</Text>
                  <View>
                    <Text
                      style={[
                        styles.optionLabel,
                        isCrushBlocked && styles.optionLabelMuted,
                      ]}
                    >
                      Crush
                    </Text>
                    <Text
                      style={[
                        styles.optionDescription,
                        isCrushBlocked && styles.optionDescriptionMuted,
                      ]}
                    >
                      Mostra que você está interessado romanticamente.
                    </Text>
                    {isCrushBlocked && (
                      <Text style={styles.blockedText}>
                        Esse coração já tem dono 😅
                      </Text>
                    )}
                  </View>
                </View>
                {existingInterestType === "crush" && !isCrushBlocked && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>Atual</Text>
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.option,
                  existingInterestType === "silent_crush" &&
                    styles.optionActive,
                  loading && styles.optionDisabled,
                ]}
                activeOpacity={0.8}
                onPress={() => handleSelect("silent_crush")}
              >
                <View style={styles.optionLeft}>
                  <Text style={styles.emoji}>🤐</Text>
                  <View>
                    <Text style={styles.optionLabel}>Crush silencioso</Text>
                    <Text style={styles.optionDescription}>
                      Só você vê. Se o interesse for mútuo, a gente avisa.
                    </Text>
                  </View>
                </View>
                {existingInterestType === "silent_crush" && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>Atual</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.footer}>
              {loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.loadingText}>Salvando escolha...</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.closeButton}
                  activeOpacity={0.8}
                  onPress={onClose}
                >
                  <Text style={styles.closeText}>Cancelar</Text>
                </TouchableOpacity>
              )}
            </View>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "#000000AA",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    width: "88%",
    maxWidth: 420,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#050509",
  },
  gradient: {
    paddingHorizontal: 1,
    paddingVertical: 1,
    borderRadius: 28,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    paddingTop: 18,
  },
  subtitle: {
    fontSize: 13,
    color: "#E5E5F0",
    textAlign: "center",
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 14,
  },
  optionsWrapper: {
    backgroundColor: "#050509",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    marginHorizontal: 2,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 18,
    marginBottom: 6,
  },
  optionActive: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  optionDisabled: {
    opacity: 0.6,
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  emoji: {
    fontSize: 24,
    marginRight: 6,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  optionLabelMuted: {
    color: "#D0D0DD",
  },
  optionDescription: {
    fontSize: 12,
    color: "#CACADF",
    marginTop: 2,
    maxWidth: 240,
  },
  optionDescriptionMuted: {
    color: "#A6A6BF",
  },
  blockedText: {
    fontSize: 11,
    color: "#FFD6E0",
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  badgeText: {
    fontSize: 11,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  footer: {
    paddingHorizontal: 18,
    paddingBottom: 16,
    paddingTop: 4,
    backgroundColor: "#050509",
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  closeButton: {
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
  },
  closeText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "500",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: {
    color: "#FFFFFF",
    fontSize: 13,
  },
});

const FollowModal = memo(FollowModalComponent);

export default FollowModal;
