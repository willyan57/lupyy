import Colors from "@/constants/Colors";
import { Link } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function PrivacyScreen() {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Política de Privacidade</Text>
      <Text style={styles.text}>
        Em breve: aqui vamos colocar sua Política de Privacidade completa (obrigatório
        para Play Store/App Store).
      </Text>

      <Text style={styles.text}>
        Resumo (placeholder): o Lupyy coleta apenas o necessário para autenticação,
        funcionamento do feed, perfil, mensagens e armazenamento de mídia, seguindo
        boas práticas e regras de acesso (RLS) no Supabase.
      </Text>

      <View style={styles.links}>
        <Link href="/" style={styles.link}>Voltar</Link>
        <Link href="/terms" style={styles.link}>Termos de Uso</Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, gap: 12, maxWidth: 900, width: "100%", alignSelf: "center" },
  title: { color: Colors.text, fontSize: 28, fontWeight: "900" },
  text: { color: Colors.textMuted, fontSize: 14, lineHeight: 20 },
  links: { marginTop: 12, flexDirection: "row", gap: 16, flexWrap: "wrap" },
  link: { color: Colors.brandEnd, fontWeight: "800" },
});
