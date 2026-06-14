import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ScrollView,
  Pressable,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import UpdateDialog from "@/components/UpdateDialog";

const PROD_BASE = "https://mcagenda.replit.app";

const MODES = [
  {
    id: "queue" as const,
    icon: "users" as const,
    title: "Painel de Fila",
    description: "Exibe a fila em tempo real na TV",
    badge: "TV",
    color: "#c9a84c",
    url: `${PROD_BASE}/queue`,
  },
  {
    id: "management" as const,
    icon: "layout" as const,
    title: "Gerenciamento",
    description: "Sistema completo de gestão",
    badge: "APP",
    color: "#4ade80",
    url: `${PROD_BASE}/dashboard`,
  },
];

export type HomeMode = (typeof MODES)[number];

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

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { hasUpdate, currentVersion, latestVersion, dismiss } = useUpdateCheck();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const botPad = isWeb ? 34 : insets.bottom;

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [focusedIdx, setFocusedIdx] = useState(0);

  const handlePress = useCallback((mode: HomeMode) => {
    router.push({ pathname: "/viewer", params: { url: mode.url, title: mode.title } });
  }, [router]);

  useTVRemote((type) => {
    if (type === "up") {
      setFocusedIdx((prev) => {
        const next = Math.max(0, prev - 1);
        setFocusedId(MODES[next]?.id ?? null);
        return next;
      });
    } else if (type === "down") {
      setFocusedIdx((prev) => {
        const next = Math.min(MODES.length - 1, prev + 1);
        setFocusedId(MODES[next]?.id ?? null);
        return next;
      });
    } else if (type === "select") {
      const mode = MODES[focusedIdx];
      if (mode) handlePress(mode);
    }
  });

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: botPad + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <Feather name="scissors" size={30} color="#c9a84c" />
            <Text style={styles.appName}>AgendaPlay</Text>
          </View>
          <Text style={styles.tagline}>Escolha o modo de exibição</Text>
          {user?.barbershopName ? (
            <Text style={styles.shopName}>{user.barbershopName}</Text>
          ) : null}
        </View>

        <View style={styles.cards}>
          {MODES.map((mode, idx) => {
            const isFocused = focusedId === mode.id;
            return (
              <Pressable
                key={mode.id}
                style={[
                  styles.card,
                  isFocused && { borderColor: mode.color, backgroundColor: "#1a1a1a" },
                ]}
                onPress={() => handlePress(mode)}
                onFocus={() => {
                  setFocusedId(mode.id);
                  setFocusedIdx(idx);
                }}
                onBlur={() => setFocusedId((prev) => (prev === mode.id ? null : prev))}
                focusable
                hasTVPreferredFocus={idx === 0}
                testID={`mode-${mode.id}`}
              >
                <View style={[styles.iconBox, { backgroundColor: mode.color + "22" }]}>
                  <Feather
                    name={mode.icon}
                    size={28}
                    color={isFocused ? mode.color : mode.color + "bb"}
                  />
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.cardTitle, isFocused && { color: "#fff" }]}>
                      {mode.title}
                    </Text>
                    <View style={[styles.badge, { backgroundColor: mode.color + "25" }]}>
                      <Text style={[styles.badgeText, { color: mode.color }]}>{mode.badge}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardDesc} numberOfLines={2}>{mode.description}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={isFocused ? mode.color : "#555"} />
              </Pressable>
            );
          })}
        </View>

        <Pressable
          style={({ pressed }) => [styles.logoutRow, pressed && styles.logoutFocused]}
          onPress={logout}
          focusable
        >
          {({ pressed }) => (
            <>
              <Feather name="log-out" size={13} color={pressed ? "#ef4444" : "#555"} />
              <Text style={[styles.logoutText, pressed && styles.logoutTextFocused]}>Sair da conta</Text>
            </>
          )}
        </Pressable>
      </ScrollView>

      <UpdateDialog
        visible={hasUpdate}
        currentVersion={currentVersion}
        latestVersion={latestVersion}
        onDismiss={dismiss}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0c0c0c" },
  content: { paddingHorizontal: 20, paddingTop: 4 },
  header: { marginBottom: 28 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  appName: { fontSize: 26, fontWeight: "700", color: "#f5f5f5" },
  tagline: { fontSize: 14, color: "#666" },
  shopName: { fontSize: 13, color: "#c9a84c", marginTop: 4, fontWeight: "600" },
  cards: { gap: 10 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161616",
    borderRadius: 16,
    padding: 16,
    gap: 14,
    borderWidth: 2,
    borderColor: "transparent",
  },
  iconBox: { width: 50, height: 50, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  cardBody: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 4, flexWrap: "wrap" },
  cardTitle: { fontSize: 15, fontWeight: "600", color: "#f0f0f0" },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: "700" },
  cardDesc: { fontSize: 12, color: "#666", lineHeight: 17 },
  logoutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 20,
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "transparent",
    alignSelf: "center",
  },
  logoutFocused: { borderColor: "#ef4444", backgroundColor: "#1a0a0a" },
  logoutText: { fontSize: 12, color: "#555" },
  logoutTextFocused: { color: "#ef4444", fontWeight: "600" },
});
