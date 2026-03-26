import LanguageSelector from "@/components/LanguageSelector";
import Colors from "@/constants/Colors";
import { useTranslation } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { useIsMobileWeb } from "@/lib/useIsMobileWeb";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function LoginScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const isMobileWeb = useIsMobileWeb(900);
  const isDesktop = Platform.OS === "web" && !isMobileWeb;

  const shakeAnim = useRef(new Animated.Value(0)).current;

  function runShake() {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 4, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -4, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }

  function clearError() {
    if (errorMessage) setErrorMessage("");
  }

  async function handleSignIn() {
    if (loading) return;

    if (!email || !password) {
      setErrorMessage(t("login.errorEmpty"));
      runShake();
      return;
    }

    try {
      setLoading(true);
      setErrorMessage("");

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        const message =
          error.message?.toLowerCase().includes("invalid login credentials")
            ? t("login.errorInvalid")
            : t("login.errorGeneric");

        setErrorMessage(message);
        runShake();
        return;
      }
    } catch (err) {
      setErrorMessage(t("login.errorUnexpected"));
      runShake();
    } finally {
      setLoading(false);
    }
  }

  const hasError = !!errorMessage;

  // ─── Form content (shared for mobile) ───
  function renderForm() {
    return (
      <Animated.View
        style={[
          styles.form,
          { transform: [{ translateX: shakeAnim }] },
        ]}
      >
        <TextInput
          placeholder={t("login.email")}
          placeholderTextColor={Colors.textMuted}
          style={[styles.input, hasError && styles.inputError]}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={(text) => { clearError(); setEmail(text); }}
        />

        <TextInput
          placeholder={t("login.password")}
          placeholderTextColor={Colors.textMuted}
          style={[styles.input, hasError && styles.inputError]}
          secureTextEntry
          value={password}
          onChangeText={(text) => { clearError(); setPassword(text); }}
        />

        {hasError ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={loading}
          activeOpacity={0.9}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{t("login.enter")}</Text>
          )}
        </TouchableOpacity>

        <Link href="/reset" asChild>
          <TouchableOpacity style={styles.linkButton}>
            <Text style={styles.linkText}>{t("login.forgotPassword")}</Text>
          </TouchableOpacity>
        </Link>
      </Animated.View>
    );
  }

  // ─── DESKTOP: Instagram-style wide split layout ───
  if (isDesktop) {
    return (
      <View style={dStyles.root}>
        {/* Left branding panel — full half */}
        <View style={dStyles.leftPanel}>
          <View style={dStyles.brandContent}>
            <View style={dStyles.logoCircle}>
              <Image
                source={require("../assets/branding/lupyy-logo.png")}
                style={dStyles.logoImage}
                contentFit="contain"
              />
            </View>
            <Text style={dStyles.taglineMain}>
              {t("common.tagline")}
            </Text>
            <Text style={dStyles.taglineSub}>
              Lupyy
            </Text>
          </View>
        </View>

        {/* Right form panel — wide, spacious */}
        <View style={dStyles.rightPanel}>
          <ScrollView
            contentContainerStyle={dStyles.rightScroll}
            showsVerticalScrollIndicator={false}
          >
            {/* Language selector top-right */}
            <View style={dStyles.langRow}>
              <LanguageSelector />
            </View>

            {/* Contextual header — not repeating brand name */}
            <View style={dStyles.headerRow}>
              <Text style={dStyles.headerIcon}>‹</Text>
              <Text style={dStyles.formHeader}>{t("login.enter")} no {t("common.appName")}</Text>
            </View>

            {/* Wide form inputs */}
            <Animated.View
              style={[
                dStyles.formWide,
                { transform: [{ translateX: shakeAnim }] },
              ]}
            >
              <TextInput
                placeholder={t("login.email")}
                placeholderTextColor={Colors.textMuted}
                style={[dStyles.inputWide, hasError && styles.inputError]}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={(text) => { clearError(); setEmail(text); }}
              />

              <TextInput
                placeholder={t("login.password")}
                placeholderTextColor={Colors.textMuted}
                style={[dStyles.inputWide, hasError && styles.inputError]}
                secureTextEntry
                value={password}
                onChangeText={(text) => { clearError(); setPassword(text); }}
              />

              {hasError ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

              <TouchableOpacity
                style={[dStyles.buttonWide, loading && styles.buttonDisabled]}
                onPress={handleSignIn}
                disabled={loading}
                activeOpacity={0.9}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={dStyles.buttonWideText}>{t("login.enter")}</Text>
                )}
              </TouchableOpacity>

              <Link href="/reset" asChild>
                <TouchableOpacity style={dStyles.forgotBtn}>
                  <Text style={dStyles.forgotText}>{t("login.forgotPassword")}</Text>
                </TouchableOpacity>
              </Link>
            </Animated.View>

            {/* Separator */}
            <View style={dStyles.separator}>
              <View style={dStyles.separatorLine} />
              <Text style={dStyles.separatorText}>OU</Text>
              <View style={dStyles.separatorLine} />
            </View>

            {/* Create account */}
            <Link href="/signup" asChild>
              <TouchableOpacity style={dStyles.createAccountBtn}>
                <Text style={dStyles.createAccountText}>{t("login.createAccount")}</Text>
              </TouchableOpacity>
            </Link>
          </ScrollView>
        </View>
      </View>
    );
  }

  // ─── MOBILE: Original layout (unchanged) ───
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <LanguageSelector />

          <View style={styles.logoHeader}>
            <View style={styles.logoCircle}>
              <Image
                source={require("../assets/branding/lupyy-logo.png")}
                style={styles.logoImage}
                contentFit="contain"
              />
            </View>
            <Text style={styles.appName}>{t("common.appName")}</Text>
            <Text style={styles.tagline}>{t("common.tagline")}</Text>
          </View>

          {renderForm()}

          <Link href="/signup" asChild>
            <TouchableOpacity style={styles.linkButton}>
              <Text style={styles.linkTextBold}>{t("login.createAccount")}</Text>
            </TouchableOpacity>
          </Link>

          <View style={styles.legalFooter}>
            <View style={styles.legalRow}>
              <Link href="/terms" style={styles.legalLink}>
                {t("common.termsOfUse")}
              </Link>
              <Text style={styles.legalSep}>·</Text>
              <Link href="/privacy" style={styles.legalLink}>
                {t("common.privacyPolicy")}
              </Link>
            </View>
            <Text style={styles.copyrightMobile}>{t("common.copyright")}</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Desktop styles (Instagram-inspired wide layout) ───
const dStyles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: Colors.background,
    minHeight: "100%" as any,
  },
  leftPanel: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 64,
  },
  brandContent: {
    alignItems: "center",
    maxWidth: 460,
  },
  logoCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(124,58,237,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.2)",
    shadowColor: "#7C3AED",
    shadowOpacity: 0.3,
    shadowRadius: 50,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  logoImage: {
    width: 72,
    height: 72,
  },
  taglineMain: {
    fontSize: 24,
    fontWeight: "300",
    color: Colors.text,
    textAlign: "center",
    lineHeight: 36,
    letterSpacing: 0.3,
  },
  taglineSub: {
    fontSize: 40,
    fontWeight: "900",
    color: "#fff",
    marginTop: 12,
    letterSpacing: -0.5,
  },
  rightPanel: {
    flex: 1,
    justifyContent: "center",
  },
  rightScroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 72,
    paddingVertical: 20,
  },
  langRow: {
    alignItems: "flex-end",
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
  },
  headerIcon: {
    fontSize: 28,
    color: "rgba(255,255,255,0.5)",
    fontWeight: "300",
  },
  formHeader: {
    fontSize: 22,
    fontWeight: "600",
    color: "rgba(255,255,255,0.9)",
    letterSpacing: 0.2,
  },
  formWide: {
    width: "100%" as any,
    gap: 12,
  },
  inputWide: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    fontSize: 16,
    width: "100%" as any,
  },
  buttonWide: {
    marginTop: 4,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center" as any,
    justifyContent: "center" as any,
    backgroundColor: Colors.brandStart,
    width: "100%" as any,
  },
  buttonWideText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 0.5,
  },
  forgotBtn: {
    paddingVertical: 8,
    alignItems: "center" as any,
  },
  forgotText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  separator: {
    flexDirection: "row" as any,
    alignItems: "center" as any,
    marginVertical: 14,
    gap: 16,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  separatorText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
  },
  createAccountBtn: {
    borderWidth: 1.5,
    borderColor: Colors.brandEnd,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center" as any,
    width: "100%" as any,
  },
  createAccountText: {
    color: Colors.brandEnd,
    fontSize: 16,
    fontWeight: "700",
  },
});

// ─── Mobile styles (unchanged) ───
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  content: {
    width: "100%",
    maxWidth: 460,
    paddingHorizontal: 32,
  },
  logoHeader: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#7C3AED",
    shadowOpacity: 0.15,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  logoImage: {
    width: 90,
    height: 90,
  },
  appName: {
    fontSize: 40,
    fontWeight: "800",
    color: Colors.text,
  },
  tagline: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 6,
    fontWeight: "500",
  },
  form: {
    width: "100%",
    gap: 12,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    fontSize: 16,
  },
  inputError: {
    borderColor: "#ff5a67",
    shadowColor: "#ff5a67",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  errorText: {
    color: "#ff7a85",
    fontSize: 13,
    marginTop: -2,
    marginBottom: 2,
    paddingHorizontal: 4,
    textAlign: "center",
  },
  button: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.brandStart,
  },
  buttonDisabled: {
    opacity: 0.75,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
    letterSpacing: 1,
  },
  linkButton: {
    paddingVertical: 6,
    alignItems: "center",
  },
  linkText: {
    color: Colors.brandEnd,
    fontSize: 14,
  },
  linkTextBold: {
    color: Colors.brandEnd,
    fontSize: 15,
    fontWeight: "700",
  },
  legalFooter: {
    marginTop: 32,
    alignItems: "center",
    gap: 6,
  },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legalLink: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  legalSep: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  copyrightMobile: {
    color: "rgba(255,255,255,0.2)",
    fontSize: 11,
    fontWeight: "600",
  },
});
