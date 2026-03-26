// app/signup.tsx
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

function getPasswordError(pass: string): string | null {
  if (!pass || pass.length < 8) {
    return "A senha precisa ter pelo menos 8 caracteres.";
  }
  if (!/[a-z]/.test(pass)) {
    return "A senha precisa ter pelo menos uma letra minúscula.";
  }
  if (!/[A-Z]/.test(pass)) {
    return "A senha precisa ter pelo menos uma letra maiúscula.";
  }
  if (!/[0-9]/.test(pass)) {
    return "A senha precisa ter pelo menos um número.";
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pass)) {
    return "A senha precisa ter pelo menos um símbolo especial (!@#$%&*...).";
  }
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
      setErrorMsg("Preencha o e-mail e a senha.");
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setErrorMsg("Digite um e-mail válido.");
      return;
    }

    const passError = getPasswordError(pass);
    if (passError) {
      setErrorMsg(passError);
      return;
    }

    if (pass !== confirmPass) {
      setErrorMsg("As senhas não coincidem.");
      return;
    }

    // Age verification
    const day = parseInt(birthDay, 10);
    const month = parseInt(birthMonth, 10);
    const year = parseInt(birthYear, 10);

    if (!day || !month || !year || day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > new Date().getFullYear()) {
      setErrorMsg("Informe uma data de nascimento válida.");
      return;
    }

    const birthDate = new Date(year, month - 1, day);
    if (!isOldEnough(birthDate)) {
      setErrorMsg(
        `De acordo com a legislação brasileira (Lei nº 15.211/2025), é necessário ter pelo menos ${MIN_AGE} anos para criar uma conta. Menores de ${MIN_AGE} anos precisam de autorização e supervisão de um responsável legal.`
      );
      return;
    }

    if (!acceptedTerms) {
      setErrorMsg("Você precisa aceitar os Termos de Uso e a Política de Privacidade para continuar.");
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
        let friendly = "Não foi possível criar sua conta.";
        const msg = error.message.toLowerCase();
        if (msg.includes("user already registered") || msg.includes("already exists")) {
          friendly = "Já existe uma conta com este e-mail.";
        } else if (msg.includes("password")) {
          friendly = "Sua senha não atende aos requisitos de segurança. Tente uma senha mais forte.";
        }
        setErrorMsg(friendly);
        return;
      }

      const successText =
        "Conta criada! Enviamos um e-mail de confirmação. Toque no link recebido para ativar sua conta e depois faça login.";
      setInfoMsg(successText);

      if (Platform.OS !== "web") {
        Alert.alert("Conta criada", successText, [
          { text: "OK", onPress: () => router.replace("/") },
        ]);
      } else {
        setTimeout(() => {
          router.replace("/");
        }, 1200);
      }
    } catch (e: any) {
      setErrorMsg("Erro inesperado ao criar conta. Tente novamente.");
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
          <Text style={styles.brand}>Lupyy</Text>
          <Text style={styles.title}>Criar conta</Text>
          <Text style={styles.subtitle}>
            Crie sua conta e comece a compartilhar momentos com o mundo.
          </Text>

          <Text style={styles.label}>E-mail</Text>
          <TextInput
            placeholder="seuemail@exemplo.com"
            placeholderTextColor={Colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={(t) => { setEmail(t); setErrorMsg(null); }}
            style={styles.input}
          />

          <Text style={styles.label}>Senha</Text>
          <TextInput
            placeholder="Crie uma senha forte"
            placeholderTextColor={Colors.textMuted}
            secureTextEntry
            value={pass}
            onChangeText={(t) => { setPass(t); setErrorMsg(null); }}
            style={styles.input}
          />

          {/* Password requirements visual feedback */}
          <View style={styles.requirementsContainer}>
            <Text style={[styles.requirementText, hasMinLength && styles.requirementOk]}>
              {hasMinLength ? "✓" : "○"} Pelo menos 8 caracteres
            </Text>
            <Text style={[styles.requirementText, hasLower && styles.requirementOk]}>
              {hasLower ? "✓" : "○"} Pelo menos uma letra minúscula
            </Text>
            <Text style={[styles.requirementText, hasUpper && styles.requirementOk]}>
              {hasUpper ? "✓" : "○"} Pelo menos uma letra maiúscula
            </Text>
            <Text style={[styles.requirementText, hasNumber && styles.requirementOk]}>
              {hasNumber ? "✓" : "○"} Pelo menos um número
            </Text>
            <Text style={[styles.requirementText, hasSymbol && styles.requirementOk]}>
              {hasSymbol ? "✓" : "○"} Pelo menos um símbolo (!@#$%&*...)
            </Text>
          </View>

          <Text style={styles.label}>Confirmar senha</Text>
          <TextInput
            placeholder="Digite a senha novamente"
            placeholderTextColor={Colors.textMuted}
            secureTextEntry
            value={confirmPass}
            onChangeText={(t) => { setConfirmPass(t); setErrorMsg(null); }}
            style={styles.input}
          />
          {confirmPass.length > 0 && (
            <Text style={[styles.requirementText, passwordsMatch ? styles.requirementOk : styles.requirementFail]}>
              {passwordsMatch ? "✓ Senhas coincidem" : "✗ Senhas não coincidem"}
            </Text>
          )}

          {/* Age gate - Lei 15.211/2025 */}
          <Text style={styles.label}>Data de nascimento</Text>
          <Text style={styles.ageNote}>
            Conforme a Lei nº 15.211/2025, precisamos verificar sua idade para proteger crianças e adolescentes no ambiente digital.
          </Text>
          <View style={styles.dateRow}>
            <TextInput
              placeholder="DD"
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
              maxLength={2}
              value={birthDay}
              onChangeText={(t) => { setBirthDay(t.replace(/\D/g, "")); setErrorMsg(null); }}
              style={[styles.input, styles.dateInput]}
            />
            <TextInput
              placeholder="MM"
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
              maxLength={2}
              value={birthMonth}
              onChangeText={(t) => { setBirthMonth(t.replace(/\D/g, "")); setErrorMsg(null); }}
              style={[styles.input, styles.dateInput]}
            />
            <TextInput
              placeholder="AAAA"
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
              maxLength={4}
              value={birthYear}
              onChangeText={(t) => { setBirthYear(t.replace(/\D/g, "")); setErrorMsg(null); }}
              style={[styles.input, styles.dateInputYear]}
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
              Li e aceito os{" "}
              <Text style={styles.termsLink} onPress={() => router.push("/terms" as any)}>
                Termos de Uso
              </Text>{" "}
              e a{" "}
              <Text style={styles.termsLink} onPress={() => router.push("/privacy" as any)}>
                Política de Privacidade
              </Text>
            </Text>
          </TouchableOpacity>

          {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
          {infoMsg && !errorMsg && <Text style={styles.infoText}>{infoMsg}</Text>}

          {loading ? (
            <View style={{ paddingVertical: 16 }}>
              <ActivityIndicator color={Colors.brandStart} />
              <Text style={styles.loadingText}>Criando sua conta…</Text>
            </View>
          ) : (
            <GradientButton
              title="Criar conta"
              onPress={handleSignup}
              style={{ marginTop: 12 }}
            />
          )}

          <View style={styles.footerLinks}>
            <Link href="/" style={styles.link}>
              Já tem conta? Entrar
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
  brand: {
    color: "#F5F7FF",
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 6,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    color: "#98A2B3",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 24,
  },
  label: {
    color: "#E5E7EB",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: "#0C1020",
    color: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    fontSize: 16,
    marginBottom: 6,
  },
  requirementsContainer: {
    marginTop: 2,
    marginBottom: 6,
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
  ageNote: {
    color: "#6B7280",
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 8,
  },
  dateRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 6,
  },
  dateInput: {
    flex: 1,
    textAlign: "center",
  },
  dateInputYear: {
    flex: 1.5,
    textAlign: "center",
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
