import Colors from "@/constants/Colors";
import { supabase } from "@/lib/supabase";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { Link, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type Mode = "request" | "reset";
type BannerType = "error" | "success" | "info";

type NoticeState = {
  visible: boolean;
  title: string;
  message: string;
};

export default function ResetScreen() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("request");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [changing, setChanging] = useState(false);
  const [loadingRecovery, setLoadingRecovery] = useState(false);

  const [banner, setBanner] = useState<{
    visible: boolean;
    type: BannerType;
    message: string;
  }>({
    visible: false,
    type: "info",
    message: "",
  });

  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);

  const [notice, setNotice] = useState<NoticeState>({
    visible: false,
    title: "",
    message: "",
  });

  const redirectTo = useMemo(() => {
    if (Platform.OS === "web") return "https://lupyy.com/reset";
    return "lupyy://reset";
  }, []);

  function showNotice(title: string, message: string) {
    setNotice({ visible: true, title, message });
  }

  function closeNotice() {
    setNotice((prev) => ({ ...prev, visible: false }));
  }

  function showBanner(type: BannerType, message: string) {
    setBanner({ visible: true, type, message });
  }

  function clearBanner() {
    setBanner((prev) => ({ ...prev, visible: false, message: "" }));
  }

  async function handleSendEmail() {
    try {
      const normalizedEmail = email.trim().toLowerCase();

      clearBanner();
      setEmailError(false);

      if (!normalizedEmail) {
        setEmailError(true);
        showBanner("error", "Digite o e-mail vinculado à sua conta Lupyy.");
        return;
      }

      setSending(true);

      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo,
      });

      if (error) throw error;

      setEmail(normalizedEmail);
      showBanner(
        "success",
        `Enviamos um link de recuperação para ${normalizedEmail}. Verifique sua caixa de entrada e também o spam.`
      );
      showNotice(
        "Recovery email sent",
        `We sent a password recovery link to ${normalizedEmail}. Open your inbox and tap the link to continue.`
      );
    } catch (e: any) {
      setEmailError(true);
      showBanner("error", e?.message ?? "Não foi possível enviar o e-mail de recuperação.");
    } finally {
      setSending(false);
    }
  }

  async function processRecoveryUrl(rawUrl: string | null | undefined) {
    if (!rawUrl) return;

    try {
      setLoadingRecovery(true);
      clearBanner();
      setPasswordError(false);

      const normalizedUrl = rawUrl.replace("#", "?");
      const queryString = normalizedUrl.split("?")[1] ?? "";
      const params = new URLSearchParams(queryString);

      const type = params.get("type");
      const code = params.get("code");
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(rawUrl);
        if (error) throw error;
        setMode("reset");
        showBanner("info", "Link validado. Agora defina sua nova senha.");
      } else if (type === "recovery" && accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) throw error;
        setMode("reset");
        showBanner("info", "Link validado. Agora defina sua nova senha.");
      }

      if (Platform.OS === "web" && typeof window !== "undefined") {
        const hasHashTokens =
          window.location.hash.includes("access_token") ||
          window.location.hash.includes("refresh_token") ||
          window.location.hash.includes("type=recovery");

        if (hasHashTokens) {
          window.history.replaceState({}, document.title, "/reset");
        }
      }
    } catch (e: any) {
      showBanner("error", e?.message ?? "O link de recuperação é inválido ou expirou.");
    } finally {
      setLoadingRecovery(false);
    }
  }

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("reset");
        showBanner("info", "Link validado. Agora defina sua nova senha.");
      }
    });

    const sub = Linking.addEventListener("url", ({ url }) => {
      processRecoveryUrl(url);
    });

    Linking.getInitialURL().then((url) => {
      if (url) processRecoveryUrl(url);
    });

    if (Platform.OS === "web" && typeof window !== "undefined") {
      processRecoveryUrl(window.location.href);
    }

    return () => {
      data.subscription.unsubscribe();
      sub.remove();
    };
  }, []);

  async function handleChangePassword() {
    try {
      clearBanner();
      setPasswordError(false);

      if (!pass1 || pass1.length < 6) {
        setPasswordError(true);
        showBanner("error", "Use pelo menos 6 caracteres na nova senha.");
        return;
      }

      if (pass1 !== pass2) {
        setPasswordError(true);
        showBanner("error", "As senhas não coincidem. Digite a mesma senha nos dois campos.");
        return;
      }

      setChanging(true);

      const { error } = await supabase.auth.updateUser({ password: pass1 });
      if (error) throw error;

      showBanner("success", "Senha alterada com sucesso. Redirecionando para o login...");
      showNotice(
        "Password updated",
        "Your password has been changed successfully. You can now sign in."
      );

      setTimeout(() => {
        router.replace("/");
      }, 1200);
    } catch (e: any) {
      setPasswordError(true);
      showBanner("error", e?.message ?? "Erro ao atualizar a senha.");
    } finally {
      setChanging(false);
    }
  }

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <View style={styles.logoWrap}>
              <View style={styles.logoGlow} />
              <Text style={styles.logoMark}>∞◁</Text>
            </View>

            <Text style={styles.brand}>Lupyy</Text>
            <Text style={styles.title}>
              {mode === "request" ? "Recuperar senha" : "Crie uma nova senha"}
            </Text>
            <Text style={styles.subtitle}>
              {mode === "request"
                ? "Informe seu e-mail e enviaremos um link seguro para recuperar o acesso à sua conta."
                : "Defina uma nova senha forte para proteger sua conta e entrar novamente no Lupyy."}
            </Text>

            {banner.visible ? (
              <View
                style={[
                  styles.banner,
                  banner.type === "error"
                    ? styles.bannerError
                    : banner.type === "success"
                    ? styles.bannerSuccess
                    : styles.bannerInfo,
                ]}
              >
                <Text
                  style={[
                    styles.bannerText,
                    banner.type === "error"
                      ? styles.bannerTextError
                      : banner.type === "success"
                      ? styles.bannerTextSuccess
                      : styles.bannerTextInfo,
                  ]}
                >
                  {banner.message}
                </Text>
              </View>
            ) : null}

            {loadingRecovery ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color="#8B5CF6" />
                <Text style={styles.loadingText}>Validando seu link de recuperação…</Text>
              </View>
            ) : mode === "request" ? (
              <>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  placeholder="seuemail@exemplo.com"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    setEmailError(false);
                    clearBanner();
                  }}
                  style={[styles.input, emailError && styles.inputError]}
                />

                <TouchableOpacity
                  onPress={handleSendEmail}
                  disabled={sending}
                  style={[styles.button, sending && styles.buttonDisabled]}
                >
                  {sending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Enviar link de recuperação</Text>
                  )}
                </TouchableOpacity>

                <Text style={styles.helper}>Lembrou sua senha?</Text>
                <Link href="/" style={styles.link}>
                  Voltar para o login
                </Link>
              </>
            ) : (
              <>
                <Text style={styles.label}>Nova senha</Text>
                <TextInput
                  placeholder="Pelo menos 6 caracteres"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry
                  value={pass1}
                  onChangeText={(text) => {
                    setPass1(text);
                    setPasswordError(false);
                    clearBanner();
                  }}
                  style={[styles.input, passwordError && styles.inputError]}
                />

                <Text style={styles.label}>Confirmar senha</Text>
                <TextInput
                  placeholder="Digite novamente"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry
                  value={pass2}
                  onChangeText={(text) => {
                    setPass2(text);
                    setPasswordError(false);
                    clearBanner();
                  }}
                  style={[styles.input, passwordError && styles.inputError]}
                />

                <TouchableOpacity
                  onPress={handleChangePassword}
                  disabled={changing}
                  style={[styles.button, changing && styles.buttonDisabled]}
                >
                  {changing ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Salvar nova senha</Text>
                  )}
                </TouchableOpacity>

                <Link href="/" style={styles.link}>
                  Cancelar
                </Link>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        transparent
        visible={notice.visible}
        animationType="fade"
        onRequestClose={closeNotice}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeNotice}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalBadge}>
              <Text style={styles.modalBadgeText}>L</Text>
            </View>
            <Text style={styles.modalTitle}>{notice.title}</Text>
            <Text style={styles.modalMessage}>{notice.message}</Text>
            <TouchableOpacity style={styles.modalButton} onPress={closeNotice}>
              <Text style={styles.modalButtonText}>OK</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: {
    flex: 1,
    backgroundColor: "#05060A",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  card: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 540,
    backgroundColor: "#090B14",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 22,
    paddingVertical: 28,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  logoWrap: {
    width: 108,
    height: 108,
    borderRadius: 54,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.02)",
    marginBottom: 18,
    overflow: "hidden",
  },
  logoGlow: {
    position: "absolute",
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: "rgba(127, 86, 217, 0.08)",
  },
  logoMark: {
    color: "#7C3AED",
    fontSize: 32,
    fontWeight: "900",
  },
  brand: {
    color: "#F5F7FF",
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 10,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    color: "#98A2B3",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 24,
  },
  banner: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 16,
    borderWidth: 1,
  },
  bannerError: {
    backgroundColor: "rgba(255, 90, 103, 0.10)",
    borderColor: "rgba(255, 90, 103, 0.35)",
  },
  bannerSuccess: {
    backgroundColor: "rgba(34, 197, 94, 0.10)",
    borderColor: "rgba(34, 197, 94, 0.30)",
  },
  bannerInfo: {
    backgroundColor: "rgba(112, 214, 255, 0.10)",
    borderColor: "rgba(112, 214, 255, 0.28)",
  },
  bannerText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    fontWeight: "600",
  },
  bannerTextError: {
    color: "#FF8A94",
  },
  bannerTextSuccess: {
    color: "#86EFAC",
  },
  bannerTextInfo: {
    color: "#8BE9FD",
  },
  label: {
    color: "#E5E7EB",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    backgroundColor: "#0C1020",
    color: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    fontSize: 16,
    marginBottom: 14,
  },
  inputError: {
    borderColor: "rgba(255, 90, 103, 0.75)",
    backgroundColor: "rgba(255, 90, 103, 0.05)",
  },
  button: {
    marginTop: 6,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.brandStart,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
  },
  helper: {
    textAlign: "center",
    color: "#8A90A6",
    marginTop: 18,
    fontSize: 14,
  },
  link: {
    color: "#70D6FF",
    marginTop: 10,
    textAlign: "center",
    fontWeight: "600",
    fontSize: 15,
  },
  loadingBox: {
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    color: "#D1D5DB",
    fontSize: 15,
    textAlign: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.68)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    backgroundColor: "#0B0F1A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: "center",
  },
  modalBadge: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    backgroundColor: "rgba(124,58,237,0.16)",
  },
  modalBadgeText: {
    color: "#B794F4",
    fontSize: 24,
    fontWeight: "900",
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 10,
  },
  modalMessage: {
    color: "#A6ADBB",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 18,
  },
  modalButton: {
    minWidth: 120,
    borderRadius: 14,
    backgroundColor: Colors.brandStart,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  modalButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 16,
  },
});