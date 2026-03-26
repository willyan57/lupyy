// app/signup.tsx
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import Colors from "@/constants/Colors";
import { useTranslation } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";

type BtnProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  style?: any;
};

function GradientButton({ title, onPress, disabled, style }: BtnProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={style}
    >
      <LinearGradient
        colors={[Colors.brandStart, Colors.brandEnd]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.button, { opacity: disabled ? 0.6 : 1 }]}
      >
        <Text style={styles.buttonText}>{title}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function isValidEmail(email: string) {
  const trimmed = email.trim();
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(trimmed);
}

function getPasswordError(pass: string, t: (key: any) => string): string | null {
  if (!pass || pass.length < 8) return t("password.errorMinLength");
  if (!/[a-z]/.test(pass)) return t("password.errorLowercase");
  if (!/[A-Z]/.test(pass)) return t("password.errorUppercase");
  if (!/[0-9]/.test(pass)) return t("password.errorNumber");
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pass)) return t("password.errorSymbol");
  return null;
}

const MIN_AGE = 16;

function isOldEnough(birthDate: Date): boolean {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= MIN_AGE;
}

export default function Signup() {
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [loading, setLoading] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // Age gate
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");

  // Terms acceptance
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const hasMinLength = pass.length >= 8;
  const hasLower = /[a-z]/.test(pass);
  const hasUpper = /[A-Z]/.test(pass);
  const hasNumber = /[0-9]/.test(pass);
  const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pass);
  const passwordsMatch = pass.length > 0 && confirmPass.length > 0 && pass === confirmPass;

  async function handleSignup() {
    if (loading) return;

    setErrorMsg(null);
    setInfoMsg(null);

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail || !pass) {
      setErrorMsg(t("signup.errorEmptyFields"));
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setErrorMsg(t("signup.errorInvalidEmail"));
      return;
    }

    const passError = getPasswordError(pass, t);
    if (passError) {
      setErrorMsg(passError);
      return;
    }

    if (pass !== confirmPass) {
      setErrorMsg(t("signup.errorPasswordMismatch"));
      return;
    }

    // Age verification
    const day = parseInt(birthDay, 10);
    const month = parseInt(birthMonth, 10);
    const year = parseInt(birthYear, 10);

    if (!day || !month || !year || day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > new Date().getFullYear()) {
      setErrorMsg(t("signup.errorInvalidDate"));
      return;
    }

    const birthDate = new Date(year, month - 1, day);
    if (!isOldEnough(birthDate)) {
      setErrorMsg(t("signup.errorUnderage", { age: MIN_AGE }));
      return;
    }

    if (!acceptedTerms) {
      setErrorMsg(t("signup.errorTerms"));
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: pass,
        options: {
          emailRedirectTo:
            Platform.OS === "web"
              ? "https://lupyy.com/auth/callback"
              : "lupyy://auth-callback",
          data: {
            birth_date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
            accepted_terms_at: new Date().toISOString(),
          },
        },
      });

      if (error) {
        let friendly = t("signup.errorGeneric");
        const msg = error.message.toLowerCase();
        if (msg.includes("user already registered") || msg.includes("already exists")) {
          friendly = t("signup.errorAlreadyExists");
        } else if (msg.includes("password")) {
          friendly = t("signup.errorWeakPassword");
        }
        setErrorMsg(friendly);
        return;
      }

      const successText = t("signup.successMessage");
      setInfoMsg(successText);

      if (Platform.OS !== "web") {
        Alert.alert(t("signup.successTitle"), successText, [
          { text: t("common.ok"), onPress: () => router.replace("/") },
        ]);
      } else {
        setTimeout(() => {
          router.replace("/");
        }, 1200);
      }
    } catch (e: any) {
      setErrorMsg(t("signup.errorUnexpected"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: "padding", android: undefined })}
      style={{ flex: 1, backgroundColor: Colors.background }}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          {/* Logo */}
          <View style={styles.logoHeader}>
            <View style={styles.logoCircle}>
              <Image
                source={require("../assets/branding/lupyy-logo.png")}
                style={styles.logoImage}
                contentFit="contain"
              />
            </View>
          </View>

          <Text style={styles.brand}>{t("common.appName")}</Text>
          <Text style={styles.title}>{t("signup.title")}</Text>
          <Text style={styles.subtitle}>{t("signup.subtitle")}</Text>

          <Text style={styles.label}>{t("signup.emailLabel")}</Text>
          <TextInput
            placeholder={t("signup.emailPlaceholder")}
            placeholderTextColor={Colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={(txt) => { setEmail(txt); setErrorMsg(null); }}
            style={styles.input}
          />

          <Text style={styles.label}>{t("signup.passwordLabel")}</Text>
          <TextInput
            placeholder={t("signup.passwordPlaceholder")}
            placeholderTextColor={Colors.textMuted}
            secureTextEntry
            value={pass}
            onChangeText={(txt) => { setPass(txt); setErrorMsg(null); }}
            style={styles.input}
          />

          {/* Password requirements visual feedback */}
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

          <Text style={styles.label}>{t("signup.confirmPasswordLabel")}</Text>
          <TextInput
            placeholder={t("signup.confirmPasswordPlaceholder")}
            placeholderTextColor={Colors.textMuted}
            secureTextEntry
            value={confirmPass}
            onChangeText={(txt) => { setConfirmPass(txt); setErrorMsg(null); }}
            style={styles.input}
          />
          {confirmPass.length > 0 && (
            <Text style={[styles.requirementText, passwordsMatch ? styles.requirementOk : styles.requirementFail]}>
              {passwordsMatch ? `✓ ${t("password.match")}` : `✗ ${t("password.noMatch")}`}
            </Text>
          )}

          {/* Age gate - Lei 15.211/2025 */}
          <Text style={styles.label}>{t("signup.birthDateLabel")}</Text>
          <Text style={styles.ageNote}>{t("signup.birthDateNote")}</Text>
          <View style={styles.dateRow}>
            <TextInput
              placeholder={t("signup.dayPlaceholder")}
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
              maxLength={2}
              value={birthDay}
              onChangeText={(txt) => { setBirthDay(txt.replace(/\D/g, "")); setErrorMsg(null); }}
              style={[styles.input, styles.dateInputCompact]}
            />
            <Text style={styles.dateSeparator}>/</Text>
            <TextInput
              placeholder={t("signup.monthPlaceholder")}
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
              maxLength={2}
              value={birthMonth}
              onChangeText={(txt) => { setBirthMonth(txt.replace(/\D/g, "")); setErrorMsg(null); }}
              style={[styles.input, styles.dateInputCompact]}
            />
            <Text style={styles.dateSeparator}>/</Text>
            <TextInput
              placeholder={t("signup.yearPlaceholder")}
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
              maxLength={4}
              value={birthYear}
              onChangeText={(txt) => { setBirthYear(txt.replace(/\D/g, "")); setErrorMsg(null); }}
              style={[styles.input, styles.dateInputCompactYear]}
            />
          </View>

          {/* Terms acceptance */}
          <TouchableOpacity
            onPress={() => setAcceptedTerms(!acceptedTerms)}
            activeOpacity={0.8}
            style={styles.termsRow}
          >
            <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
              {acceptedTerms && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.termsText}>
              {t("signup.termsAccept")}{" "}
              <Text style={styles.termsLink} onPress={() => router.push("/terms" as any)}>
                {t("common.termsOfUse")}
              </Text>{" "}
              {t("signup.termsAnd")}{" "}
              <Text style={styles.termsLink} onPress={() => router.push("/privacy" as any)}>
                {t("common.privacyPolicy")}
              </Text>
            </Text>
          </TouchableOpacity>

          {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
          {infoMsg && !errorMsg && <Text style={styles.infoText}>{infoMsg}</Text>}

          {loading ? (
            <View style={{ paddingVertical: 16 }}>
              <ActivityIndicator color={Colors.brandStart} />
              <Text style={styles.loadingText}>{t("signup.creating")}</Text>
            </View>
          ) : (
            <GradientButton
              title={t("signup.createButton")}
              onPress={handleSignup}
              style={{ marginTop: 12 }}
            />
          )}

          <View style={styles.footerLinks}>
            <Link href="/" style={styles.link}>
              {t("signup.hasAccount")}
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: "100%",
  },
  card: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#090B14",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 20,
    paddingVertical: 20,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  logoHeader: {
    alignItems: "center",
    marginBottom: 8,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.03)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#7C3AED",
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  logoImage: {
    width: 42,
    height: 42,
  },
  brand: {
    color: "#F5F7FF",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 2,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 2,
  },
  subtitle: {
    color: "#98A2B3",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    marginBottom: 12,
  },
  label: {
    color: "#E5E7EB",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
    marginTop: 6,
  },
  input: {
    backgroundColor: "#0C1020",
    color: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    fontSize: 15,
    marginBottom: 4,
  },
  requirementsContainer: {
    marginTop: 1,
    marginBottom: 4,
    gap: 1,
  },
  requirementText: {
    color: "#6B7280",
    fontSize: 11,
    lineHeight: 16,
  },
  requirementOk: {
    color: "#4ade80",
  },
  requirementFail: {
    color: "#f87171",
  },
  ageNote: {
    color: "#6B7280",
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 6,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  dateInputCompact: {
    flex: 1,
    textAlign: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 0,
    borderRadius: 10,
    fontSize: 14,
  },
  dateInputCompactYear: {
    flex: 1.2,
    textAlign: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 0,
    borderRadius: 10,
    fontSize: 14,
  },
  dateSeparator: {
    color: "#6B7280",
    fontSize: 16,
    fontWeight: "600",
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 14,
    marginBottom: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: Colors.brandStart,
    borderColor: Colors.brandStart,
  },
  checkmark: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  termsText: {
    flex: 1,
    color: "#98A2B3",
    fontSize: 13,
    lineHeight: 19,
  },
  termsLink: {
    color: Colors.brandEnd,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  button: {
    borderRadius: 16,
    overflow: "hidden",
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 17,
    textAlign: "center",
  },
  footerLinks: {
    alignItems: "center",
    marginTop: 18,
    gap: 8,
  },
  link: {
    color: Colors.brandEnd,
    fontWeight: "700",
    fontSize: 15,
  },
  loadingText: {
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 6,
  },
  errorText: {
    marginTop: 10,
    color: "#f87171",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  infoText: {
    marginTop: 10,
    color: "#4ade80",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
});
