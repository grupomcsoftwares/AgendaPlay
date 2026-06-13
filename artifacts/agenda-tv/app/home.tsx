import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Platform,
  ScrollView,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/hooks/useAuth";

const BOOKING_URL_KEY = "@agendaplay/booking_url";
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
    requiresConfig: false,
  },
  {
    id: "booking" as const,
    icon: "calendar" as const,
    title: "Tela de Agendamento",
    description: "Para clientes agendarem na barbearia",
    badge: "TV",
    color: "#60a5fa",
    url: null as string | null,
    requiresConfig: true,
  },
  {
    id: "management" as const,
    icon: "layout" as const,
    title: "Gerenciamento",
    description: "Sistema completo de gestão",
    badge: "APP",
    color: "#4ade80",
    url: `${PROD_BASE}/dashboard`,
    requiresConfig: false,
  },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [savedBookingUrl, setSavedBookingUrl] = useState("");
  const [inputUrl, setInputUrl] = useState("");
  const [showModal, setShowModal] = useState(false);
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const botPad = isWeb ? 34 : insets.bottom;

  useEffect(() => {
    AsyncStorage.getItem(BOOKING_URL_KEY).then((v) => {
      if (v) setSavedBookingUrl(v);
    });
  }, []);

  const handlePress = (mode: (typeof MODES)[number]) => {
    if (mode.requiresConfig && !savedBookingUrl) {
      setInputUrl("");
      setShowModal(true);
      return;
    }
    const url = mode.id === "booking" ? savedBookingUrl : mode.url;
    if (!url) return;
    router.push({ pathname: "/viewer", params: { url, title: mode.title } });
  };

  const handleSave = () => {
    const trimmed = inputUrl.trim();
    if (!trimmed) return;
    AsyncStorage.setItem(BOOKING_URL_KEY, trimmed).then(() => {
      setSavedBookingUrl(trimmed);
      setShowModal(false);
      router.push({ pathname: "/viewer", params: { url: trimmed, title: "Tela de Agendamento" } });
    });
  };

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
          {MODES.map((mode) => {
            const isConfigured = mode.requiresConfig ? !!savedBookingUrl : true;
            const desc = mode.id === "booking" && savedBookingUrl ? savedBookingUrl : mode.description;
            return (
              <TouchableOpacity
                key={mode.id}
                style={styles.card}
                onPress={() => handlePress(mode)}
                activeOpacity={0.7}
                testID={`mode-${mode.id}`}
              >
                <View style={[styles.iconBox, { backgroundColor: mode.color + "22" }]}>
                  <Feather name={mode.icon} size={28} color={mode.color} />
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.titleRow}>
                    <Text style={styles.cardTitle}>{mode.title}</Text>
                    <View style={[styles.badge, { backgroundColor: mode.color + "25" }]}>
                      <Text style={[styles.badgeText, { color: mode.color }]}>{mode.badge}</Text>
                    </View>
                    {mode.requiresConfig && !isConfigured && (
                      <View style={styles.setupBadge}>
                        <Text style={styles.setupText}>Configurar</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.cardDesc} numberOfLines={2}>{desc}</Text>
                </View>
                <Feather name="chevron-right" size={18} color="#555" />
              </TouchableOpacity>
            );
          })}
        </View>

        {savedBookingUrl ? (
          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => { setInputUrl(savedBookingUrl); setShowModal(true); }}
          >
            <Feather name="settings" size={13} color="#555" />
            <Text style={styles.settingsText}>Alterar URL de agendamento</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity style={styles.logoutRow} onPress={logout}>
          <Feather name="log-out" size={13} color="#555" />
          <Text style={styles.logoutText}>Sair da conta</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Link de Agendamento</Text>
            <Text style={styles.modalSub}>
              Cole o link da sua página de agendamento.{"\n"}
              Você encontra na tela Visão Geral do sistema.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="https://mcagenda.replit.app/b/sua-barbearia"
              placeholderTextColor="#555"
              value={inputUrl}
              onChangeText={setInputUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveText}>Salvar e abrir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    borderWidth: 1,
    borderColor: "#242424",
  },
  iconBox: { width: 50, height: 50, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  cardBody: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 4, flexWrap: "wrap" },
  cardTitle: { fontSize: 15, fontWeight: "600", color: "#f0f0f0" },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: "700" },
  setupBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: "#333" },
  setupText: { fontSize: 10, color: "#888" },
  cardDesc: { fontSize: 12, color: "#666", lineHeight: 17 },
  settingsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 20, justifyContent: "center" },
  settingsText: { fontSize: 12, color: "#555" },
  logoutRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, justifyContent: "center" },
  logoutText: { fontSize: 12, color: "#555" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", alignItems: "center", padding: 24 },
  modal: { backgroundColor: "#1a1a1a", borderRadius: 20, padding: 24, width: "100%", maxWidth: 420 },
  modalTitle: { fontSize: 17, fontWeight: "700", color: "#f5f5f5", marginBottom: 8 },
  modalSub: { fontSize: 13, color: "#777", marginBottom: 16, lineHeight: 19 },
  input: {
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#f5f5f5",
    fontSize: 13,
    marginBottom: 16,
  },
  modalBtns: { flexDirection: "row", gap: 10 },
  cancelBtn: { flex: 1, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: "#333", alignItems: "center" },
  cancelText: { color: "#888", fontWeight: "500" },
  saveBtn: { flex: 1, padding: 13, borderRadius: 12, backgroundColor: "#c9a84c", alignItems: "center" },
  saveText: { color: "#0f0f0f", fontWeight: "700" },
});
