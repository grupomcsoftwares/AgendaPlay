import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  BackHandler,
  Linking,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/hooks/useAuth";
import { getNativePushStatus, registerNativePush, unregisterNativePush } from "@/lib/nativePush";
import { isTvDevice } from "@/lib/device";
const PROD_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN || "agendaplay.net"}`;

function useTVRemote(onEvent: (type: string) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    try {
      const TVEventHandler = (require("react-native") as any).TVEventHandler;
      if (!TVEventHandler) return;
      const handler = new TVEventHandler();
      handler.enable(null, (_: unknown, evt: { eventType: string }) => {
        onEventRef.current(evt.eventType);
      });
      return () => handler.disable();
    } catch {
      // Not on TV — ignore
    }
  }, []);
}

export default function ViewerScreen() {
  const { url } = useLocalSearchParams<{ url: string; title: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { user, getSessionCookie, logout } = useAuth();
  const webViewRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showBack, setShowBack] = useState(false);
  const [cookieReady, setCookieReady] = useState(false);
  const [backFocused, setBackFocused] = useState(false);
  const isTV = isTvDevice(width);
  const subscriptionBlocked = !!user && !user.canAccess;

  const handleExit = useCallback(async () => {
    await logout();
    router.replace("/");
  }, [logout, router]);

  const handleNativePushMessage = async (event: { nativeEvent: { data: string } }) => {
    let message: { type?: string; action?: "subscribe" | "unsubscribe" | "status" };
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (message.type !== "AGENDAPLAY_NATIVE_PUSH" || !message.action) return;
    const cookie = await getSessionCookie();
    const result = message.action === "subscribe"
      ? await registerNativePush(cookie)
      : message.action === "unsubscribe"
        ? await unregisterNativePush(cookie)
        : await getNativePushStatus(cookie);
    const payload = JSON.stringify({
      type: "AGENDAPLAY_NATIVE_PUSH_RESULT",
      operation: message.action,
      ...result,
    });
    webViewRef.current?.injectJavaScript(
      `window.dispatchEvent(new CustomEvent("agendaplay-native-push", { detail: ${JSON.stringify(payload)} })); true;`,
    );
  };

  // Hardware back button (Android) + TV remote back key
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      router.back();
      return true;
    });
    return () => sub.remove();
  }, [router]);

  // TV remote back/menu keys
  useTVRemote((type) => {
    if (type === "back" || type === "menu") {
      if (isTV) {
        void handleExit();
      } else {
        router.back();
      }
    }
  });

  // Inject session cookie via JavaScript (reliable across platforms)
  const [injectedCookie, setInjectedCookie] = useState<string | null>(null);
  useEffect(() => {
    getSessionCookie().then((raw) => {
      if (raw && url) {
        const [nameValue] = raw.split(/;\s*/);
        const [name, value] = nameValue.split("=");
        if (name && value !== undefined) {
          const parsed = new URL(url);
          const domain = parsed.hostname;
          const cookieDomain = domain.endsWith(".replit.app") ? ".replit.app" : domain;
          setInjectedCookie(`document.cookie = "${name}=${value}; domain=${cookieDomain}; path=/;";`);
        }
      }
      setCookieReady(true);
    });
  }, [getSessionCookie, url]);

  // Timeout: if loading takes > 15s, show retry option
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setLoading(false), 15000);
    return () => clearTimeout(timer);
  }, [loading]);

  if (Platform.OS === "web") {
    return (
      <View style={styles.center}>
        <Feather name="monitor" size={48} color="#555" />
        <Text style={styles.msgText}>Disponível no app nativo Android/iOS</Text>
        <Pressable style={styles.retryBtn} onPress={() => router.back()}>
          <Text style={styles.retryText}>← Voltar</Text>
        </Pressable>
      </View>
    );
  }

  if (subscriptionBlocked) {
    return (
      <View style={styles.container}>
        {isTV && (
          <Pressable
            style={[
              styles.backBtn,
              styles.backBtnTv,
              { top: insets.top + 8 },
              backFocused && styles.backBtnFocused,
            ]}
            onPress={() => void handleExit()}
            onFocus={() => setBackFocused(true)}
            onBlur={() => setBackFocused(false)}
            focusable
            hasTVPreferredFocus
            testID="tv-logout-button"
          >
            <Feather name="log-out" size={13} color={backFocused ? "#c9a84c" : "#f5f5f5"} />
            <Text style={[styles.exitText, backFocused && styles.exitTextFocused]}>Sair</Text>
          </Pressable>
        )}
        <View style={[styles.center, { paddingHorizontal: 28 }]}>
          <Feather name="lock" size={48} color="#c9a84c" />
          <Text style={[styles.msgText, { marginTop: 18, textAlign: "center" }]}>
            Assinatura expirada
          </Text>
          <Text style={[styles.loadingText, { textAlign: "center", marginTop: 10 }]}>
            A fila ao vivo está bloqueada porque a assinatura desta barbearia expirou.
          </Text>
          {!isTV && (
            <>
              <Pressable style={styles.retryBtn} onPress={() => Linking.openURL(`${PROD_BASE}/subscribe`)}>
                <Text style={styles.retryText}>Reativar assinatura</Text>
              </Pressable>
              <Pressable style={[styles.retryBtn, { marginTop: 10 }]} onPress={() => router.back()}>
                <Text style={styles.retryText}>Voltar</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }

  const WebView = require("react-native-webview").WebView;

  return (
    <View style={styles.container}>
      {!cookieReady ? (
        <View style={styles.loadingOverlay}>
          <Feather name="scissors" size={36} color="#c9a84c" />
          <ActivityIndicator size="large" color="#c9a84c" style={{ marginTop: 16 }} />
          <Text style={styles.loadingText}>Preparando sessão...</Text>
        </View>
      ) : (
        <>
          <WebView
            ref={webViewRef}
            source={{ uri: (() => {
              if (!url) return "";
              const u = new URL(url);
              u.searchParams.set("view", "mobile");
               if (isTV) u.searchParams.set("tv", "1");
              return u.toString();
            })() }}
            style={styles.webview}
            injectedJavaScriptBeforeContentLoaded={`window.__AGENDAPLAY_MOBILE__ = true; window.__AGENDAPLAY_TV__ = ${isTV ? "true" : "false"};`}
            injectedJavaScript={injectedCookie || ""}
            onMessage={handleNativePushMessage}
            onLoadStart={() => {
              setLoading(true);
              setError(false);
            }}
            onLoadEnd={() => {
              setLoading(false);
              setTimeout(() => setShowBack(true), 800);
            }}
            onLoadProgress={(event: any) => {
              if (event.nativeEvent.progress === 1) setLoading(false);
            }}
            onError={() => {
              setLoading(false);
              setError(true);
            }}
            onHttpError={(syntheticEvent: any) => {
              if (syntheticEvent.nativeEvent.statusCode >= 400) {
                setLoading(false);
                setError(true);
              }
            }}
            allowsBackForwardNavigationGestures
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            originWhitelist={["*"]}
            mixedContentMode="always"
            cacheEnabled
            cacheMode="LOAD_DEFAULT"
          />

          {loading && !error && (
            <View style={styles.loadingOverlay}>
              <Feather name="scissors" size={36} color="#c9a84c" />
              <ActivityIndicator size="large" color="#c9a84c" style={{ marginTop: 16 }} />
              <Text style={styles.loadingText}>Conectando ao sistema…</Text>
            </View>
          )}

          {error && (
            <View style={styles.center}>
              <Feather name="wifi-off" size={48} color="#555" />
              <Text style={styles.msgText}>Sem conexão com o servidor</Text>
              <Pressable
                style={[styles.retryBtn, backFocused && styles.retryBtnFocused]}
                onPress={() => {
                  setError(false);
                  setLoading(true);
                  webViewRef.current?.reload();
                }}
                onFocus={() => setBackFocused(true)}
                onBlur={() => setBackFocused(false)}
                focusable
                hasTVPreferredFocus
              >
                <Text style={styles.retryText}>Tentar novamente</Text>
              </Pressable>
            </View>
          )}

          {showBack && !loading && !error && (
            <Pressable
              style={[
                styles.backBtn,
                isTV && styles.backBtnTv,
                { top: insets.top + (isTV ? 8 : 12) },
                backFocused && styles.backBtnFocused,
              ]}
              onPress={() => (isTV ? void handleExit() : router.back())}
              onFocus={() => setBackFocused(true)}
              onBlur={() => setBackFocused(false)}
              focusable
              testID={isTV ? "tv-logout-button" : "back-button"}
            >
              <Feather
                name={isTV ? "log-out" : "arrow-left"}
                size={isTV ? 13 : 16}
                color={backFocused ? "#c9a84c" : "#f5f5f5"}
              />
              {isTV && (
                <Text style={[styles.exitText, backFocused && styles.exitTextFocused]}>Sair</Text>
              )}
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0c0c0c" },
  webview: { flex: 1 },
  center: {
    flex: 1,
    backgroundColor: "#0c0c0c",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 32,
  },
  msgText: { fontSize: 15, color: "#666", textAlign: "center", lineHeight: 22 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0c0c0c",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  loadingText: { color: "#555", fontSize: 13, marginTop: 10 },
  retryBtn: {
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#333",
  },
  retryBtnFocused: { borderColor: "#c9a84c", backgroundColor: "#1a1a0a" },
  retryText: { color: "#c9a84c", fontWeight: "600", fontSize: 14 },
  backBtn: {
    position: "absolute",
    left: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#333",
  },
  backBtnTv: {
    left: 10,
    minWidth: 28,
    height: 30,
    paddingHorizontal: 9,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1,
    borderColor: "#222",
    flexDirection: "row",
    gap: 5,
  },
  backBtnFocused: { borderColor: "#c9a84c", backgroundColor: "rgba(201,168,76,0.15)" },
  exitText: { color: "#f5f5f5", fontSize: 11, fontWeight: "600" },
  exitTextFocused: { color: "#c9a84c" },
});
