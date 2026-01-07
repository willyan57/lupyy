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

export default function Signup() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    if (!email || !pass) {
      Alert.alert("Erro", "Preencha o e-mail e a senha.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password: pass,
      });

      if (error) {
        Alert.alert("Erro ao criar conta", error.message);
        return;
      }

      Alert.alert(
        "Conta criada",
        "Verifique seu e-mail para confirmar o cadastro e depois faça login.",
        [{ text: "OK", onPress: () => router.replace("/") }]
      );
    } catch (e: any) {
      Alert.alert("Erro inesperado", e?.message ?? String(e));
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
});
