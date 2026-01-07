import { Link } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Colors from "../constants/Colors";

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.h2}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
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
            Esta Política explica como o Lupyy coleta, usa, compartilha e protege
            dados pessoais. Ao usar o Lupyy, você reconhece que leu e compreendeu
            esta Política.
          </Text>

          <View style={styles.linksTop}>
            <Link href="/terms" style={styles.pill}>
              Termos de Uso
            </Link>
            <Link href="/" style={styles.pillMuted}>
              Voltar
            </Link>
          </View>
        </View>
      </View>

      <Section title="1. Quem somos">
        <Text style={styles.text}>
          Lupyy é uma plataforma social (aplicativo e website) que permite criação de
          conta, publicação de Conteúdo (ex.: fotos e vídeos), interação social,
          mensagens e recursos relacionados.
        </Text>
        <Text style={styles.text}>
          Para fins da Lei Geral de Proteção de Dados (LGPD), o Lupyy atua como
          controlador dos dados pessoais tratados para operar a plataforma.
        </Text>
      </Section>

      <Section title="2. Dados que coletamos">
        <Text style={styles.h3}>2.1. Dados fornecidos por você</Text>
        <Bullet>Cadastro e autenticação: e-mail, senha (armazenada de forma segura pelos provedores), e dados necessários para login.</Bullet>
        <Bullet>Perfil: nome, username, bio, foto/avatar e preferências do app.</Bullet>
        <Bullet>Conteúdo e interações: publicações, comentários, curtidas, reações, mensagens e denúncias.</Bullet>

        <Text style={styles.h3}>2.2. Dados coletados automaticamente</Text>
        <Bullet>Dados técnicos: endereço IP, identificadores do dispositivo, sistema operacional, versão do app, idioma e fuso horário.</Bullet>
        <Bullet>Logs de uso: eventos de acesso, telas visitadas, performance e registros de segurança/antiabuso.</Bullet>

        <Text style={styles.h3}>2.3. Dados de terceiros</Text>
        <Text style={styles.text}>
          Quando você usa provedores de autenticação ou integrações (quando
          disponíveis), podemos receber informações limitadas do provedor
          correspondente, conforme suas configurações e permissões.
        </Text>
      </Section>

      <Section title="3. Como usamos seus dados">
        <Text style={styles.text}>
          Utilizamos dados pessoais para:
        </Text>
        <Bullet>Operar o Lupyy: autenticação, criação de conta, feed, perfil, mensagens e armazenamento de mídia.</Bullet>
        <Bullet>Personalizar experiência: preferências, recomendações básicas e melhoria de navegação.</Bullet>
        <Bullet>Segurança e integridade: prevenção de fraude, abuso, spam e proteção de usuários.</Bullet>
        <Bullet>Melhoria contínua: análise de desempenho, correção de bugs e desenvolvimento de recursos.</Bullet>
        <Bullet>Comunicações: avisos sobre conta, atualizações importantes e suporte.</Bullet>
        <Bullet>Conformidade legal: cumprir obrigações legais e responder a solicitações legítimas de autoridades.</Bullet>
      </Section>

      <Section title="4. Bases legais (LGPD)">
        <Text style={styles.text}>
          O Lupyy trata dados pessoais com fundamento, conforme aplicável, em:
        </Text>
        <Bullet>Execução de contrato: para fornecer o serviço solicitado por você.</Bullet>
        <Bullet>Legítimo interesse: para segurança, prevenção a abuso, melhoria do serviço e suporte, com avaliação de impacto e medidas de proteção.</Bullet>
        <Bullet>Consentimento: quando necessário (por exemplo, algumas permissões do dispositivo), podendo ser revogado a qualquer momento.</Bullet>
        <Bullet>Cumprimento de obrigação legal/regulatória: quando exigido.</Bullet>
      </Section>

      <Section title="5. Compartilhamento de dados">
        <Text style={styles.text}>
          O Lupyy pode compartilhar dados pessoais nas seguintes hipóteses:
        </Text>
        <Bullet>Com provedores que nos ajudam a operar o serviço (infraestrutura, banco de dados, armazenamento, analytics e monitoramento de segurança), sob contratos e obrigações de confidencialidade.</Bullet>
        <Bullet>Com outros usuários, conforme suas ações: informações do seu perfil e Conteúdo público ficam visíveis de acordo com a configuração do produto.</Bullet>
        <Bullet>Para proteção e segurança: para investigar fraudes, abusos e violações destes Termos.</Bullet>
        <Bullet>Por obrigação legal: quando requerido por lei, ordem judicial ou solicitações válidas de autoridades.</Bullet>
        <Text style={styles.text}>
          Não vendemos seus dados pessoais.
        </Text>
      </Section>

      <Section title="6. Armazenamento, retenção e exclusão">
        <Text style={styles.text}>
          Armazenamos dados pelo tempo necessário para fornecer o Lupyy, cumprir
          obrigações legais, resolver disputas e garantir segurança. Períodos podem
          variar conforme o tipo de dado e o contexto.
        </Text>
        <Text style={styles.text}>
          Quando você exclui Conteúdo ou encerra a conta (quando disponível), algumas
          informações podem permanecer em backups por período limitado, ou ser
          mantidas quando houver obrigação legal ou necessidade legítima de segurança.
        </Text>
      </Section>

      <Section title="7. Segurança">
        <Text style={styles.text}>
          Adotamos medidas técnicas e organizacionais para proteger dados pessoais,
          incluindo controles de acesso, regras de acesso (RLS) em bases de dados,
          criptografia em trânsito e práticas de segurança alinhadas ao risco.
        </Text>
        <Text style={styles.text}>
          Nenhum sistema é 100% seguro. Recomendamos que você use senha forte,
          ative recursos de segurança disponíveis e mantenha seu dispositivo protegido.
        </Text>
      </Section>

      <Section title="8. Transferências internacionais">
        <Text style={styles.text}>
          O Lupyy pode utilizar provedores e infraestrutura localizados fora do Brasil,
          o que pode implicar transferência internacional de dados. Nesses casos,
          adotamos medidas para garantir proteção adequada, conforme a LGPD, por
          meio de contratos e padrões de segurança.
        </Text>
      </Section>

      <Section title="9. Cookies e tecnologias semelhantes (web)">
        <Text style={styles.text}>
          No website, podemos usar cookies e tecnologias semelhantes para manter
          sessão, segurança e métricas básicas. Você pode gerenciar cookies nas
          configurações do navegador. Algumas funcionalidades podem não operar
          corretamente se cookies forem desativados.
        </Text>
      </Section>

      <Section title="10. Direitos do titular (LGPD)">
        <Text style={styles.text}>
          Você pode exercer direitos previstos na LGPD, como:
        </Text>
        <Bullet>Confirmação e acesso aos dados.</Bullet>
        <Bullet>Correção de dados incompletos, inexatos ou desatualizados.</Bullet>
        <Bullet>Anonimização, bloqueio ou eliminação quando aplicável.</Bullet>
        <Bullet>Portabilidade, quando aplicável.</Bullet>
        <Bullet>Informações sobre compartilhamento.</Bullet>
        <Bullet>Revogação de consentimento, quando o tratamento for baseado em consentimento.</Bullet>
        <Text style={styles.text}>
          Para solicitar, utilize o canal de contato abaixo. Podemos solicitar
          informações para confirmar sua identidade.
        </Text>
      </Section>

      <Section title="11. Privacidade de crianças e adolescentes">
        <Text style={styles.text}>
          O Lupyy não é direcionado a crianças. Se identificarmos coleta indevida de
          dados de crianças sem autorização adequada, poderemos remover o conteúdo e
          encerrar a conta correspondente.
        </Text>
      </Section>

      <Section title="12. Alterações desta Política">
        <Text style={styles.text}>
          Podemos atualizar esta Política periodicamente. Quando houver mudanças
          relevantes, poderemos notificar por meios razoáveis. A data de “última
          atualização” indica quando esta versão entrou em vigor.
        </Text>
      </Section>

      <Section title="13. Contato e Encarregado (DPO)">
        <Text style={styles.text}>
          Para dúvidas sobre privacidade, solicitações relacionadas a dados pessoais
          ou exercício de direitos, entre em contato:
        </Text>
        <Text style={styles.textStrong}>privacidade@lupyy.com</Text>
        <Text style={styles.textMutedSmall}>
          Se este e-mail ainda não estiver ativo, substitua pelo seu e-mail oficial assim
          que disponível.
        </Text>
      </Section>

      <View style={styles.footer}>
        <View style={styles.footerLinks}>
          <Link href="/" style={styles.footerLink}>
            Voltar
          </Link>
          <Link href="/terms" style={styles.footerLink}>
            Termos de Uso
          </Link>
        </View>
        <Text style={styles.footerNote}>© 2026 Lupyy</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 40, gap: 14, maxWidth: 980, width: "100%", alignSelf: "center" },

  hero: { gap: 12, marginBottom: 6 },
  heroTop: { gap: 6, alignItems: "center" },
  kicker: { color: Colors.textMuted, fontSize: 12, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
  title: { color: Colors.text, fontSize: 34, fontWeight: "900", textAlign: "center" },
  meta: { color: Colors.textMuted, fontSize: 12, fontWeight: "700" },
  heroCard: {
    marginTop: 6,
    borderRadius: 16,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 12,
  },
  lead: { color: Colors.text, fontSize: 14, lineHeight: 21, fontWeight: "700" },
  linksTop: { flexDirection: "row", gap: 10, flexWrap: "wrap" },

  section: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: "rgba(0,0,0,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    gap: 10,
  },
  sectionBody: { gap: 10 },

  h2: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  h3: { color: Colors.text, fontSize: 14, fontWeight: "900" },

  text: { color: Colors.textMuted, fontSize: 14, lineHeight: 21 },
  textStrong: { color: Colors.text, fontSize: 14, fontWeight: "900", lineHeight: 21 },
  textMutedSmall: { color: Colors.textMuted, fontSize: 12, lineHeight: 18 },

  bulletRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  bulletDot: { color: Colors.brandEnd, fontSize: 18, lineHeight: 21, fontWeight: "900" },

  pill: {
    color: Colors.text,
    fontWeight: "900",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    overflow: "hidden",
  },
  pillMuted: {
    color: Colors.textMuted,
    fontWeight: "900",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    overflow: "hidden",
  },

  footer: { marginTop: 8, alignItems: "center", gap: 12, paddingTop: 6 },
  footerLinks: { flexDirection: "row", gap: 16, flexWrap: "wrap" },
  footerLink: { color: Colors.brandEnd, fontWeight: "900" },
  footerNote: { color: Colors.textMuted, fontSize: 12, fontWeight: "800" },
});
