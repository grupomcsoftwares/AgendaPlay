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
import { WebView } from "react-native-webview";
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

// TV remote D-pad handler
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
      // Not on TV
    }
  }, []);
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, getSessionCookie } = useAuth();
  const { hasUpdate, currentVersion, latestVersion, dismiss } = useUpdateCheck();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const botPad = isWeb ? 34 : insets.bottom;

  const [selectedId, setSelectedId] = useState<string>("overview");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cookieReady, setCookieReady] = useState(false);

  const selectedItem = MENU_ITEMS.find((i) => i.id === selectedId) ?? MENU_ITEMS[0];

  const handlePress = useCallback((item: (typeof MENU_ITEMS)[number]) => {
    setSelectedId(item.id);
    setLoading(true);
  }, []);

  // TV remote
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

  // Inject session cookie into WebView
  const [injectedCookie, setInjectedCookie] = useState<string | null>(null);
  useEffect(() => {
    getSessionCookie().then((raw) => {
      if (raw) {
        const [nameValue] = raw.split(/;\s*/);
        const [name, value] = nameValue.split("=");
        if (name && value !== undefined) {
          setInjectedCookie(`document.cookie = "${name}=${value}; domain=.replit.app; path=/;";`);
        }
      }
      setCookieReady(true);
    });
  }, [getSessionCookie]);

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      {/* Sidebar */}
      <View style={styles.sidebar}>
        <View style={styles.sidebarHeader}>
          <Feather name="scissors" size={20} color="#c9a84c" />
          <Text style={styles.shopName} numberOfLines={1}>
            {user?.barbershopName || "AgendaPlay"}
          </Text>
        </View>
        <ScrollView
          contentContainerStyle={{ paddingBottom: botPad + 24 }}
          showsVerticalScrollIndicator={false}
        >
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
      </View>

      {/* Content area */}
      <View style={styles.content}>
        {loading && (
          <View style={styles.loaderOverlay}>
            <View style={styles.loaderBox}>
              <Feather name="loader" size={24} color="#c9a84c" />
              <Text style={styles.loaderText}>Carregando...</Text>
            </View>
          </View>
        )}
        {cookieReady && (
          <WebView
            source={{ uri: selectedItem.url }}
            style={styles.webview}
            injectedJavaScript={injectedCookie || ""}
            javaScriptEnabled
            domStorageEnabled
            onLoadEnd={() => setLoading(false)}
            onError={() => setLoading(false)}
            startInLoadingState={false}
          />
        )}
      </View>

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
  root: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#0c0c0c",
  },
  sidebar: {
    width: 220,
    backgroundColor: "#0f0f0f",
    borderRightWidth: 1,
    borderRightColor: "#1a1a1a",
  },
  sidebarHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  shopName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#f5f5f5",
    flex: 1,
  },
  menu: {
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 2,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  menuItemSelected: {
    backgroundColor: "#c9a84c",
    borderColor: "transparent",
  },
  menuItemFocused: {
    backgroundColor: "#1a1a0a",
    borderColor: "#c9a84c",
  },
  menuLabel: {
    fontSize: 13,
    color: "#aaa",
    fontWeight: "500",
    flex: 1,
  },
  menuLabelSelected: {
    color: "#0f0f0f",
    fontWeight: "700",
  },
  menuLabelFocused: {
    color: "#f5f5f5",
    fontWeight: "600",
  },
  selectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#0f0f0f",
    opacity: 0.5,
  },
  content: {
    flex: 1,
    backgroundColor: "#0c0c0c",
  },
  webview: {
    flex: 1,
    backgroundColor: "#0c0c0c",
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    backgroundColor: "#0c0c0c",
  },
  loaderBox: {
    alignItems: "center",
    gap: 12,
  },
  loaderText: {
    fontSize: 14,
    color: "#888",
    fontWeight: "500",
  },
});
