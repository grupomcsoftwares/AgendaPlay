import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ScrollView,
  Pressable,
  Dimensions,
  useWindowDimensions,
  Linking,
  Share,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import UpdateDialog from "@/components/UpdateDialog";
import { registerNativePush, unregisterNativePush } from "@/lib/nativePush";
import { isTvDevice } from "@/lib/device";

const PROD_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN || "agendaplay.net"}`;

const MENU_ITEMS = [
  { id: "overview",     label: "Vis\u00e3o Geral",    icon: "grid" as const,        url: `${PROD_BASE}/dashboard` },
  { id: "appointments", label: "Agendamentos",   icon: "list" as const,        url: `${PROD_BASE}/appointments` },
  { id: "queue",        label: "Fila ao vivo",  icon: "activity" as const,    url: `${PROD_BASE}/queue` },
  { id: "clients",      label: "Clientes",        icon: "user" as const,        url: `${PROD_BASE}/clients` },
  { id: "services",     label: "Servi\u00e7os",        icon: "scissors" as const,    url: `${PROD_BASE}/services` },
  { id: "barbers",      label: "Barbeiros",       icon: "users" as const,       url: `${PROD_BASE}/barbers` },
  { id: "finance",      label: "Financeiro",      icon: "credit-card" as const, url: `${PROD_BASE}/financial` },
  { id: "settings",     label: "Configura\u00e7\u00f5es",   icon: "settings" as const,    url: `${PROD_BASE}/settings` },
];

const TV_MENU_ITEMS = MENU_ITEMS.filter(i => i.id !== "settings");

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

function useIsTablet() {
  const { width } = useWindowDimensions();
  return width >= 600;
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { user, getSessionCookie } = useAuth();
  const { hasUpdate, currentVersion, latestVersion, apkUrl, dismiss } = useUpdateCheck();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const botPad = isWeb ? 34 : insets.bottom;
  const isTablet = useIsTablet();
  const isTV = isTvDevice(width);
  const isPhone = !isTablet && !isTV;

  const [selectedId, setSelectedId] = useState<string>("overview");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cookieReady, setCookieReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(isTablet || isTV);
  const webViewRef = useRef<WebView>(null);

  const activeMenu = isTV ? TV_MENU_ITEMS : MENU_ITEMS;
  const selectedItem = activeMenu.find((i) => i.id === selectedId) ?? activeMenu[0];

  const handlePress = useCallback((item: (typeof MENU_ITEMS)[number]) => {
    setSelectedId(item.id);
    setLoading(true);
    if (!isTablet && !isTV) setMenuOpen(false);
  }, [isTablet, isTV]);

  const bookingUrl = user?.slug
    ? `https://agendaplay.net/b/${user.slug}`
    : null;

  const handleShare = useCallback(async () => {
    if (!bookingUrl) return;
    const shopName = user?.barbershopName || "minha barbearia";
    const message = `Agende seu horário na ${shopName}:\n${bookingUrl}`;
    try {
      await Share.share({ message });
    } catch {
      // user cancelled or share not available
    }
  }, [bookingUrl, user?.barbershopName]);

  const handleNativePushMessage = useCallback(async (event: { nativeEvent: { data: string } }) => {
    let message: { type?: string; action?: "subscribe" | "unsubscribe" };
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (message.type !== "AGENDAPLAY_NATIVE_PUSH" || !message.action) return;
    const cookie = await getSessionCookie();
    const result = message.action === "subscribe"
      ? await registerNativePush(cookie)
      : await unregisterNativePush(cookie);
    const payload = JSON.stringify({ type: "AGENDAPLAY_NATIVE_PUSH_RESULT", ...result });
    webViewRef.current?.injectJavaScript(
      `window.dispatchEvent(new CustomEvent("agendaplay-native-push", { detail: ${JSON.stringify(payload)} })); true;`,
    );
  }, [getSessionCookie]);

  // Reset selection to first TV item when switching to TV mode
  useEffect(() => {
    if (isTV && selectedId === "settings") {
      setSelectedId(TV_MENU_ITEMS[0].id);
    }
  }, [isTV, selectedId]);

  // TV remote
  useTVRemote((type) => {
    if (type === "up") {
      setFocusedIdx((prev) => {
        const next = Math.max(0, prev - 1);
        setFocusedId(activeMenu[next]?.id ?? null);
        return next;
      });
    } else if (type === "down") {
      setFocusedIdx((prev) => {
        const next = Math.min(activeMenu.length - 1, prev + 1);
        setFocusedId(activeMenu[next]?.id ?? null);
        return next;
      });
    } else if (type === "select") {
      const item = activeMenu[focusedIdx];
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
          const domain = process.env.EXPO_PUBLIC_DOMAIN || "agendaplay.net";
          const cookieDomain = domain.endsWith(".replit.app") ? ".replit.app" : domain;
          setInjectedCookie(`document.cookie = "${name}=${value}; domain=${cookieDomain}; path=/;";`);
        }
      }
      setCookieReady(true);
    });
  }, [getSessionCookie]);

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      {/* Overlay when menu is open on mobile */}
      {menuOpen && !isTablet && !isTV && (
        <Pressable style={styles.overlay} onPress={() => setMenuOpen(false)} />
      )}

      {/* Sidebar: hidden completely on phones until the hamburger is pressed. */}
      {(!isPhone || menuOpen) && (
        <View
          style={[
            styles.sidebar,
            menuOpen ? styles.sidebarOpen : styles.sidebarClosed,
            isPhone && menuOpen && styles.sidebarMobileOpen,
          ]}
        >
          <View
            style={[
              styles.sidebarHeader,
              !menuOpen && styles.sidebarHeaderCollapsed,
              isPhone && menuOpen && styles.sidebarHeaderMobile,
            ]}
          >
            {menuOpen ? (
              <>
                <Feather name="scissors" size={20} color="#c9a84c" />
                <Text style={styles.shopName} numberOfLines={1}>
                  {user?.barbershopName || "AgendaPlay"}
                </Text>
                {isPhone && (
                  <Pressable
                    accessibilityLabel="Fechar menu"
                    style={styles.closeMenuButton}
                    onPress={() => setMenuOpen(false)}
                  >
                    <Feather name="x" size={20} color="#aaa" />
                  </Pressable>
                )}
              </>
            ) : (
              <Feather name="scissors" size={20} color="#c9a84c" />
            )}
          </View>
          <ScrollView
            contentContainerStyle={{ paddingBottom: botPad + 24 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.menu}>
              {activeMenu.map((item, idx) => {
                const isSelected = selectedId === item.id;
                const isFocused = focusedId === item.id;

                return (
                  <Pressable
                    key={item.id}
                    style={[
                      styles.menuItem,
                      isPhone && menuOpen && styles.menuItemMobile,
                      !menuOpen && styles.menuItemCollapsed,
                      isSelected && (menuOpen ? styles.menuItemSelected : styles.menuItemSelectedCollapsed),
                    isFocused && !isSelected && !isPhone && styles.menuItemFocused,
                    ]}
                    onPress={() => handlePress(item)}
                    onFocus={() => {
                      setFocusedId(item.id);
                      setFocusedIdx(idx);
                    }}
                    onBlur={() => setFocusedId((prev) => (prev === item.id ? null : prev))}
                    focusable={!isPhone}
                    hasTVPreferredFocus={!isPhone && idx === 0}
                  >
                    <Feather
                      name={item.icon}
                      size={18}
                      color={isSelected ? "#0f0f0f" : !isPhone && isFocused ? "#c9a84c" : "#aaa"}
                    />
                    {menuOpen && (
                      <Text
                        style={[
                          styles.menuLabel,
                          isSelected && styles.menuLabelSelected,
                          !isSelected && !isPhone && isFocused && styles.menuLabelFocused,
                        ]}
                      >
                        {item.label}
                      </Text>
                    )}
                    {menuOpen && isSelected && <View style={styles.selectedDot} />}
                  </Pressable>
                );
              })}

              {bookingUrl && !isTV && !isPhone && (
                <>
                  <View style={styles.menuDivider} />
                  <Pressable
                    style={[
                      styles.menuItem,
                      styles.shareButton,
                      !menuOpen && styles.menuItemCollapsed,
                    ]}
                    onPress={handleShare}
                  >
                    <Feather name="share-2" size={18} color="#c9a84c" />
                    {menuOpen && (
                      <Text style={styles.shareLabel}>Compartilhar link</Text>
                    )}
                  </Pressable>
                </>
              )}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Content area */}
      <View style={styles.content}>
        {/* Hamburger button (only on mobile when menu is closed) */}
        {!menuOpen && !isTablet && !isTV && (
          <Pressable
            style={styles.hamburgerBtn}
            onPress={() => setMenuOpen(true)}
          >
            <Feather name="menu" size={22} color="#c9a84c" />
          </Pressable>
        )}

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
            ref={webViewRef}
            source={{ uri: (() => {
              const u = new URL(selectedItem.url);
              u.searchParams.set("view", "mobile");
              return u.toString();
            })() }}
            style={styles.webview}
            injectedJavaScriptBeforeContentLoaded={"window.__AGENDAPLAY_MOBILE__ = true; window.__AGENDAPLAY_TV__ = false;"}
            injectedJavaScript={injectedCookie || ""}
            onMessage={handleNativePushMessage}
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
        apkUrl={apkUrl ?? undefined}
        onDismiss={dismiss}
        onUpdate={() => apkUrl && Linking.openURL(apkUrl)}
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 5,
  },
  sidebar: {
    backgroundColor: "#0f0f0f",
    borderRightWidth: 1,
    borderRightColor: "#1a1a1a",
    zIndex: 10,
  },
  sidebarOpen: {
    width: 220,
  },
  sidebarClosed: {
    width: 52,
  },
  sidebarMobileOpen: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 210,
    shadowColor: "#000",
    shadowOffset: { width: 5, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 12,
  },
  sidebarHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
    minHeight: 56,
  },
  sidebarHeaderCollapsed: {
    justifyContent: "center",
    paddingHorizontal: 0,
  },
  sidebarHeaderMobile: {
    paddingVertical: 12,
    minHeight: 52,
  },
  shopName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#f5f5f5",
    flex: 1,
  },
  closeMenuButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#1a1a1a",
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
  menuItemMobile: {
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  menuItemCollapsed: {
    justifyContent: "center",
    paddingHorizontal: 0,
  },
  menuItemSelected: {
    backgroundColor: "#c9a84c",
    borderColor: "transparent",
  },
  menuItemSelectedCollapsed: {
    backgroundColor: "#c9a84c",
    borderColor: "transparent",
    borderRadius: 8,
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
  hamburgerBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 20,
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  menuDivider: {
    height: 1,
    backgroundColor: "#1a1a1a",
    marginHorizontal: 8,
    marginVertical: 6,
  },
  shareButton: {
    borderColor: "#2a2a1a",
    borderWidth: 1,
  },
  shareLabel: {
    fontSize: 13,
    color: "#c9a84c",
    fontWeight: "600",
    flex: 1,
  },
});
