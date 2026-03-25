export type ThemeId =
  | "aurora"
  | "frost"
  | "ember"
  | "ocean"
  | "neon"
  | "midnight";

export type AppTheme = {
  id: ThemeId;
  name: string;
  colors: {
    background: string;
    backgroundAlt: string;
    surface: string;
    surfaceElevated: string;
    primary: string;
    primarySoft: string;
    accent: string;
    accentSoft: string;
    text: string;
    textMuted: string;
    border: string;
    danger: string;
    success: string;
    badge: string;
  };
  radius: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    full: number;
  };
  opacity: {
    subtle: number;
    medium: number;
    strong: number;
  };
};

export const THEMES: AppTheme[] = [
  // ── 1. AURORA ── tema claro premium, rosa/lilás (estilo Instagram light)
  {
    id: "aurora",
    name: "Aurora",
    colors: {
      background: "#F8F7FA",
      backgroundAlt: "#FFFFFF",
      surface: "#FFFFFF",
      surfaceElevated: "#F3EEFB",
      primary: "#C2185B",
      primarySoft: "rgba(194, 24, 91, 0.14)",
      accent: "#7C4DFF",
      accentSoft: "rgba(124, 77, 255, 0.14)",
      text: "#1A1A2E",
      textMuted: "#5C5470",
      border: "rgba(92, 84, 112, 0.22)",
      danger: "#E53935",
      success: "#2E7D32",
      badge: "#EDE7F6",
    },
    radius: { xs: 8, sm: 14, md: 20, lg: 24, xl: 28, full: 999 },
    opacity: { subtle: 0.08, medium: 0.18, strong: 0.3 },
  },

  // ── 2. FROST ── tema claro limpo, azul gelo (estilo Apple/clean)
  {
    id: "frost",
    name: "Frost",
    colors: {
      background: "#F0F4F8",
      backgroundAlt: "#E8EEF4",
      surface: "#FFFFFF",
      surfaceElevated: "#EAF0F7",
      primary: "#1565C0",
      primarySoft: "rgba(21, 101, 192, 0.14)",
      accent: "#0097A7",
      accentSoft: "rgba(0, 151, 167, 0.14)",
      text: "#0D1B2A",
      textMuted: "#546E7A",
      border: "rgba(84, 110, 122, 0.25)",
      danger: "#D32F2F",
      success: "#2E7D32",
      badge: "#E3F2FD",
    },
    radius: { xs: 10, sm: 14, md: 18, lg: 22, xl: 28, full: 999 },
    opacity: { subtle: 0.08, medium: 0.16, strong: 0.28 },
  },

  // ── 3. EMBER ── tema quente escuro, laranja/vermelho (estilo gaming/bold)
  {
    id: "ember",
    name: "Ember",
    colors: {
      background: "#1A0A00",
      backgroundAlt: "#120800",
      surface: "#241208",
      surfaceElevated: "#2E1A0F",
      primary: "#FF6D00",
      primarySoft: "rgba(255, 109, 0, 0.22)",
      accent: "#FFD600",
      accentSoft: "rgba(255, 214, 0, 0.18)",
      text: "#FFF3E0",
      textMuted: "#BCAAA4",
      border: "rgba(188, 170, 164, 0.35)",
      danger: "#FF5252",
      success: "#69F0AE",
      badge: "#2E1A0F",
    },
    radius: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, full: 999 },
    opacity: { subtle: 0.1, medium: 0.22, strong: 0.38 },
  },

  // ── 4. OCEAN ── tema escuro profundo, azul marinho/ciano (estilo premium)
  {
    id: "ocean",
    name: "Ocean",
    colors: {
      background: "#020C1B",
      backgroundAlt: "#011627",
      surface: "#0A1929",
      surfaceElevated: "#112240",
      primary: "#00B4D8",
      primarySoft: "rgba(0, 180, 216, 0.22)",
      accent: "#48CAE4",
      accentSoft: "rgba(72, 202, 228, 0.18)",
      text: "#E0FBFC",
      textMuted: "#8892B0",
      border: "rgba(136, 146, 176, 0.35)",
      danger: "#FF6B6B",
      success: "#00F5D4",
      badge: "#112240",
    },
    radius: { xs: 8, sm: 12, md: 18, lg: 22, xl: 26, full: 999 },
    opacity: { subtle: 0.1, medium: 0.24, strong: 0.4 },
  },

  // ── 5. NEON ── tema escuro vibrante, verde/ciano neon (estilo cyberpunk)
  {
    id: "neon",
    name: "Neon",
    colors: {
      background: "#0A0A0A",
      backgroundAlt: "#060606",
      surface: "#141414",
      surfaceElevated: "#1E1E1E",
      primary: "#00E676",
      primarySoft: "rgba(0, 230, 118, 0.20)",
      accent: "#00E5FF",
      accentSoft: "rgba(0, 229, 255, 0.18)",
      text: "#E8E8E8",
      textMuted: "#888888",
      border: "rgba(136, 136, 136, 0.30)",
      danger: "#FF1744",
      success: "#76FF03",
      badge: "#1E1E1E",
    },
    radius: { xs: 6, sm: 10, md: 14, lg: 18, xl: 22, full: 999 },
    opacity: { subtle: 0.08, medium: 0.2, strong: 0.35 },
  },

  // ── 6. MIDNIGHT ── tema escuro roxo profundo (estilo Lupyy original/Instagram dark)
  {
    id: "midnight",
    name: "Midnight",
    colors: {
      background: "#030014",
      backgroundAlt: "#05001C",
      surface: "#0C0024",
      surfaceElevated: "#14003D",
      primary: "#A855F7",
      primarySoft: "rgba(168, 85, 247, 0.26)",
      accent: "#38BDF8",
      accentSoft: "rgba(56, 189, 248, 0.24)",
      text: "#F1F0F5",
      textMuted: "#A09CB5",
      border: "rgba(129, 140, 248, 0.40)",
      danger: "#FB7185",
      success: "#22C55E",
      badge: "#0C0024",
    },
    radius: { xs: 8, sm: 12, md: 18, lg: 22, xl: 28, full: 999 },
    opacity: { subtle: 0.12, medium: 0.22, strong: 0.38 },
  },
];

export const getThemeById = (id: ThemeId): AppTheme => {
  const found = THEMES.find((t) => t.id === id);
  return found || THEMES[5]; // default: Midnight
};
