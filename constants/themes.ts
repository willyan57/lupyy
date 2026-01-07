export type ThemeId =
  | "softdream"
  | "glowpulse"
  | "cyberflux"
  | "purewave"
  | "playpixel"
  | "nebulaflow";

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
  {
    id: "softdream",
    name: "SoftDream",
    colors: {
      background: "#FAFAFA",
      backgroundAlt: "#FFFFFF",
      surface: "#FFFBFD",
      surfaceElevated: "#FFF0F6",
      primary: "#E1306C",
      primarySoft: "rgba(217, 76, 142, 0.18)",
      accent: "#7B5CFF",
      accentSoft: "rgba(123, 92, 255, 0.16)",
      text: "#262626",
      textMuted: "#737373",
      border: "rgba(228, 195, 209, 0.9)",
      danger: "#FF4D6D",
      success: "#22C55E",
      badge: "#FFD6E9"
    },
    radius: {
      xs: 8,
      sm: 14,
      md: 20,
      lg: 24,
      xl: 28,
      full: 999
    },
    opacity: {
      subtle: 0.08,
      medium: 0.18,
      strong: 0.3
    }
  },
  {
    id: "glowpulse",
    name: "GlowPulse",
    colors: {
      background: "#050814",
      backgroundAlt: "#070B1C",
      surface: "#0B1020",
      surfaceElevated: "#111827",
      primary: "#6C63FF",
      primarySoft: "rgba(108, 99, 255, 0.22)",
      accent: "#00D2D3",
      accentSoft: "rgba(0, 210, 211, 0.22)",
      text: "#F9FAFB",
      textMuted: "#6B7280",
      border: "rgba(148, 163, 184, 0.55)",
      danger: "#FB7185",
      success: "#22C55E",
      badge: "#111827"
    },
    radius: {
      xs: 8,
      sm: 12,
      md: 18,
      lg: 22,
      xl: 26,
      full: 999
    },
    opacity: {
      subtle: 0.1,
      medium: 0.24,
      strong: 0.4
    }
  },
  {
    id: "cyberflux",
    name: "CyberFlux",
    colors: {
      background: "#020617",
      backgroundAlt: "#02081F",
      surface: "#050B21",
      surfaceElevated: "#0F172A",
      primary: "#8B5CF6",
      primarySoft: "rgba(139, 92, 246, 0.22)",
      accent: "#22D3EE",
      accentSoft: "rgba(34, 211, 238, 0.2)",
      text: "#E5E7EB",
      textMuted: "#9CA3AF",
      border: "rgba(148, 163, 184, 0.6)",
      danger: "#F97373",
      success: "#4ADE80",
      badge: "#020617"
    },
    radius: {
      xs: 6,
      sm: 10,
      md: 16,
      lg: 20,
      xl: 24,
      full: 999
    },
    opacity: {
      subtle: 0.08,
      medium: 0.22,
      strong: 0.36
    }
  },
  {
    id: "purewave",
    name: "PureWave",
    colors: {
      background: "#F5F5F7",
      backgroundAlt: "#ECECF0",
      surface: "#FFFFFF",
      surfaceElevated: "#F9FAFB",
      primary: "#2563EB",
      primarySoft: "rgba(37, 99, 235, 0.16)",
      accent: "#6366F1",
      accentSoft: "rgba(99, 102, 241, 0.16)",
      text: "#020617",
      textMuted: "#6B7280",
      border: "rgba(148, 163, 184, 0.55)",
      danger: "#EF4444",
      success: "#16A34A",
      badge: "#E5E7EB"
    },
    radius: {
      xs: 10,
      sm: 14,
      md: 18,
      lg: 22,
      xl: 28,
      full: 999
    },
    opacity: {
      subtle: 0.08,
      medium: 0.16,
      strong: 0.28
    }
  },
  {
    id: "playpixel",
    name: "PlayPixel",
    colors: {
      background: "#0F172A",
      backgroundAlt: "#020617",
      surface: "#02081F",
      surfaceElevated: "#0B1220",
      primary: "#F97316",
      primarySoft: "rgba(249, 115, 22, 0.22)",
      accent: "#22C55E",
      accentSoft: "rgba(34, 197, 94, 0.22)",
      text: "#F9FAFB",
      textMuted: "#9CA3AF",
      border: "rgba(148, 163, 184, 0.55)",
      danger: "#FB7185",
      success: "#4ADE80",
      badge: "#0F172A"
    },
    radius: {
      xs: 4,
      sm: 8,
      md: 12,
      lg: 16,
      xl: 20,
      full: 999
    },
    opacity: {
      subtle: 0.08,
      medium: 0.2,
      strong: 0.36
    }
  },
  {
    id: "nebulaflow",
    name: "NebulaFlow",
    colors: {
      background: "#030014",
      backgroundAlt: "#05001C",
      surface: "#080022",
      surfaceElevated: "#12003A",
      primary: "#A855F7",
      primarySoft: "rgba(168, 85, 247, 0.26)",
      accent: "#38BDF8",
      accentSoft: "rgba(56, 189, 248, 0.24)",
      text: "#F9FAFB",
      textMuted: "#9CA3AF",
      border: "rgba(129, 140, 248, 0.6)",
      danger: "#FB7185",
      success: "#22C55E",
      badge: "#080022"
    },
    radius: {
      xs: 8,
      sm: 12,
      md: 18,
      lg: 22,
      xl: 28,
      full: 999
    },
    opacity: {
      subtle: 0.12,
      medium: 0.22,
      strong: 0.38
    }
  }
];

export const getThemeById = (id: ThemeId): AppTheme => {
  const found = THEMES.find(t => t.id === id);
  return found || THEMES[0];
};
