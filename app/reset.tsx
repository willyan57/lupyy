// app/reset.tsx
import Colors from "@/constants/Colors";
import { supabase } from "@/lib/supabase";
import * as Linking from "expo-linking";
import { Link, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type Mode = "request" | "reset";

export default function ResetScreen() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("request");

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [changing, setChanging] = useState(false);

  async function handleSendEmail() {
    try {
      if (!email) return;
      setSending(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: "lupyy://reset",
      });
      if (error) throw error;
      Alert.alert("Done", "We sent you an email with the reset link.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? String(e));
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    const handleUrl = async (evt: { url: string }) => {
      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(
          evt.url
        );
        if (error) {
          console.log("exchange error:", error.message);
          Alert.alert("Invalid or expired link", error.message);
          return;
        }
        if (data?.session) {
          setMode("reset");
        }
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? String(e));
      }
    };

    const sub = Linking.addEventListener("url", handleUrl);

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    return () => sub.remove();
  }, []);

  async function handleChangePassword() {
    try {
      if (!pass1 || pass1.length < 6) {
        return Alert.alert("Weak password", "Use at least 6 characters.");
      }
      if (pass1 !== pass2) {
        return Alert.alert("Attention", "Passwords do not match.");
      }
      setChanging(true);
      const { error } = await supabase.auth.updateUser({ password: pass1 });
      if (error) throw error;
      Alert.alert("Success", "Password updated.");
      router.replace("/(tabs)/feed");
    } catch (e: any) {
      Alert.alert("Error updating password", e?.message ?? String(e));
    } finally {
      setChanging(false);
    }
  }

  return (
    <View style={styles.container}>
      {mode === "request" ? (
        <>
          <Text style={styles.title}>Reset password</Text>

          <TextInput
            placeholder="Enter your e-mail"
            placeholderTextColor={Colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
          />

          <TouchableOpacity
            onPress={handleSendEmail}
            disabled={sending}
            style={[styles.button, { opacity: sending ? 0.6 : 1 }]}
          >
            <Text style={styles.buttonText}>
              {sending ? "Sending…" : "Send reset link"}
            </Text>
          </TouchableOpacity>

          <Link href="/" style={styles.link}>
            Back to login
          </Link>
        </>
      ) : (
        <>
          <Text style={styles.title}>Set new password</Text>

          <TextInput
            placeholder="New password"
            placeholderTextColor={Colors.textMuted}
            secureTextEntry
            value={pass1}
            onChangeText={setPass1}
            style={styles.input}
          />
          <TextInput
            placeholder="Confirm new password"
            placeholderTextColor={Colors.textMuted}
            secureTextEntry
            value={pass2}
            onChangeText={setPass2}
            style={styles.input}
          />

          <TouchableOpacity
            onPress={handleChangePassword}
            disabled={changing}
            style={[styles.button, { opacity: changing ? 0.6 : 1 }]}
          >
            <Text style={styles.buttonText}>
              {changing ? "Saving…" : "Save password"}
            </Text>
          </TouchableOpacity>

          <Link href="/" style={styles.link}>
            Cancel
          </Link>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: "center",
    padding: 20,
    gap: 12,
  },
  title: { color: Colors.text, fontSize: 24, fontWeight: "800", marginBottom: 8 },
  input: {
    backgroundColor: Colors.surface,
    color: Colors.text,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  button: {
    backgroundColor: Colors.brandStart,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 4,
  },
  buttonText: { color: "#fff", fontWeight: "700" },
  link: { color: Colors.brandEnd, marginTop: 12, textAlign: "center" },
});
