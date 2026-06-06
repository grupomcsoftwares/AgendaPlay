import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { api, type Appointment } from "@/lib/api";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function statusConfig(status: Appointment["status"], colors: ReturnType<typeof useColors>) {
  const map = {
    pending: { label: "Pendente", color: colors.warning },
    confirmed: { label: "Confirmado", color: colors.info },
    in_progress: { label: "Em atendimento", color: colors.primary },
    completed: { label: "Concluído", color: colors.success },
    cancelled: { label: "Cancelado", color: colors.mutedForeground },
  } as const;
  return map[status] ?? { label: status, color: colors.mutedForeground };
}

function AppointmentItem({
  item,
  colors,
  onStart,
  onComplete,
  onCancel,
  loadingId,
  actionId,
}: {
  item: Appointment;
  colors: ReturnType<typeof useColors>;
  onStart: (id: number) => void;
  onComplete: (id: number) => void;
  onCancel: (id: number, name: string) => void;
  loadingId: number | null;
  actionId: number | null;
}) {
  const { label, color } = statusConfig(item.status, colors);
  const isLoading = loadingId === item.id;

  return (
    <View style={[apptS.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={apptS.topRow}>
        <View style={apptS.timeWrap}>
          <Text style={[apptS.time, { color: colors.primary }]}>{formatTime(item.scheduledAt)}</Text>
        </View>
        <View style={apptS.clientInfo}>
          <Text style={[apptS.clientName, { color: colors.foreground }]}>{item.clientName}</Text>
          <Text style={[apptS.serviceText, { color: colors.mutedForeground }]}>{item.serviceName}</Text>
          {item.barberName && (
            <Text style={[apptS.barberText, { color: colors.mutedForeground }]}>
              {item.barberName}
            </Text>
          )}
        </View>
        <View style={[apptS.statusChip, { backgroundColor: color + "20" }]}>
          <Text style={[apptS.statusText, { color }]}>{label}</Text>
        </View>
      </View>

      {(item.status === "pending" || item.status === "confirmed" || item.status === "in_progress") && (
        <View style={[apptS.actions, { borderTopColor: colors.border }]}>
          {(item.status === "pending" || item.status === "confirmed") && (
            <Pressable
              style={({ pressed }) => [
                apptS.actionBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
              ]}
              onPress={() => onStart(item.id)}
              disabled={isLoading}
              testID={`appt-start-${item.id}`}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <>
                  <Feather name="play" size={13} color={colors.primaryForeground} />
                  <Text style={[apptS.actionText, { color: colors.primaryForeground }]}>Iniciar</Text>
                </>
              )}
            </Pressable>
          )}

          {item.status === "in_progress" && (
            <Pressable
              style={({ pressed }) => [
                apptS.actionBtn,
                { backgroundColor: colors.success, opacity: pressed ? 0.8 : 1 },
              ]}
              onPress={() => onComplete(item.id)}
              disabled={isLoading}
              testID={`appt-complete-${item.id}`}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="check" size={13} color="#fff" />
                  <Text style={[apptS.actionText, { color: "#fff" }]}>Concluir</Text>
                </>
              )}
            </Pressable>
          )}

          {item.status !== "in_progress" && (
            <Pressable
              style={({ pressed }) => [
                apptS.actionBtn,
                {
                  backgroundColor: colors.destructive + "20",
                  borderColor: colors.destructive + "40",
                  borderWidth: 1,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
              onPress={() => onCancel(item.id, item.clientName)}
              disabled={isLoading}
              testID={`appt-cancel-${item.id}`}
            >
              <Feather name="x" size={13} color={colors.destructive} />
              <Text style={[apptS.actionText, { color: colors.destructive }]}>Cancelar</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const apptS = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    gap: 12,
  },
  timeWrap: {
    minWidth: 50,
  },
  time: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    fontWeight: "700" as const,
  },
  clientInfo: {
    flex: 1,
    gap: 2,
  },
  clientName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
  },
  serviceText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  barberText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  statusChip: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
  },
  actions: {
    flexDirection: "row",
    borderTopWidth: 1,
    padding: 10,
    gap: 8,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 5,
  },
  actionText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    fontWeight: "500" as const,
  },
});

function getDayLabel(dateStr: string) {
  const today = new Date();
  const d = new Date(dateStr);
  const todayStr = today.toISOString().split("T")[0];
  const tmrStr = new Date(today.getTime() + 86400000).toISOString().split("T")[0];
  if (dateStr === todayStr) return "Hoje";
  if (dateStr === tmrStr) return "Amanhã";
  return formatDate(dateStr + "T12:00:00Z");
}

function buildDayOptions() {
  const days: { label: string; value: string }[] = [];
  const today = new Date();
  for (let i = -2; i <= 5; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const val = d.toISOString().split("T")[0];
    days.push({ label: getDayLabel(val!), value: val! });
  }
  return days;
}

export default function AppointmentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const isWeb = Platform.OS === "web";

  const days = buildDayOptions();
  const todayStr = new Date().toISOString().split("T")[0] ?? "";
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["appointments", selectedDate],
    queryFn: () => api.getAppointments(selectedDate),
    refetchInterval: 15000,
  });

  const startMutation = useMutation({
    mutationFn: api.startAppointment,
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setLoadingId(null);
    },
    onError: (err: Error) => { Alert.alert("Erro", err.message); setLoadingId(null); },
  });

  const completeMutation = useMutation({
    mutationFn: api.completeAppointment,
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      setLoadingId(null);
    },
    onError: (err: Error) => { Alert.alert("Erro", err.message); setLoadingId(null); },
  });

  const cancelMutation = useMutation({
    mutationFn: api.cancelAppointment,
    onSuccess: () => {
      Haptics.selectionAsync();
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setLoadingId(null);
    },
    onError: (err: Error) => { Alert.alert("Erro", err.message); setLoadingId(null); },
  });

  const topPad = isWeb ? 67 : insets.top;
  const active = (data ?? []).filter((a) => a.status !== "cancelled" && a.status !== "completed");
  const done = (data ?? []).filter((a) => a.status === "completed" || a.status === "cancelled");

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: topPad + 16, borderBottomColor: colors.border }]}>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Agendamentos</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[s.datePicker, { borderBottomColor: colors.border }]}
        style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
      >
        {days.map((day) => (
          <Pressable
            key={day.value}
            style={[
              s.dayChip,
              selectedDate === day.value
                ? { backgroundColor: colors.primary }
                : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              setSelectedDate(day.value);
            }}
          >
            <Text
              style={[
                s.dayText,
                { color: selectedDate === day.value ? colors.primaryForeground : colors.mutedForeground },
              ]}
            >
              {day.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError ? (
        <View style={s.center}>
          <Feather name="alert-circle" size={36} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>Erro ao carregar</Text>
          <Pressable onPress={() => refetch()} style={[s.retryBtn, { borderColor: colors.border }]}>
            <Text style={[s.retryText, { color: colors.foreground }]}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : (data ?? []).length === 0 ? (
        <View style={s.center}>
          <Feather name="calendar" size={40} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>Sem agendamentos neste dia</Text>
        </View>
      ) : (
        <FlatList
          data={[...active, ...done]}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100, gap: 10 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <AppointmentItem
              item={item}
              colors={colors}
              onStart={(id) => { setLoadingId(id); startMutation.mutate(id); }}
              onComplete={(id) => { setLoadingId(id); completeMutation.mutate(id); }}
              onCancel={(id, name) => {
                Alert.alert("Cancelar", `Cancelar agendamento de ${name}?`, [
                  { text: "Não", style: "cancel" },
                  { text: "Sim, cancelar", style: "destructive", onPress: () => { setLoadingId(id); cancelMutation.mutate(id); } },
                ]);
              }}
              loadingId={loadingId}
              actionId={loadingId}
            />
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    fontWeight: "700" as const,
    letterSpacing: -0.4,
  },
  datePicker: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    flexDirection: "row",
  },
  dayChip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  dayText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    fontWeight: "500" as const,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  retryText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
});
