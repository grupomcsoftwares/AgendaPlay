import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ScrollView,
  Pressable,
  NativeEventEmitter,
  NativeModules,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import UpdateDialog from "@/components/UpdateDialog";

const PROD_BASE = "https://mcagenda.replit.app";

const MENU_ITEMS = [
  { id: "overview",     label: "Visão Geral",    icon: "grid" as const,        url: `${PROD_BASE}/dashboard` },
  { id: "appointments", label: "Agendamentos",   icon: "list" as const,        url: `${PROD_BASE}/appointments` },
  { id: "queue",        label: "Painel de Fila", icon: "activity" as const,    url: `${PROD_BASE}/queue` },
  { id: "clients",      label: "Clientes",        icon: "user" as const,        url: `${PROD_BASE}/clients` },
  { id: "services",     label: "Serviços",        icon: "scissors" as const,    url: `${PROD_BASE}/services` },
  { id: "barbers",      label: "Barbeiros",       icon: "users" as const,       url: `${PROD_BASE}/barbers` },
  { id: "finance",      label: "Financeiro",      icon: "credit-card" as const, url: `${PROD_BASE}/financial` },
  { id: "settings",     label: "Configurações",   icon: "settings" as const,    url: `${PROD_BASE}/settings` },
];

// TV remote D-pad handler (works on Android TV via TVEventHandler native module)
function useTVRemote(onEvent: (type: string) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    try {
      // TVEventHandler exists on Android TV builds
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

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { hasUpdate, currentVersion, latestVersion, dismiss } = useUpdateCheck();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const botPad = isWeb ? 34 : insets.bottom;

  const [selectedId, setSelectedId] = useState<string>("overview");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [focusedIdx, setFocusedIdx] = useState(0);

  const handlePress = useCallback((item: (typeof MENU_ITEMS)[number]) => {
    setSelectedId(item.id);
    router.push({ pathname: "/viewer", params: { url: item.url, title: item.label } });
  }, [router]);

  useTVRemote((type) => {
    if (type === "up") {
      setFocusedIdx((prev) => {
        const next = Math.max(0, prev - 1);
        setFocusedId(MENU_ITEMS[next]?.id ?? null);
        return next;
      });
    } else if (type === "down") {
      setFocusedIdx((prev) => {
        const next = Math.min(MENU_ITEMS.length - 1, prev + 1);
        setFocusedId(MENU_ITEMS[next]?.id ?? null);
        return next;
      });
    } else if (type === "select") {
      const item = MENU_ITEMS[focusedIdx];
      if (item) handlePress(item);
    } else if (type === "back" || type === "menu") {
      router.back();
    }
  });

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: botPad + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Feather name="scissors" size={18} color="#c9a84c" />
            <Text style={styles.shopName} numberOfLines={1}>
              {user?.barbershopName || "Minha Barbearia"}
            </Text>
            <View style={styles.headerRight}>
              <Pressable
                style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnFocused]}
                onPress={() => router.back()}
                focusable
              >
                <Feather name="x" size={18} color="#c9a84c" />
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.menu}>
          {MENU_ITEMS.map((item, idx) => {
            const isSelected = selectedId === item.id;
            const isFocused = focusedId === item.id;

            return (
              <Pressable
                key={item.id}
                style={[
                  styles.menuItem,
                  isSelected && styles.menuItemSelected,
                  isFocused && !isSelected && styles.menuItemFocused,
                  isFocused && isSelected && styles.menuItemSelectedFocused,
                ]}
                onPress={() => handlePress(item)}
                onFocus={() => {
                  setFocusedId(item.id);
                  setFocusedIdx(idx);
                }}
                onBlur={() => setFocusedId((prev) => (prev === item.id ? null : prev))}
                focusable
                hasTVPreferredFocus={idx === 0}
              >
                <Feather
                  name={item.icon}
                  size={18}
                  color={isSelected ? "#0f0f0f" : isFocused ? "#c9a84c" : "#aaa"}
                />
                <Text
                  style={[
                    styles.menuLabel,
                    isSelected && styles.menuLabelSelected,
                    !isSelected && isFocused && styles.menuLabelFocused,
                  ]}
                >
                  {item.label}
                </Text>
                {isSelected && <View style={styles.selectedDot} />}
              </Pressable>
            );
          })}
        </View>
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
  content: { paddingHorizontal: 16, paddingTop: 4 },
  header: { marginBottom: 16 },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },
  shopName: { fontSize: 16, fontWeight: "700", color: "#f5f5f5", flex: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  iconBtnFocused: { borderColor: "#c9a84c", backgroundColor: "#1a1a0a" },
  menu: { gap: 2 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "transparent",
  },
  menuItemSelected: { backgroundColor: "#22c55e", borderColor: "transparent" },
  menuItemFocused: { backgroundColor: "#1a1a0a", borderColor: "#c9a84c" },
  menuItemSelectedFocused: { backgroundColor: "#22c55e", borderColor: "#fff" },
  menuLabel: { fontSize: 14, color: "#aaa", fontWeight: "500", flex: 1 },
  menuLabelSelected: { color: "#0f0f0f", fontWeight: "700" },
  menuLabelFocused: { color: "#f5f5f5", fontWeight: "600" },
  selectedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#0f0f0f", opacity: 0.5 },
});
