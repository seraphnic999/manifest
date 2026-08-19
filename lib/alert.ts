import { Alert as RNAlert, Platform } from "react-native";

interface AlertButton {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
}

// react-native-web's Alert.alert is a documented no-op (it does literally
// nothing) — every "Missing info"/error message and every Cancel/Delete
// confirmation in this app would silently fail on web. This shim keeps the
// exact same Alert.alert(title, message, buttons) call shape everywhere
// (native still delegates straight to the real thing) but falls back to
// window.alert/confirm on web. Web only supports a binary OK/Cancel choice,
// so with 2+ buttons the non-cancel one is treated as the "confirm" action.
function alert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== "web") {
    RNAlert.alert(title, message, buttons as any);
    return;
  }

  const body = [title, message].filter(Boolean).join("\n\n");

  if (!buttons || buttons.length <= 1) {
    window.alert(body);
    buttons?.[0]?.onPress?.();
    return;
  }

  const cancelButton = buttons.find((b) => b.style === "cancel");
  const actionButton = buttons.find((b) => b !== cancelButton) ?? buttons[buttons.length - 1];
  if (window.confirm(body)) {
    actionButton.onPress?.();
  } else {
    cancelButton?.onPress?.();
  }
}

export const Alert = { alert };
