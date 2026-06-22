import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  BackHandler,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeepAwake } from "expo-keep-awake";
import { useAuth } from "@/hooks/useAuth";

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
  useKeepAwake();
  const { url } = useLocalSearchParams<{ url: string; title: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getSessionCookie } = useAuth();
  const webViewRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showBack, setShowBack] = useState(false);
  const [cookieReady, setCookieReady] = useState(false);
  const [backFocused, setBackFocused] = useState(false);

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
      router.back();
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
            source={{ uri: url ?? "" }}
            style={styles.webview}
            injectedJavaScript={injectedCookie || ""}
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
              style={[styles.backBtn, { top: insets.top + 12 }, backFocused && styles.backBtnFocused]}
              onPress={() => router.back()}
              onFocus={() => setBackFocused(true)}
              onBlur={() => setBackFocused(false)}
              focusable
              testID="back-button"
            >
              <Feather name="arrow-left" size={16} color={backFocused ? "#c9a84c" : "#f5f5f5"} />
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
  backBtnFocused: { borderColor: "#c9a84c", backgroundColor: "rgba(201,168,76,0.15)" },
});
