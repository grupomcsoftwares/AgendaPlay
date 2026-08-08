import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PROD_BASE } from "./webviewSecurity";

const NATIVE_TOKEN_KEY = "@agendaplay/native_push_token";

export type NativePushResult = {
  ok: boolean;
  enabled?: boolean;
  error?: string;
  errorCode?: "firebase_not_configured" | "permission_denied" | "registration_failed";
};

function getNativePushError(error: unknown): Pick<NativePushResult, "error" | "errorCode"> {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (
    /Default FirebaseApp is not initialized|FirebaseApp\.initializeApp|FCM/i.test(message)
  ) {
    return {
      errorCode: "firebase_not_configured",
      error:
        "Os alertas do Android ainda não estão configurados nesta versão do aplicativo. Instale uma versão atualizada depois que o Firebase for configurado.",
    };
  }
  return {
    errorCode: "registration_failed",
    error: "Não foi possível ativar os alertas neste dispositivo. Tente novamente.",
  };
}

export async function registerNativePush(cookie: string | null): Promise<NativePushResult> {
  if (Platform.OS !== "android" || !cookie) {
    return { ok: false, error: "Notificações nativas estão disponíveis no Android conectado." };
  }

  try {
    await Notifications.setNotificationChannelAsync("agendaplay", {
      name: "AgendaPlay",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
    });

    const current = await Notifications.getPermissionsAsync();
    const permission = current.granted
      ? current
      : await Notifications.requestPermissionsAsync();
    if (!permission.granted) {
      return {
        ok: false,
        errorCode: "permission_denied",
        error: "Permissão de notificações negada no Android.",
      };
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token = tokenResponse.data;
    const baseUrl = `${PROD_BASE}/api`;
    const response = await fetch(`${baseUrl}/push/native/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ expoPushToken: token }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      return { ok: false, error: data.error || "Não foi possível registrar o dispositivo." };
    }
    await AsyncStorage.setItem(NATIVE_TOKEN_KEY, token);
    return { ok: true, enabled: true };
  } catch (error) {
    return { ok: false, ...getNativePushError(error) };
  }
}

export async function unregisterNativePush(cookie: string | null): Promise<NativePushResult> {
  if (!cookie) return { ok: false, error: "Sessão não encontrada." };
  const token = await AsyncStorage.getItem(NATIVE_TOKEN_KEY);
  if (token) {
    const baseUrl = `${PROD_BASE}/api`;
    await fetch(`${baseUrl}/push/native/subscribe`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ expoPushToken: token }),
    }).catch(() => {});
  }
  await AsyncStorage.removeItem(NATIVE_TOKEN_KEY);
  return { ok: true, enabled: false };
}

export async function getNativePushStatus(cookie: string | null): Promise<NativePushResult> {
  if (Platform.OS !== "android" || !cookie) {
    return { ok: false, enabled: false, error: "Sessão não encontrada." };
  }

  const token = await AsyncStorage.getItem(NATIVE_TOKEN_KEY);
  if (!token) return { ok: true, enabled: false };

  try {
    const baseUrl = `${PROD_BASE}/api`;
    const response = await fetch(`${baseUrl}/push/native/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ expoPushToken: token }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      return { ok: false, enabled: false, error: data.error || "Não foi possível consultar as notificações." };
    }

    const result = await response.json() as { enabled?: boolean };
    const enabled = result.enabled === true;
    if (!enabled) await AsyncStorage.removeItem(NATIVE_TOKEN_KEY);
    return { ok: true, enabled };
  } catch (error) {
    return {
      ok: false,
      enabled: false,
      error: error instanceof Error ? error.message : "Não foi possível consultar as notificações.",
    };
  }
}