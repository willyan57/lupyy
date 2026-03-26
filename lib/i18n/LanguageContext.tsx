import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

import en from "./translations/en";
import es from "./translations/es";
import pt, { type TranslationKeys } from "./translations/pt";

export type Language = "pt" | "en" | "es";

const STORAGE_KEY = "lupyy_language";

const translationsMap: Record<Language, Record<TranslationKeys, string>> = {
  pt,
  en,
  es,
};

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKeys, params?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextType>({
  language: "pt",
  setLanguage: () => {},
  t: (key) => key,
});

async function loadStoredLanguage(): Promise<Language | null> {
  try {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const val = window.localStorage.getItem(STORAGE_KEY);
      if (val === "pt" || val === "en" || val === "es") return val;
      return null;
    }
    const val = await AsyncStorage.getItem(STORAGE_KEY);
    if (val === "pt" || val === "en" || val === "es") return val;
    return null;
  } catch {
    return null;
  }
}

async function persistLanguage(lang: Language) {
  try {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, lang);
      return;
    }
    await AsyncStorage.setItem(STORAGE_KEY, lang);
  } catch {}
}

function detectDeviceLanguage(): Language {
  try {
    if (Platform.OS === "web" && typeof navigator !== "undefined") {
      const browserLang = navigator.language?.toLowerCase() ?? "";
      if (browserLang.startsWith("es")) return "es";
      if (browserLang.startsWith("en")) return "en";
      return "pt";
    }
  } catch {}
  return "pt";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("pt");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadStoredLanguage().then((stored) => {
      if (stored) {
        setLanguageState(stored);
      } else {
        setLanguageState(detectDeviceLanguage());
      }
      setReady(true);
    });
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    persistLanguage(lang);

    // Update HTML lang attribute on web
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, []);

  const t = useCallback(
    (key: TranslationKeys, params?: Record<string, string | number>): string => {
      let text = translationsMap[language]?.[key] ?? translationsMap.pt[key] ?? key;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        });
      }
      return text;
    },
    [language]
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  if (!ready) return null;

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LanguageContext);
}

export default LanguageContext;
