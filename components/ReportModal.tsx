/**
 * ReportModal — Modal de denúncia estilo Instagram.
 *
 * Mostra lista de motivos, campo opcional de descrição,
 * e submete via RPC. Pode denunciar usuário, post, comentário ou story.
 */

import { useTheme } from "@/contexts/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import {
    REPORT_REASONS,
    ReportReason,
    reportContent,
} from "@/lib/moderation";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** ID do usuário sendo denunciado */
  targetUserId: string;
  /** Contexto opcional */
  postId?: number;
  commentId?: number;
  storyId?: number;
  /** Callback após denúncia bem-sucedida */
  onReported?: () => void;
};

export default function ReportModal({
  visible,
  onClose,
  targetUserId,
  postId,
  commentId,
  storyId,
  onReported,
}: Props) {
  const { theme } = useTheme();

  const [step, setStep] = useState<"reason" | "detail" | "done">("reason");
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setStep("reason");
    setSelectedReason(null);
    setDescription("");
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSelectReason = (reason: ReportReason) => {
    setSelectedReason(reason);
    setStep("detail");
  };

  const handleSubmit = async () => {
    if (!selectedReason) return;
    setLoading(true);

    const result = await reportContent({
      reportedUserId: targetUserId,
      reason: selectedReason,
      description: description.trim() || undefined,
      postId,
      commentId,
      storyId,
    });

    setLoading(false);

    if (result.ok) {
      setStep("done");
      onReported?.();
    } else {
      if (result.error?.includes("Already reported")) {
        Alert.alert("Aviso", "Você já denunciou este conteúdo recentemente.");
      } else {
        Alert.alert("Erro", "Não foi possível enviar a denúncia. Tente novamente.");
      }
    }
  };

  const renderReasonStep = () => (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
      <Text style={[styles.title, { color: theme.colors.text }]}>
        Por que você está denunciando?
      </Text>
      <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
        Sua denúncia é anônima. Se alguém estiver em perigo imediato,
        ligue para os serviços de emergência.
      </Text>

      {REPORT_REASONS.map((r) => (
        <Pressable
          key={r.key}
          style={[styles.reasonRow, { borderBottomColor: theme.colors.border }]}
          onPress={() => handleSelectReason(r.key)}
        >
          <Ionicons
            name={r.icon as any}
            size={22}
            color={theme.colors.textMuted}
            style={{ marginRight: 14 }}
          />
          <Text style={[styles.reasonText, { color: theme.colors.text }]}>
            {r.label}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={theme.colors.textMuted}
          />
        </Pressable>
      ))}
    </ScrollView>
  );

  const renderDetailStep = () => {
    const reasonLabel = REPORT_REASONS.find((r) => r.key === selectedReason)?.label;

    return (
      <View style={{ flex: 1 }}>
        <Pressable onPress={() => setStep("reason")} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>

        <Text style={[styles.title, { color: theme.colors.text }]}>
          {reasonLabel}
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
          Adicione mais detalhes (opcional)
        </Text>

        <TextInput
          style={[
            styles.input,
            {
              color: theme.colors.text,
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
          placeholder="Descreva o que aconteceu..."
          placeholderTextColor={theme.colors.textMuted}
          multiline
          maxLength={500}
          value={description}
          onChangeText={setDescription}
        />

        <Text style={[styles.charCount, { color: theme.colors.textMuted }]}>
          {description.length}/500
        </Text>

        <Pressable
          style={[styles.submitBtn, loading && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitBtnText}>Enviar denúncia</Text>
          )}
        </Pressable>
      </View>
    );
  };

  const renderDoneStep = () => (
    <View style={styles.doneContainer}>
      <View style={[styles.doneIcon, { backgroundColor: theme.colors.primary + "20" }]}>
        <Ionicons name="checkmark-circle" size={56} color={theme.colors.primary} />
      </View>
      <Text style={[styles.doneTitle, { color: theme.colors.text }]}>
        Obrigado por denunciar
      </Text>
      <Text style={[styles.doneSubtitle, { color: theme.colors.textMuted }]}>
        Sua denúncia nos ajuda a manter a comunidade segura.
        Vamos analisar e tomar as medidas necessárias.
      </Text>
      <Pressable style={styles.doneBtn} onPress={handleClose}>
        <Text style={styles.doneBtnText}>Fechar</Text>
      </Pressable>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            Denunciar
          </Text>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={theme.colors.text} />
          </Pressable>
        </View>

        <View style={styles.body}>
          {step === "reason" && renderReasonStep()}
          {step === "detail" && renderDetailStep()}
          {step === "done" && renderDoneStep()}
        </View>
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reasonText: {
    flex: 1,
    fontSize: 16,
  },
  backBtn: {
    marginBottom: 16,
    alignSelf: "flex-start",
    padding: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    minHeight: 120,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: 12,
    textAlign: "right",
    marginTop: 6,
    marginBottom: 24,
  },
  submitBtn: {
    backgroundColor: "#E53935",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  doneContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  doneIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  doneTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  doneSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 32,
  },
  doneBtn: {
    backgroundColor: "#333",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 48,
  },
  doneBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
