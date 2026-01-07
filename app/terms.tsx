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
            Estes Termos regem o uso do Lupyy (aplicativo e website). Ao criar uma conta,
            acessar ou usar o Lupyy, você concorda com estes Termos.
          </Text>

          <View style={styles.linksTop}>
            <Link href="/privacy" style={styles.pill}>
              Política de Privacidade
            </Link>
            <Link href="/" style={styles.pillMuted}>
              Voltar
            </Link>
          </View>
        </View>
      </View>

      <Section title="1. Definições">
        <Bullet>
          <Text style={styles.textStrong}>“Lupyy”</Text> é a plataforma social
          (aplicativo, website e serviços relacionados).
        </Bullet>
        <Bullet>
          <Text style={styles.textStrong}>“Usuário”</Text> é qualquer pessoa que
          acessa ou utiliza o Lupyy.
        </Bullet>
        <Bullet>
          <Text style={styles.textStrong}>“Conteúdo”</Text> inclui textos, fotos,
          vídeos, áudios, comentários, mensagens, reações, links e outros materiais.
        </Bullet>
        <Bullet>
          <Text style={styles.textStrong}>“Conta”</Text> é o cadastro do Usuário
          para autenticação e uso de recursos do Lupyy.
        </Bullet>
      </Section>

      <Section title="2. Elegibilidade e conta">
        <Text style={styles.text}>
          Você declara que tem capacidade legal para aceitar estes Termos. Se você
          for menor de idade, deve usar o Lupyy apenas com autorização e supervisão
          de um responsável legal, conforme a legislação aplicável.
        </Text>
        <Text style={styles.text}>
          Você é responsável por manter a confidencialidade das suas credenciais e
          por todas as atividades realizadas na sua Conta. Avise-nos imediatamente
          se suspeitar de uso não autorizado.
        </Text>
      </Section>

      <Section title="3. Uso permitido e regras da comunidade">
        <Text style={styles.text}>
          O Lupyy é uma plataforma para interação social e compartilhamento de
          Conteúdo. Você concorda em usar o Lupyy de forma ética, segura e em
          conformidade com a lei.
        </Text>

        <Text style={styles.h3}>3.1. Você não pode</Text>
        <Bullet>Violar leis, regulamentos, decisões judiciais ou direitos de terceiros.</Bullet>
        <Bullet>Publicar ou enviar Conteúdo ilegal, fraudulento, enganoso ou que incentive atividades ilícitas.</Bullet>
        <Bullet>Praticar assédio, intimidação, ameaça, perseguição, discurso de ódio ou discriminação.</Bullet>
        <Bullet>Explorar sexualmente, expor ou colocar em risco menores de idade.</Bullet>
        <Bullet>Compartilhar material que infrinja direitos autorais, marcas, imagem, privacidade ou outros direitos.</Bullet>
        <Bullet>Coletar dados de outros usuários por scraping, bots, engenharia reversa ou meios automatizados não autorizados.</Bullet>
        <Bullet>Interferir no funcionamento do Lupyy, contornar segurança, testar vulnerabilidades ou introduzir malware.</Bullet>
        <Bullet>Vender, alugar, sublicenciar ou transferir o acesso ao Lupyy sem autorização.</Bullet>

        <Text style={styles.h3}>3.2. Segurança e integridade</Text>
        <Text style={styles.text}>
          Para proteger a comunidade, o Lupyy pode implementar limites, medidas
          antiabuso, detecção de comportamento suspeito e ações de moderação,
          inclusive remoção de Conteúdo, restrição de recursos e suspensão de contas.
        </Text>
      </Section>

      <Section title="4. Conteúdo do usuário e licenças">
        <Text style={styles.text}>
          Você mantém os direitos sobre o Conteúdo que publica. Porém, ao publicar
          ou enviar Conteúdo no Lupyy, você concede ao Lupyy uma licença mundial,
          não exclusiva, gratuita, transferível e sublicenciável para hospedar,
          armazenar, reproduzir, distribuir, exibir, executar, adaptar (por exemplo,
          para redimensionar, comprimir, criar miniaturas) e disponibilizar esse
          Conteúdo exclusivamente para operar, desenvolver e fornecer o Lupyy.
        </Text>
        <Text style={styles.text}>
          Você garante que tem todos os direitos necessários para publicar o Conteúdo
          e que ele não viola direitos de terceiros.
        </Text>
      </Section>

      <Section title="5. Propriedade intelectual do Lupyy">
        <Text style={styles.text}>
          O Lupyy, seu software, design, identidade visual, marcas, logotipos e
          demais elementos são protegidos por leis de propriedade intelectual. Você
          não pode copiar, modificar, distribuir, vender, alugar ou explorar qualquer
          parte do Lupyy sem autorização.
        </Text>
      </Section>

      <Section title="6. Serviços de terceiros">
        <Text style={styles.text}>
          O Lupyy pode integrar serviços de terceiros (por exemplo, provedores de
          autenticação, infraestrutura, analytics, armazenamento e pagamentos). O
          uso desses serviços pode estar sujeito a termos e políticas próprios, e o
          Lupyy não controla práticas de terceiros fora do seu ambiente.
        </Text>
      </Section>

      <Section title="7. Remoção de conteúdo, denúncias e medidas de moderação">
        <Text style={styles.text}>
          Podemos, a nosso critério e conforme a lei, remover ou restringir Conteúdo
          e contas quando houver violação destes Termos, suspeita de fraude, risco à
          segurança, ou para cumprir obrigações legais.
        </Text>
        <Text style={styles.text}>
          Se você acredita que um Conteúdo viola seus direitos (inclusive direitos
          autorais ou imagem), recomendamos que faça uma denúncia dentro da
          plataforma (quando disponível) e/ou entre em contato pelo canal indicado
          na seção “Contato”.
        </Text>
      </Section>

      <Section title="8. Privacidade">
        <Text style={styles.text}>
          O tratamento de dados pessoais no Lupyy é descrito na nossa Política de
          Privacidade. Ao usar o Lupyy, você declara que leu e compreendeu a Política.
        </Text>
        <View style={styles.linksInline}>
          <Link href="/privacy" style={styles.linkInline}>
            Acessar Política de Privacidade
          </Link>
        </View>
      </Section>

      <Section title="9. Suspensão, encerramento e efeitos">
        <Text style={styles.text}>
          Você pode encerrar sua Conta a qualquer momento conforme as opções
          disponíveis na plataforma. O Lupyy pode suspender ou encerrar sua Conta
          nas hipóteses previstas nestes Termos e/ou por obrigação legal.
        </Text>
        <Text style={styles.text}>
          Encerrada a Conta, algumas informações podem ser retidas por período
          necessário para cumprir obrigações legais, resolver disputas, aplicar estes
          Termos e manter a segurança do serviço, conforme descrito na Política de
          Privacidade.
        </Text>
      </Section>

      <Section title="10. Isenções e limitações de responsabilidade">
        <Text style={styles.text}>
          O Lupyy é disponibilizado “no estado em que se encontra” e “conforme
          disponível”. Embora trabalhemos para oferecer estabilidade e segurança, não
          garantimos que o Lupyy será ininterrupto ou livre de falhas.
        </Text>
        <Text style={styles.text}>
          Na máxima extensão permitida por lei, o Lupyy não se responsabiliza por:
        </Text>
        <Bullet>Conteúdo publicado por usuários ou por terceiros.</Bullet>
        <Bullet>Perdas indiretas, lucros cessantes, interrupção de negócios ou danos consequenciais.</Bullet>
        <Bullet>Eventos fora do controle razoável do Lupyy (falhas de rede, energia, indisponibilidade de serviços de terceiros, caso fortuito/força maior).</Bullet>
        <Text style={styles.text}>
          Nada nestes Termos exclui responsabilidades que não possam ser excluídas
          por lei, incluindo direitos do consumidor quando aplicáveis.
        </Text>
      </Section>

      <Section title="11. Indenização">
        <Text style={styles.text}>
          Você concorda em indenizar e manter o Lupyy isento de reclamações, danos,
          perdas e despesas (incluindo honorários advocatícios razoáveis) decorrentes
          de: (i) seu uso do Lupyy; (ii) seu Conteúdo; (iii) violação destes Termos; ou
          (iv) violação de direitos de terceiros.
        </Text>
      </Section>

      <Section title="12. Alterações no serviço e nos Termos">
        <Text style={styles.text}>
          Podemos alterar, suspender ou descontinuar funcionalidades do Lupyy a
          qualquer momento, buscando minimizar impactos. Podemos também atualizar
          estes Termos. Quando as alterações forem relevantes, podemos notificar
          você por meios razoáveis (por exemplo, aviso na plataforma).
        </Text>
        <Text style={styles.text}>
          O uso continuado do Lupyy após a atualização indica aceitação da versão
          vigente dos Termos.
        </Text>
      </Section>

      <Section title="13. Lei aplicável e foro">
        <Text style={styles.text}>
          Estes Termos são regidos pelas leis da República Federativa do Brasil. Salvo
          disposição legal obrigatória em sentido diverso, fica eleito o foro do seu
          domicílio para dirimir eventuais controvérsias.
        </Text>
      </Section>

      <Section title="14. Contato">
        <Text style={styles.text}>
          Para dúvidas, solicitações ou comunicações legais relacionadas a estes
          Termos, utilize o canal oficial indicado na plataforma ou envie e-mail para:
        </Text>
        <Text style={styles.textStrong}>contato@lupyy.com</Text>
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
          <Link href="/privacy" style={styles.footerLink}>
            Política de Privacidade
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

  linksInline: { flexDirection: "row", flexWrap: "wrap" },
  linkInline: { color: Colors.brandEnd, fontWeight: "900" },

  footer: { marginTop: 8, alignItems: "center", gap: 12, paddingTop: 6 },
  footerLinks: { flexDirection: "row", gap: 16, flexWrap: "wrap" },
  footerLink: { color: Colors.brandEnd, fontWeight: "900" },
  footerNote: { color: Colors.textMuted, fontSize: 12, fontWeight: "800" },
});
