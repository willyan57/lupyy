// app/signup.tsx
import { LinearGradient } from "expo-linear-gradient";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
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

// validação simples de e-mail
function isValidEmail(email: string) {
  const trimmed = email.trim();
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(trimmed);
}

// retorna mensagem de erro da senha, ou null se estiver ok
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
  return null;
}

export default function Signup() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const hasMinLength = pass.length >= 8;
  const hasLower = /[a-z]/.test(pass);
  const hasUpper = /[A-Z]/.test(pass);
  const hasNumber = /[0-9]/.test(pass);

  async function handleSignup() {
    if (loading) return;

    setErrorMsg(null);
    setInfoMsg(null);

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail || !pass) {
      setErrorMsg("Preencha o e-mail e a senha.");
      if (Platform.OS !== "web") {
        Alert.alert("Erro", "Preencha o e-mail e a senha.");
      }
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setErrorMsg("Digite um e-mail válido.");
      if (Platform.OS !== "web") {
        Alert.alert("E-mail inválido", "Digite um e-mail válido.");
      }
      return;
    }

    const passError = getPasswordError(pass);
    if (passError) {
      setErrorMsg(passError);
      if (Platform.OS !== "web") {
        Alert.alert("Senha fraca", passError);
      }
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: pass,
        options: {
          // ajuste essa URL conforme a rota de callback que você configurar no Supabase
          emailRedirectTo:
            Platform.OS === "web"
              ? "https://lupyy.com/auth/callback"
              : "lupyy://auth-callback",
        },
      });

      if (error) {
        let friendly = "Não foi possível criar sua conta.";

        const msg = error.message.toLowerCase();
        if (msg.includes("user already registered") || msg.includes("already exists")) {
          friendly = "Já existe uma conta com este e-mail.";
        } else if (msg.includes("password")) {
          friendly =
            "Sua senha não atende aos requisitos de segurança. Tente uma senha mais forte.";
        }

        setErrorMsg(friendly);

        if (Platform.OS !== "web") {
          Alert.alert("Erro ao criar conta", friendly);
        }

        return;
      }

      // sucesso: Supabase deve enviar e-mail de confirmação (se estiver habilitado)
      const successText =
        "Conta criada! Enviamos um e-mail de confirmação. Toque no link recebido para ativar sua conta e depois faça login.";
      setInfoMsg(successText);

      if (Platform.OS !== "web") {
        Alert.alert("Conta criada", successText, [
          { text: "OK", onPress: () => router.replace("/") },
        ]);
      } else {
        // no web, só redireciona pro login depois de um pequeno delay
        setTimeout(() => {
          router.replace("/");
        }, 1200);
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setErrorMsg("Erro inesperado ao criar conta. Tente novamente.");
      if (Platform.OS !== "web") {
        Alert.alert("Erro inesperado", msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: "padding", android: undefined })}
      style={{ flex: 1, backgroundColor: Colors.background }}
    >
      <View style={styles.container}>
        <Text style={styles.title}>Create account</Text>

        <TextInput
          placeholder="E-mail"
          placeholderTextColor={Colors.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          style={styles.input}
        />

        <TextInput
          placeholder="Password"
          placeholderTextColor={Colors.textMuted}
          secureTextEntry
          value={pass}
          onChangeText={setPass}
          style={styles.input}
        />

        {/* Requisitos de senha (feedback visual em tempo real) */}
        <View style={styles.requirementsContainer}>
          <Text
            style={[
              styles.requirementText,
              hasMinLength && styles.requirementOk,
            ]}
          >
            • Pelo menos 8 caracteres
          </Text>
          <Text
            style={[
              styles.requirementText,
              hasLower && styles.requirementOk,
            ]}
          >
            • Pelo menos uma letra minúscula
          </Text>
          <Text
            style={[
              styles.requirementText,
              hasUpper && styles.requirementOk,
            ]}
          >
            • Pelo menos uma letra maiúscula
          </Text>
          <Text
            style={[
              styles.requirementText,
              hasNumber && styles.requirementOk,
            ]}
          >
            • Pelo menos um número
          </Text>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 16 }}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Creating your account…</Text>
          </View>
        ) : (
          <GradientButton
            title="Create account"
            onPress={handleSignup}
            style={{ marginTop: 6 }}
          />
        )}

        {/* Mensagens de erro/sucesso visuais (melhor para web/mobile web) */}
        {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
        {infoMsg && !errorMsg && (
          <Text style={styles.infoText}>{infoMsg}</Text>
        )}

        <Link href="/" style={styles.link}>
          Back to login
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
    padding: 20,
    justifyContent: "center",
  },
  title: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.surface,
    color: Colors.text,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  requirementsContainer: {
    marginTop: 4,
    marginBottom: 4,
  },
  requirementText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  requirementOk: {
    color: "#4ade80", // verdinho de OK
  },
  button: {
    borderRadius: 12,
    overflow: "hidden",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
    textAlign: "center",
  },
  link: {
    color: Colors.brandEnd,
    marginTop: 16,
    fontWeight: "600",
  },
  loadingText: {
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 6,
  },
  errorText: {
    marginTop: 10,
    color: "#f97373",
    fontSize: 13,
  },
  infoText: {
    marginTop: 10,
    color: "#4ade80",
    fontSize: 13,
  },
});
