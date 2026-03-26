import Colors from "@/constants/Colors";
import { useTranslation } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import { Image } from "expo-image";
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

const RECOVERY_FLAG = "lupyy_password_recovery_pending";

export default function ResetScreen() {
  const router = useRouter();
  const { t } = useTranslation();

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

  // Password strength indicators
  const hasMinLength = pass1.length >= 8;
  const hasLower = /[a-z]/.test(pass1);
  const hasUpper = /[A-Z]/.test(pass1);
  const hasNumber = /[0-9]/.test(pass1);
  const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pass1);
  const passwordsMatch = pass1.length > 0 && pass2.length > 0 && pass1 === pass2;

  const redirectTo = useMemo(() => {
    if (Platform.OS === "web") return "https://lupyy.com/reset";
    return "lupyy://reset";
  }, []);

  function persistRecoveryFlag(value: boolean) {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try {
        if (value) {
          window.localStorage.setItem(RECOVERY_FLAG, "1");
        } else {
          window.localStorage.removeItem(RECOVERY_FLAG);
        }
      } catch {}
    }
  }

  function hasPersistedRecoveryFlag() {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try {
        return window.localStorage.getItem(RECOVERY_FLAG) === "1";
      } catch {
        return false;
      }
    }
    return false;
  }

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

  function enterResetMode(message?: string) {
    setMode("reset");
    persistRecoveryFlag(true);
    if (message) showBanner("info", message);
  }

  function returnToRequestMode(message?: string) {
    setMode("request");
    persistRecoveryFlag(false);
    setPass1("");
    setPass2("");
    if (message) showBanner("error", message);
  }

  function clearRecoveryFlow() {
    persistRecoveryFlag(false);
    setMode("request");
    setPass1("");
    setPass2("");
  }

  async function hasValidRecoverySession(): Promise<boolean> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return !!session;
    } catch {
      return false;
    }
  }

  function cleanResetUrl() {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.history.replaceState({}, document.title, "/reset");
    }
  }

  async function handleSendEmail() {
    try {
      const normalizedEmail = email.trim().toLowerCase();

      clearBanner();
      setEmailError(false);

      if (!normalizedEmail) {
        setEmailError(true);
        showBanner("error", t("reset.errorEmptyEmail"));
        return;
      }

      setSending(true);

      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo,
      });

      if (error) throw error;

      setEmail(normalizedEmail);
      showBanner("success", t("reset.successEmail", { email: normalizedEmail }));
      showNotice(t("reset.noticeTitle"), t("reset.noticeMessage", { email: normalizedEmail }));
    } catch (e: any) {
      setEmailError(true);
      showBanner("error", e?.message ?? t("reset.errorSend"));
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

      const error = params.get("error");
      const errorCode = params.get("error_code");
      const errorDescription = params.get("error_description");

      if (error || errorCode) {
        const decodedMessage = decodeURIComponent(
          (errorDescription || t("reset.linkInvalid"))
            .replace(/\+/g, " ")
        );

        returnToRequestMode(
          errorCode === "otp_expired"
            ? t("reset.linkExpired")
            : decodedMessage
        );
        cleanResetUrl();
        return;
      }

      const looksLikeRecoveryLink =
        type === "recovery" ||
        !!code ||
        !!accessToken ||
        rawUrl.includes("type=recovery") ||
        rawUrl.includes("access_token=");

      if (!looksLikeRecoveryLink) {
        return;
      }

      enterResetMode(t("reset.validating"));

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(rawUrl);
        if (exchangeError) throw exchangeError;
        enterResetMode(t("reset.linkValidated"));
      } else if (type === "recovery" && accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) throw sessionError;
        enterResetMode(t("reset.linkValidated"));
      } else {
        enterResetMode(t("reset.linkValidated"));
      }

      cleanResetUrl();
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      const expired =
        msg.toLowerCase().includes("expired") ||
        msg.toLowerCase().includes("otp") ||
        msg.toLowerCase().includes("invalid");

      returnToRequestMode(
        expired
          ? t("reset.linkExpired")
          : t("reset.linkError")
      );
      cleanResetUrl();
    } finally {
      setLoadingRecovery(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function initRecoveryCheck() {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const href = window.location.href;
        const hasRecoveryParams =
          href.includes("/reset") &&
          (href.includes("type=recovery") ||
            href.includes("access_token=") ||
            href.includes("code=") ||
            window.location.hash.includes("type=recovery") ||
            window.location.hash.includes("access_token="));

        if (hasRecoveryParams) {
          enterResetMode(t("reset.validating"));
        } else if (hasPersistedRecoveryFlag()) {
          const hasSession = await hasValidRecoverySession();
          if (cancelled) return;

          if (hasSession) {
            enterResetMode(t("reset.continueReset"));
          } else {
            returnToRequestMode();
            clearRecoveryFlow();
          }
        }
      }
    }

    initRecoveryCheck();

    const { data } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: any) => {
      if (cancelled) return;

      if (event === "PASSWORD_RECOVERY") {
        enterResetMode(t("reset.linkValidated"));
      }

      if (event === "SIGNED_OUT") {
        clearRecoveryFlow();
      }

      if (event === "SIGNED_IN" && mode !== "reset") {
        clearRecoveryFlow();
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
      cancelled = true;
      data.subscription.unsubscribe();
      sub.remove();
    };
  }, []);

  async function handleChangePassword() {
    try {
      clearBanner();
      setPasswordError(false);

      if (!pass1 || pass1.length < 8) {
        setPasswordError(true);
        showBanner("error", t("password.errorMinLength"));
        return;
      }
      if (!/[a-z]/.test(pass1)) {
        setPasswordError(true);
        showBanner("error", t("password.errorLowercase"));
        return;
      }
      if (!/[A-Z]/.test(pass1)) {
        setPasswordError(true);
        showBanner("error", t("password.errorUppercase"));
        return;
      }
      if (!/[0-9]/.test(pass1)) {
        setPasswordError(true);
        showBanner("error", t("password.errorNumber"));
        return;
      }
      if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pass1)) {
        setPasswordError(true);
        showBanner("error", t("password.errorSymbol"));
        return;
      }

      if (pass1 !== pass2) {
        setPasswordError(true);
        showBanner("error", t("reset.errorMismatch"));
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setPasswordError(true);
        returnToRequestMode(t("reset.sessionExpired"));
        return;
      }

      setChanging(true);

      const { error } = await supabase.auth.updateUser({ password: pass1 });
      if (error) throw error;

      clearRecoveryFlow();
      await supabase.auth.signOut();

      showBanner("success", t("reset.successBanner"));
      showNotice(t("reset.successTitle"), t("reset.successMessage"));

      setTimeout(() => {
        router.replace("/");
      }, 1200);
    } catch (e: any) {
      setPasswordError(true);
      showBanner("error", e?.message ?? t("reset.errorUpdate"));
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
              <Image
                source={require("../assets/branding/lupyy-logo.png")}
                style={styles.logoImage}
                contentFit="contain"
              />
            </View>

            <Text style={styles.brand}>{t("common.appName")}</Text>
            <Text style={styles.title}>
              {mode === "request" ? t("reset.titleRequest") : t("reset.titleReset")}
            </Text>
            <Text style={styles.subtitle}>
              {mode === "request"
                ? t("reset.subtitleRequest")
                : t("reset.subtitleReset")}
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
                <Text style={styles.loadingText}>{t("reset.validating")}</Text>
              </View>
            ) : mode === "request" ? (
              <>
                <Text style={styles.label}>{t("reset.emailLabel")}</Text>
                <TextInput
                  placeholder={t("reset.emailPlaceholder")}
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
                    <Text style={styles.buttonText}>{t("reset.sendLink")}</Text>
                  )}
                </TouchableOpacity>

                <Text style={styles.helper}>{t("reset.remembered")}</Text>
                <Link href="/" style={styles.link}>
                  {t("reset.backToLogin")}
                </Link>
              </>
            ) : (
              <>
                <Text style={styles.label}>{t("reset.newPasswordLabel")}</Text>
                <TextInput
                  placeholder={t("reset.newPasswordPlaceholder")}
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

                {/* Password strength indicators */}
                <View style={styles.requirementsContainer}>
                  <Text style={[styles.requirementText, hasMinLength && styles.requirementOk]}>
                    {hasMinLength ? "✓" : "○"} {t("password.minLength")}
                  </Text>
                  <Text style={[styles.requirementText, hasLower && styles.requirementOk]}>
                    {hasLower ? "✓" : "○"} {t("password.lowercase")}
                  </Text>
                  <Text style={[styles.requirementText, hasUpper && styles.requirementOk]}>
                    {hasUpper ? "✓" : "○"} {t("password.uppercase")}
                  </Text>
                  <Text style={[styles.requirementText, hasNumber && styles.requirementOk]}>
                    {hasNumber ? "✓" : "○"} {t("password.number")}
                  </Text>
                  <Text style={[styles.requirementText, hasSymbol && styles.requirementOk]}>
                    {hasSymbol ? "✓" : "○"} {t("password.symbol")}
                  </Text>
                </View>

                <Text style={styles.label}>{t("reset.confirmLabel")}</Text>
                <TextInput
                  placeholder={t("reset.confirmPlaceholder")}
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

                {pass2.length > 0 && (
                  <Text style={[styles.requirementText, passwordsMatch ? styles.requirementOk : styles.requirementFail]}>
                    {passwordsMatch ? `✓ ${t("password.match")}` : `✗ ${t("password.noMatch")}`}
                  </Text>
                )}

                <TouchableOpacity
                  onPress={handleChangePassword}
                  disabled={changing}
                  style={[styles.button, changing && styles.buttonDisabled]}
                >
                  {changing ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>{t("reset.saveButton")}</Text>
                  )}
                </TouchableOpacity>

                <Link href="/" style={styles.link}>
                  {t("common.cancel")}
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
              <Text style={styles.modalButtonText}>{t("common.ok")}</Text>
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
    width: 120,
    height: 120,
    borderRadius: 60,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#7C3AED",
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  logoImage: {
    width: 76,
    height: 76,
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
  bannerTextError: { color: "#FF8A94" },
  bannerTextSuccess: { color: "#86EFAC" },
  bannerTextInfo: { color: "#8BE9FD" },
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
    marginBottom: 6,
  },
  inputError: {
    borderColor: "rgba(255, 90, 103, 0.75)",
    backgroundColor: "rgba(255, 90, 103, 0.05)",
  },
  requirementsContainer: {
    marginTop: 2,
    marginBottom: 8,
    gap: 2,
  },
  requirementText: {
    color: "#6B7280",
    fontSize: 12,
    lineHeight: 18,
  },
  requirementOk: {
    color: "#4ade80",
  },
  requirementFail: {
    color: "#f87171",
  },
  button: {
    marginTop: 10,
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
