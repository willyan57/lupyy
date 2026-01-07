import { useRouter } from "expo-router";
import { useRef } from "react";
import { PanResponder, Platform, View } from "react-native";
import TribesScreen from "../tribes";

/**
 * Tab screen wrapper for Tribos.
 *
 * This reuses the same themed TribesScreen used on the web
 * (app/tribes/index.tsx), so that:
 * - layout and cards ficam iguais no web e no APK
 * - busca de tribos funciona igual
 * - botão "Criar tribo" navega para /tribes/new
 * - todas as cores respeitam o ThemeContext escolhido no perfil
 */
export default function TribesTabScreen() {
  const router = useRouter();

  const swipeThreshold = 60;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        const { dx, dy } = gestureState;
        return Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10;
      },
      onPanResponderRelease: (_evt, gestureState) => {
        const { dx } = gestureState;
        if (dx > swipeThreshold) {
          if (Platform.OS !== "web") {
            router.replace("/(tabs)/feed");
          }
        } else if (dx < -swipeThreshold) {
          if (Platform.OS !== "web") {
            router.replace("/conversations");
          }
        }
      },
    })
  ).current;

  return (
    <View
      style={{ flex: 1 }}
      {...(Platform.OS !== "web" ? (panResponder as any).panHandlers : {})}
    >
      <TribesScreen />
    </View>
  );
}
