import type { AppTheme, ThemeId } from "@/constants/themes";
import { getThemeById } from "@/constants/themes";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type ThemeContextValue = {
  theme: AppTheme;
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "@lupyy:themeId";
const ALLOWED_THEME_IDS: ThemeId[] = ["softdream", "nebulaflow"];

function sanitizeThemeId(id: ThemeId): ThemeId {
  return ALLOWED_THEME_IDS.includes(id) ? id : "nebulaflow";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>("nebulaflow");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadTheme() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored && isMounted) {
          const candidate = stored as ThemeId;
          const safeId = sanitizeThemeId(candidate);
          setThemeIdState(safeId);
        }
      } catch (e) {
        console.warn("Failed to load theme from storage", e);
      } finally {
        if (isMounted) {
          setHydrated(true);
        }
      }
    }

    loadTheme();

    return () => {
      isMounted = false;
    };
  }, []);

  const theme = useMemo<AppTheme>(() => getThemeById(themeId), [themeId]);

  const setThemeId = (id: ThemeId) => {
    const safeId = sanitizeThemeId(id);
    setThemeIdState(safeId);
    AsyncStorage.setItem(STORAGE_KEY, safeId).catch((e) => {
      console.warn("Failed to persist theme", e);
    });
  };

  const value = useMemo(
    () => ({
      theme,
      themeId,
      setThemeId,
    }),
    [theme, themeId]
  );

  if (!hydrated) {
    return null;
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
