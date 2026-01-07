/**
 * Hook de tema usando a paleta do arquivo Colors.ts
 */

import Colors from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

type Theme = "light" | "dark";
type ThemeProps = Partial<Record<Theme, string>>;

export function useThemeColor(
  props: ThemeProps,
  colorName: keyof typeof Colors
) {
  // garante que sempre será "light" ou "dark"
  const theme = (useColorScheme() ?? "light") as Theme;
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  }

  // Como nossa paleta atual é única, usamos a mesma cor para ambos os temas
  return Colors[colorName];
}
