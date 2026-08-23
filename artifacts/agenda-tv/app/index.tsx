import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Linking,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import UpdateDialog from "@/components/UpdateDialog";
import { isTvDevice } from "@/lib/device";
import { PROD_BASE } from "@/lib/webviewSecurity";

const QUEUE_URL = `${PROD_BASE}/queue`;

export default function LoginScreen() {
  const router = useRouter();
  const { user, login, loading } = useAuth();
  const { hasUpdate, currentVersion, latestVersion, apkUrl, dismiss } = useUpdateCheck();
  const { width } = useWindowDimensions();
  const isTV = isTvDevice(width);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // Auto-redirect if already logged in
  useEffect(() => {
    if (user && !loading) {
      if (isTV) {
        router.replace({ pathname: "/viewer", params: { url: QUEUE_URL, title: "Fila ao vivo" } });
      } else {
        router.replace("/dashboard");
      }
    }
  }, [user, loading, isTV, router]);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) return;
    setError("");
    try {
      await login(email.trim(), password.trim());
      if (isTV) {
        router.replace({ pathname: "/viewer", params: { url: QUEUE_URL, title: "Fila ao vivo" } });
      } else {
        router.replace("/dashboard");
      }
    } catch (err: any) {
      setError(err?.message || "Erro ao fazer login.");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, isTV && styles.tvScroll]}
        keyboardShouldPersistTaps="handled"
      >
        <Image
          source={require("../assets/images/logo.png")}
          style={[styles.logo, isTV && styles.tvLogo]}
          resizeMode="contain"
        />

        <Text style={[styles.title, isTV && styles.tvTitle]}>Entrar na sua conta</Text>
        <Text style={[styles.subtitle, isTV && styles.tvSubtitle]}>
          Acesse o painel da sua barbearia
        </Text>

        <View style={[styles.card, isTV && styles.tvCard]}>
          <Text style={[styles.label, isTV && styles.tvLabel]}>E-mail</Text>
          <View style={[styles.inputRow, isTV && styles.tvInputRow]}>
            <Feather
              name="mail"
              size={isTV ? 14 : 16}
              color="#555"
              style={[styles.inputIcon, isTV && styles.tvInputIcon]}
            />
            <TextInput
              style={[styles.input, isTV && styles.tvInput]}
              placeholder="voce@exemplo.com"
              placeholderTextColor="#555"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
          </View>

          <Text style={[styles.label, isTV && styles.tvLabel]}>Senha</Text>
          <View style={[styles.inputRow, isTV && styles.tvInputRow]}>
            <Feather
              name="lock"
              size={isTV ? 14 : 16}
              color="#555"
              style={[styles.inputIcon, isTV && styles.tvInputIcon]}
            />
            <TextInput
              style={[styles.input, isTV && styles.tvInput]}
              placeholder="••••••••"
              placeholderTextColor="#555"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[
              styles.button,
              isTV && styles.tvButton,
              (loading || !email || !password) && styles.buttonDisabled,
            ]}
            onPress={handleLogin}
            disabled={loading || !email || !password}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#0f0f0f" size="small" />
            ) : (
              <Text style={styles.buttonText}>Entrar no painel</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.registerRow}
            onPress={() => router.push({ pathname: "/viewer", params: { url: `${PROD_BASE}/register`, title: "Criar conta" } })}
          >
            <Text style={[styles.registerText, isTV && styles.tvRegisterText]}>
              Não tem conta? <Text style={styles.registerLink}>Criar barbearia</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <UpdateDialog
        visible={hasUpdate}
        currentVersion={currentVersion}
        latestVersion={latestVersion}
        apkUrl={apkUrl ?? undefined}
        onDismiss={dismiss}
        onUpdate={() => apkUrl && Linking.openURL(apkUrl)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0c0c0c" },
  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  tvScroll: { paddingVertical: 12 },
  logo: { width: 200, height: 200, marginBottom: 16 },
  tvLogo: { width: 100, height: 100, marginBottom: 4 },
  title: { fontSize: 22, fontWeight: "700", color: "#f5f5f5", textAlign: "center", marginBottom: 6 },
  tvTitle: { fontSize: 18, marginBottom: 2 },
  subtitle: { fontSize: 14, color: "#777", textAlign: "center", marginBottom: 24 },
  tvSubtitle: { fontSize: 11, marginBottom: 9 },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#111",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "#222",
    gap: 12,
  },
  tvCard: {
    maxWidth: 380,
    borderRadius: 13,
    padding: 14,
    gap: 6,
  },
  label: { fontSize: 13, fontWeight: "600", color: "#f0f0f0", marginBottom: 2 },
  tvLabel: { fontSize: 12 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0a0a0a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#222",
    paddingHorizontal: 12,
    height: 46,
  },
  tvInputRow: { height: 34, borderRadius: 9, paddingHorizontal: 9 },
  inputIcon: { marginRight: 8 },
  tvInputIcon: { marginRight: 6 },
  input: {
    flex: 1,
    color: "#f5f5f5",
    fontSize: 14,
    height: 46,
  },
  tvInput: { height: 34, fontSize: 12 },
  error: { color: "#ef4444", fontSize: 13, textAlign: "center", marginTop: 2 },
  button: {
    backgroundColor: "#c9a84c",
    borderRadius: 14,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  tvButton: { height: 38, borderRadius: 10, marginTop: 2 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#0f0f0f", fontWeight: "700", fontSize: 15 },
  registerRow: { alignItems: "center", marginTop: 4 },
  registerText: { color: "#777", fontSize: 13 },
  tvRegisterText: { fontSize: 11 },
  registerLink: { color: "#c9a84c", fontWeight: "600" },
});
