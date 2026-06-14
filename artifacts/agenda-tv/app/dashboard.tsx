import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import UpdateDialog from "@/components/UpdateDialog";

const PROD_BASE = "https://mcagenda.replit.app";

const MENU_ITEMS = [
  {
    id: "overview",
    label: "Visão Geral",
    icon: "grid" as const,
    url: `${PROD_BASE}/dashboard`,
  },
  {
    id: "appointments",
    label: "Agendamentos",
    icon: "list" as const,
    url: `${PROD_BASE}/dashboard/appointments`,
  },
  {
    id: "queue",
    label: "Painel de Fila",
    icon: "git-branch" as const,
    url: `${PROD_BASE}/dashboard/queue`,
  },
  {
    id: "clients",
    label: "Clientes",
    icon: "user" as const,
    url: `${PROD_BASE}/dashboard/clients`,
  },
  {
    id: "services",
    label: "Serviços",
    icon: "scissors" as const,
    url: `${PROD_BASE}/dashboard/services`,
  },
  {
    id: "barbers",
    label: "Barbeiros",
    icon: "users" as const,
    url: `${PROD_BASE}/dashboard/barbers`,
  },
  {
    id: "finance",
    label: "Financeiro",
    icon: "credit-card" as const,
    url: `${PROD_BASE}/dashboard/finance`,
  },
  {
    id: "settings",
    label: "Configurações",
    icon: "settings" as const,
    url: `${PROD_BASE}/dashboard/settings`,
  },
];

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { hasUpdate, currentVersion, latestVersion, dismiss } = useUpdateCheck();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const botPad = isWeb ? 34 : insets.bottom;

  const handlePress = (item: (typeof MENU_ITEMS)[number]) => {
    router.push({ pathname: "/viewer", params: { url: item.url, title: item.label } });
  };

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
              <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
                <Feather name="x" size={18} color="#c9a84c" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.menu}>
          {MENU_ITEMS.map((item, idx) => {
            const isActive = idx === 0;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.menuItem, isActive && styles.menuItemActive]}
                onPress={() => handlePress(item)}
                activeOpacity={0.7}
              >
                <Feather name={item.icon} size={18} color={isActive ? "#0f0f0f" : "#aaa"} />
                <Text style={[styles.menuLabel, isActive && styles.menuLabelActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
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
  shopName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#f5f5f5",
    flex: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
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
  menu: { gap: 2 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  menuItemActive: {
    backgroundColor: "#22c55e",
  },
  menuLabel: {
    fontSize: 14,
    color: "#aaa",
    fontWeight: "500",
  },
  menuLabelActive: {
    color: "#0f0f0f",
    fontWeight: "700",
  },
});
