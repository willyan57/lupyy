import Colors from "@/constants/Colors";
import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.h2}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Pill({ label, onPress, muted }: { label: string; onPress: () => void; muted?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [muted ? styles.pillMuted : styles.pill, pressed && styles.pillPressed]}>
      <Text style={muted ? styles.pillTextMuted : styles.pillText}>{label}</Text>
    </Pressable>
  );
}

export default function TermsScreen() {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <Text style={styles.kicker}>Lupyy • Termos de Uso</Text>
          <Text style={styles.title}>Termos de Uso</Text>
          <Text style={styles.meta}>Última atualização: 07 de janeiro de 2026</Text>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.lead}>
            Estes Termos regem o uso do Lupyy (aplicativo e website). Ao criar uma conta, acessar ou usar o Lupyy, você concorda com estes Termos.
          </Text>

          <View style={styles.linksTop}>
            <Pill label="Política de Privacidade" onPress={() => router.push("/privacy")} />
            <Pill label="Voltar" muted onPress={() => router.push("/")} />
          </View>
        </View>
      </View>

      <Section title="1. Definições">
        <Bullet>“Lupyy” é a plataforma social (aplicativo, website e serviços relacionados).</Bullet>
        <Bullet>“Usuário” é qualquer pessoa que acessa ou utiliza o Lupyy.</Bullet>
        <Bullet>“Conteúdo” inclui textos, fotos, vídeos, áudios, comentários, mensagens e outros materiais.</Bullet>
      </Section>

      <Section title="2. Uso e regras">
        <Text style={styles.text}>
          Você concorda em usar o Lupyy de forma ética, segura e conforme a lei.
        </Text>
        <Bullet>Não violar direitos de terceiros, privacidade, imagem ou propriedade intelectual.</Bullet>
        <Bullet>Não praticar assédio, ameaça, discriminação ou comportamento abusivo.</Bullet>
        <Bullet>Não tentar burlar segurança, automatizar scraping ou introduzir malware.</Bullet>
      </Section>

      <Section title="3. Conteúdo e licenças">
        <Text style={styles.text}>
          Você mantém os direitos sobre o conteúdo que publica. Ao publicar no Lupyy, você concede licença necessária para hospedar,
          exibir e distribuir esse conteúdo apenas para operar e melhorar o serviço.
        </Text>
      </Section>

      <Section title="4. Privacidade">
        <Text style={styles.text}>
          O tratamento de dados pessoais é descrito na Política de Privacidade.
        </Text>
        <Pressable onPress={() => router.push("/privacy")}>
          <Text style={styles.linkInline}>Acessar Política de Privacidade</Text>
        </Pressable>
      </Section>

      <Section title="5. Contato">
        <Text style={styles.text}>Dúvidas ou comunicações legais:</Text>
        <Text style={styles.textStrong}>contato@lupyy.com</Text>
      </Section>

      <View style={styles.footer}>
        <View style={styles.footerLinks}>
          <Pressable onPress={() => router.push("/")}>
            <Text style={styles.footerLink}>Voltar</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/privacy")}>
            <Text style={styles.footerLink}>Política de Privacidade</Text>
          </Pressable>
        </View>
        <Text style={styles.footerNote}>© 2026 Lupyy</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 40, maxWidth: 980, width: "100%", alignSelf: "center" },

  hero: { marginBottom: 10 },
  heroTop: { marginBottom: 10, alignItems: "center" },
  kicker: { color: Colors.textMuted, fontSize: 12, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 },
  title: { color: Colors.text, fontSize: 34, fontWeight: "900", textAlign: "center", marginBottom: 6 },
  meta: { color: Colors.textMuted, fontSize: 12, fontWeight: "700" },

  heroCard: {
    marginTop: 6,
    borderRadius: 16,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  lead: { color: Colors.text, fontSize: 14, lineHeight: 21, fontWeight: "700", marginBottom: 12 },

  linksTop: { flexDirection: "row", flexWrap: "wrap" },

  section: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: "rgba(0,0,0,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    marginTop: 12,
  },
  sectionBody: { marginTop: 10 },

  h2: { color: Colors.text, fontSize: 18, fontWeight: "900" },

  text: { color: Colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 10 },
  textStrong: { color: Colors.text, fontSize: 14, fontWeight: "900", lineHeight: 21, marginTop: 8 },

  bulletRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 10 },
  bulletDot: { color: Colors.brandEnd, fontSize: 18, lineHeight: 21, fontWeight: "900", marginRight: 10 },

  pill: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    overflow: "hidden",
    marginRight: 10,
    marginTop: 8,
  },
  pillMuted: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    overflow: "hidden",
    marginRight: 10,
    marginTop: 8,
  },
  pillPressed: { opacity: 0.85 },
  pillText: { color: Colors.text, fontWeight: "900" },
  pillTextMuted: { color: Colors.textMuted, fontWeight: "900" },

  linkInline: { color: Colors.brandEnd, fontWeight: "900", marginTop: 10 },

  footer: { marginTop: 16, alignItems: "center", paddingTop: 6 },
  footerLinks: { flexDirection: "row", flexWrap: "wrap" },
  footerLink: { color: Colors.brandEnd, fontWeight: "900", marginHorizontal: 8, marginTop: 8 },
  footerNote: { color: Colors.textMuted, fontSize: 12, fontWeight: "800", marginTop: 10 },
});
