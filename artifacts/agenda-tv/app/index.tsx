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
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import UpdateDialog from "@/components/UpdateDialog";
import { isTvDevice } from "@/lib/device";

const PROD_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN || "agendaplay.net"}`;

export default function LoginScreen() {
  const router = useRouter();
  const { user, login, loading } = useAuth();
  const { hasUpdate, currentVersion, latestVersion, apkUrl, dismiss } = useUpdateCheck();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // Auto-redirect if already logged in
  useEffect(() => {
    if (user && !loading) {
      if (isTvDevice()) {
        router.replace("/home");
      } else {
        router.replace("/dashboard");
      }
    }
  }, [user, loading, router]);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) return;
    setError("");
    try {
      await login(email.trim(), password.trim());
      if (isTvDevice()) {
        router.replace("/home");
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
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Image
          source={require("../assets/images/logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.title}>Entrar na sua conta</Text>
        <Text style={styles.subtitle}>Acesse o painel da sua barbearia</Text>

        <View style={styles.card}>
          <Text style={styles.label}>E-mail</Text>
          <View style={styles.inputRow}>
            <Feather name="mail" size={16} color="#555" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="voce@exemplo.com"
              placeholderTextColor="#555"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
          </View>

          <Text style={styles.label}>Senha</Text>
          <View style={styles.inputRow}>
            <Feather name="lock" size={16} color="#555" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
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
            style={[styles.button, (loading || !email || !password) && styles.buttonDisabled]}
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
            <Text style={styles.registerText}>
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
  logo: { width: 200, height: 200, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "700", color: "#f5f5f5", textAlign: "center", marginBottom: 6 },
  subtitle: { fontSize: 14, color: "#777", textAlign: "center", marginBottom: 24 },
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
  label: { fontSize: 13, fontWeight: "600", color: "#f0f0f0", marginBottom: 2 },
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
  inputIcon: { marginRight: 8 },
  input: {
    flex: 1,
    color: "#f5f5f5",
    fontSize: 14,
    height: 46,
  },
  error: { color: "#ef4444", fontSize: 13, textAlign: "center", marginTop: 2 },
  button: {
    backgroundColor: "#c9a84c",
    borderRadius: 14,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#0f0f0f", fontWeight: "700", fontSize: 15 },
  registerRow: { alignItems: "center", marginTop: 4 },
  registerText: { color: "#777", fontSize: 13 },
  registerLink: { color: "#c9a84c", fontWeight: "600" },
});
