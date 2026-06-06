import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Atenção", "Preencha e-mail e senha.");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao entrar.";
      Alert.alert("Erro", msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const s = styles(colors, insets);

  return (
    <View style={s.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.header}>
            <View style={s.iconWrap}>
              <Feather name="scissors" size={32} color={colors.primary} />
            </View>
            <Text style={s.title}>BarberApp</Text>
            <Text style={s.subtitle}>Painel do barbeiro</Text>
          </View>

          <View style={s.form}>
            <View style={s.field}>
              <Text style={s.label}>E-mail</Text>
              <View style={s.inputWrap}>
                <Feather name="mail" size={16} color={colors.mutedForeground} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="seu@email.com"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  testID="login-email"
                />
              </View>
            </View>

            <View style={s.field}>
              <Text style={s.label}>Senha</Text>
              <View style={s.inputWrap}>
                <Feather name="lock" size={16} color={colors.mutedForeground} style={s.inputIcon} />
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  testID="login-password"
                />
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                  <Feather
                    name={showPassword ? "eye-off" : "eye"}
                    size={16}
                    color={colors.mutedForeground}
                  />
                </Pressable>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [s.btn, pressed && { opacity: 0.8 }]}
              onPress={handleLogin}
              disabled={loading}
              testID="login-submit"
            >
              {loading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={s.btnText}>Entrar</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = (
  colors: ReturnType<typeof useColors>,
  insets: ReturnType<typeof useSafeAreaInsets>
) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: 24,
      paddingTop: insets.top + 40,
      paddingBottom: insets.bottom + 32,
    },
    header: {
      alignItems: "center",
      marginBottom: 48,
    },
    iconWrap: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: {
      fontSize: 28,
      fontWeight: "700" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 15,
      color: colors.mutedForeground,
      marginTop: 6,
      fontFamily: "Inter_400Regular",
    },
    form: {
      gap: 20,
    },
    field: {
      gap: 8,
    },
    label: {
      fontSize: 13,
      fontWeight: "500" as const,
      color: colors.mutedForeground,
      fontFamily: "Inter_500Medium",
      letterSpacing: 0.3,
    },
    inputWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 10,
    },
    inputIcon: {},
    input: {
      flex: 1,
      fontSize: 16,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
    },
    btn: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 16,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 8,
    },
    btnText: {
      color: colors.primaryForeground,
      fontSize: 16,
      fontWeight: "600" as const,
      fontFamily: "Inter_600SemiBold",
    },
  });
