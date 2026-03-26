import Colors from "@/constants/Colors";
import { supabase } from "@/lib/supabase";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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
      setErrorMessage("Preencha e-mail e senha para continuar.");
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
            ? "E-mail ou senha incorretos. Verifique seus dados e tente novamente."
            : "Não foi possível entrar agora. Tente novamente.";

        setErrorMessage(message);
        runShake();
        return;
      }
    } catch (err) {
      setErrorMessage("Erro inesperado ao entrar. Tente novamente em instantes.");
      runShake();
    } finally {
      setLoading(false);
    }
  }

  const hasError = !!errorMessage;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.content}>
        <View style={styles.logoHeader}>
          <View style={styles.logoCircle}>
            <Image
              source={require("../assets/branding/lupyy-logo.png")}
              style={styles.logoImage}
              contentFit="contain"
            />
          </View>
          <Text style={styles.appName}>Lupyy</Text>
          <Text style={styles.tagline}>Compartilhe momentos. Conecte pessoas.</Text>
        </View>

        <Animated.View
          style={[
            styles.form,
            { transform: [{ translateX: shakeAnim }] },
          ]}
        >
          <TextInput
            placeholder="Email"
            placeholderTextColor={Colors.textMuted}
            style={[styles.input, hasError && styles.inputError]}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={(text) => { clearError(); setEmail(text); }}
          />

          <TextInput
            placeholder="Senha"
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
              <Text style={styles.buttonText}>ENTRAR</Text>
            )}
          </TouchableOpacity>

          <Link href="/reset" asChild>
            <TouchableOpacity style={styles.linkButton}>
              <Text style={styles.linkText}>Esqueci minha senha</Text>
            </TouchableOpacity>
          </Link>

          <Link href="/signup" asChild>
            <TouchableOpacity style={styles.linkButton}>
              <Text style={styles.linkTextBold}>Criar conta</Text>
            </TouchableOpacity>
          </Link>
        </Animated.View>

        {/* Legal links */}
        <View style={styles.legalFooter}>
          <View style={styles.legalRow}>
            <Link href="/terms" style={styles.legalLink}>
              Termos de Uso
            </Link>
            <Text style={styles.legalSep}>·</Text>
            <Link href="/privacy" style={styles.legalLink}>
              Privacidade
            </Link>
          </View>
          <Text style={styles.copyright}>© 2026 Lupyy</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    width: "100%",
    maxWidth: 900,
    paddingHorizontal: 32,
  },
  logoHeader: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  logoImage: {
    width: 80,
    height: 80,
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
  copyright: {
    color: "rgba(255,255,255,0.2)",
    fontSize: 11,
    fontWeight: "600",
  },
});
