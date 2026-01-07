import Colors from "@/constants/Colors";
import { supabase } from "@/lib/supabase";
import { Image } from "expo-image";
import { Link } from "expo-router";
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

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    if (!email || !password) {
      Alert.alert("Ops", "Preencha email e senha.");
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        Alert.alert("Erro ao entrar", error.message);
      }
    } catch (err) {
      Alert.alert("Erro inesperado", "Tente novamente em alguns instantes.");
    } finally {
      setLoading(false);
    }
  }

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
        </View>

        <View style={styles.form}>
          <TextInput
            placeholder="Email"
            placeholderTextColor={Colors.textMuted}
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            placeholder="Senha"
            placeholderTextColor={Colors.textMuted}
            style={styles.input}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <TouchableOpacity
            style={styles.button}
            onPress={handleSignIn}
            disabled={loading}
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
              <Text style={styles.linkText}>Criar conta</Text>
            </TouchableOpacity>
          </Link>
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
  form: {
    width: "100%",
    gap: 12,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  button: {
    marginTop: 12,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.brandStart,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  linkButton: {
    paddingVertical: 6,
    alignItems: "center",
  },
  linkText: {
    color: Colors.brandEnd,
    fontSize: 14,
  },
});
