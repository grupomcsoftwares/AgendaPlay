import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/hooks/useAuth";

export default function ViewerScreen() {
  const { url } = useLocalSearchParams<{ url: string; title: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getSessionCookie } = useAuth();
  const webViewRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showBack, setShowBack] = useState(false);
  const [cookieReady, setCookieReady] = useState(false);
  const [loadTimeout, setLoadTimeout] = useState(false);

  // Inject session cookie into CookieManager before WebView mounts
  useEffect(() => {
    const WebView = require("react-native-webview");
    const { CookieManager } = WebView;
    if (!CookieManager) {
      setCookieReady(true);
      return;
    }
    getSessionCookie().then((raw) => {
      if (!raw || !url) {
        setCookieReady(true);
        return;
      }
      const parsed = new URL(url);
      const domain = parsed.hostname;
      // Parse the raw cookie string to extract name=value and attributes
      // Example: connect.sid=xxx; Path=/; HttpOnly; Secure; SameSite=None
      const [nameValue, ...attrs] = raw.split(/;\s*/);
      const [name, value] = nameValue.split("=");
      if (!name || value === undefined) {
        setCookieReady(true);
        return;
      }
      const path = attrs.find((a) => a.toLowerCase().startsWith("path="))?.split("=")[1] ?? "/";
      const secure = attrs.some((a) => a.toLowerCase() === "secure");
      const httpOnly = attrs.some((a) => a.toLowerCase() === "httponly");
      const sameSiteAttr = attrs.find((a) => a.toLowerCase().startsWith("samesite="));
      const sameSite = sameSiteAttr ? sameSiteAttr.split("=")[1] : "Lax";

      const cookieOpts = {
        name,
        value,
        domain,
        path,
        secure,
        httpOnly,
        sameSite: sameSite as "Lax" | "Strict" | "None",
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };

      // On Android, use setFromResponse for raw Set-Cookie strings
      if (Platform.OS === "android") {
        CookieManager.setFromResponse(parsed.origin, raw)
          .then(() => {
            console.log("[CookieManager] cookie set via setFromResponse for", domain);
          })
          .catch((err: any) => {
            console.warn("[CookieManager] setFromResponse failed:", err);
          })
          .finally(() => {
            setCookieReady(true);
          });
        return;
      }

      CookieManager.set(parsed.origin, cookieOpts)
        .then(() => {
          console.log("[CookieManager] cookie set for", domain);
        })
        .catch((err: any) => {
          console.warn("[CookieManager] failed to set cookie:", err);
        })
        .finally(() => {
          setCookieReady(true);
        });
    });
  }, [getSessionCookie, url]);

  // Timeout: if loading takes > 15s, show retry option
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      setLoadTimeout(true);
    }, 15000);
    return () => clearTimeout(timer);
  }, [loading]);

  if (Platform.OS === "web") {
    return (
      <View style={styles.center}>
        <Feather name="monitor" size={48} color="#555" />
        <Text style={styles.msgText}>Disponível no app nativo Android/iOS</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
          <Text style={styles.retryText}>← Voltar</Text>
        </TouchableOpacity>
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
        <WebView
          key={url ?? "no-url"}
          ref={webViewRef}
          source={{
            uri: url ?? "",
          }}
          style={styles.webview}
        onLoadStart={() => {
          setLoading(true);
          setError(false);
          setLoadTimeout(false);
        }}
        onLoadEnd={() => {
          setLoading(false);
          setTimeout(() => setShowBack(true), 800);
        }}
        onLoadProgress={(event: any) => {
          const { progress } = event.nativeEvent;
          if (progress === 1) {
            setLoading(false);
          }
        }}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
        onHttpError={(syntheticEvent: any) => {
          const { nativeEvent } = syntheticEvent;
          if (nativeEvent.statusCode >= 400) {
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
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => {
              setError(false);
              setLoading(true);
              webViewRef.current?.reload();
            }}
          >
            <Text style={styles.retryText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      )}

      {showBack && !loading && !error && (
        <TouchableOpacity
          style={[styles.backBtn, { top: insets.top + 12 }]}
          onPress={() => router.back()}
          activeOpacity={0.8}
          testID="back-button"
        >
          <Feather name="arrow-left" size={16} color="#f5f5f5" />
        </TouchableOpacity>
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
    borderWidth: 1,
    borderColor: "#333",
  },
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
    borderWidth: 1,
    borderColor: "#333",
  },
});
