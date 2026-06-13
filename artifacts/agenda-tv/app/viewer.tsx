import React, { useState, useRef } from "react";
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

export default function ViewerScreen() {
  const { url, title } = useLocalSearchParams<{ url: string; title: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const webViewRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showBack, setShowBack] = useState(false);

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
      <WebView
        ref={webViewRef}
        source={{ uri: url ?? "" }}
        style={styles.webview}
        onLoadStart={() => {
          setLoading(true);
          setError(false);
        }}
        onLoadEnd={() => {
          setLoading(false);
          setTimeout(() => setShowBack(true), 800);
        }}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
        allowsBackForwardNavigationGestures
        sharedCookiesEnabled
        javaScriptEnabled
        domStorageEnabled
        mediaPlaybackRequiresUserAction={false}
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
