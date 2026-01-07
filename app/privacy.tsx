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

export default function PrivacyScreen() {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <Text style={styles.kicker}>Lupyy • Política de Privacidade</Text>
          <Text style={styles.title}>Política de Privacidade</Text>
          <Text style={styles.meta}>Última atualização: 07 de janeiro de 2026</Text>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.lead}>
            Esta Política descreve como o Lupyy coleta, usa, compartilha e protege dados pessoais no aplicativo e no website.
          </Text>

          <View style={styles.linksTop}>
            <Pill label="Termos de Uso" onPress={() => router.push("/terms")} />
            <Pill label="Voltar" muted onPress={() => router.push("/")} />
          </View>
        </View>
      </View>

      <Section title="1. Dados que coletamos">
        <Bullet>Dados de conta (ex.: e-mail, identificadores de autenticação e informações básicas de perfil).</Bullet>
        <Bullet>Conteúdo que você envia (ex.: fotos, vídeos, textos, comentários e mensagens).</Bullet>
        <Bullet>Dados técnicos (ex.: logs, IP, informações do dispositivo/navegador) para segurança e estabilidade.</Bullet>
      </Section>

      <Section title="2. Como usamos os dados">
        <Bullet>Fornecer e operar o Lupyy (login, feed, perfil, mensagens, uploads).</Bullet>
        <Bullet>Melhorar desempenho, corrigir bugs e prevenir abuso/fraude.</Bullet>
        <Bullet>Cumprir obrigações legais e aplicar regras/termos.</Bullet>
      </Section>

      <Section title="3. Compartilhamento">
        <Text style={styles.text}>
          Podemos usar provedores de infraestrutura (ex.: autenticação, storage, analytics) para operar o serviço. Esses provedores
          tratam dados conforme contratos e, quando aplicável, políticas próprias.
        </Text>
      </Section>

      <Section title="4. Segurança">
        <Text style={styles.text}>
          Aplicamos medidas de segurança e controles de acesso (incluindo regras de acesso no banco quando aplicável) para reduzir riscos
          de acesso indevido.
        </Text>
      </Section>

      <Section title="5. Seus direitos">
        <Bullet>Solicitar acesso, correção e atualização de dados.</Bullet>
        <Bullet>Solicitar exclusão quando aplicável por lei.</Bullet>
        <Bullet>Revogar consentimentos quando aplicável.</Bullet>
      </Section>

      <Section title="6. Contato">
        <Text style={styles.text}>Para dúvidas ou solicitações relacionadas a privacidade:</Text>
        <Text style={styles.textStrong}>contato@lupyy.com</Text>
      </Section>

      <View style={styles.footer}>
        <View style={styles.footerLinks}>
          <Pressable onPress={() => router.push("/")}>
            <Text style={styles.footerLink}>Voltar</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/terms")}>
            <Text style={styles.footerLink}>Termos de Uso</Text>
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

  footer: { marginTop: 16, alignItems: "center", paddingTop: 6 },
  footerLinks: { flexDirection: "row", flexWrap: "wrap" },
  footerLink: { color: Colors.brandEnd, fontWeight: "900", marginHorizontal: 8, marginTop: 8 },
  footerNote: { color: Colors.textMuted, fontSize: 12, fontWeight: "800", marginTop: 10 },
});
