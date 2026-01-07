import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useRef } from "react";
import { BackHandler, PanResponder, Platform, View } from "react-native";

export default function ConversationsTabPlaceholder() {
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        router.replace("/(tabs)/feed");
        return true;
      };

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress
      );

      return () => {
        subscription.remove();
      };
    }, [router])
  );

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
            router.replace("/(tabs)/tribes");
          }
        } else if (dx < -swipeThreshold) {
          if (Platform.OS !== "web") {
            router.replace("/(tabs)/search");
          }
        }
      },
    })
  ).current;

  return (
    <View
      style={{ flex: 1 }}
      {...(Platform.OS !== "web" ? (panResponder as any).panHandlers : {})}
    />
  );
}
