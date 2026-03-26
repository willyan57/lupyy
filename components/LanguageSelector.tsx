import Colors from "@/constants/Colors";
import { type Language, useTranslation } from "@/lib/i18n";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity } from "react-native";

const FLAG_MAP: Record<Language, string> = {
  pt: "🇧🇷",
  en: "🇺🇸",
  es: "🇪🇸",
};

const LANGUAGES: { code: Language; flag: string; label: string }[] = [
  { code: "pt", flag: "🇧🇷", label: "Português" },
  { code: "en", flag: "🇺🇸", label: "English" },
  { code: "es", flag: "🇪🇸", label: "Español" },
];

export default function LanguageSelector() {
  const { language, setLanguage, t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setVisible(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.flag}>{FLAG_MAP[language]}</Text>
        <Text style={styles.triggerLabel}>{t(`lang.${language}` as any)}</Text>
      </TouchableOpacity>

      <Modal
        transparent
        visible={visible}
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{t("lang.title")}</Text>
            {LANGUAGES.map((lang) => {
              const isActive = language === lang.code;
              return (
                <TouchableOpacity
                  key={lang.code}
                  style={[styles.option, isActive && styles.optionActive]}
                  onPress={() => {
                    setLanguage(lang.code);
                    setVisible(false);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.optionFlag}>{lang.flag}</Text>
                  <Text style={[styles.optionLabel, isActive && styles.optionLabelActive]}>
                    {lang.label}
                  </Text>
                  {isActive && <Text style={styles.check}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 16,
  },
  flag: {
    fontSize: 18,
  },
  triggerLabel: {
    color: "#D1D5DB",
    fontSize: 13,
    fontWeight: "600",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  sheet: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#0B0F1A",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 20,
  },
  sheetTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 16,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginBottom: 6,
  },
  optionActive: {
    backgroundColor: "rgba(124,58,237,0.12)",
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.3)",
  },
  optionFlag: {
    fontSize: 24,
  },
  optionLabel: {
    flex: 1,
    color: "#D1D5DB",
    fontSize: 16,
    fontWeight: "600",
  },
  optionLabelActive: {
    color: "#FFFFFF",
  },
  check: {
    color: Colors.brandStart,
    fontSize: 18,
    fontWeight: "900",
  },
});
