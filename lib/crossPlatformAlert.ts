// Cross-platform Alert that works on both native and web
// On web, Alert.alert with buttons doesn't always work correctly,
// so we fall back to window.confirm / window.alert

import { Alert, Platform } from "react-native";

type AlertButton = {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
};

export function crossAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[]
) {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons as any);
    return;
  }

  // Web fallback
  if (!buttons || buttons.length === 0) {
    window.alert(`${title}${message ? "\n\n" + message : ""}`);
    return;
  }

  if (buttons.length === 1) {
    window.alert(`${title}${message ? "\n\n" + message : ""}`);
    buttons[0].onPress?.();
    return;
  }

  // 2+ buttons: use confirm for cancel/action pattern
  const cancelBtn = buttons.find((b) => b.style === "cancel");
  const actionBtn = buttons.find((b) => b.style !== "cancel") || buttons[1];

  const confirmed = window.confirm(
    `${title}${message ? "\n\n" + message : ""}`
  );

  if (confirmed) {
    actionBtn?.onPress?.();
  } else {
    cancelBtn?.onPress?.();
  }
}
