import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { api, type DashboardSummary } from "@/lib/api";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function StatCard({
  icon,
  label,
  value,
  color,
  colors,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  color: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[cardStyles.iconWrap, { backgroundColor: color + "20" }]}>
        <Feather name={icon} size={20} color={color} />
      </View>
      <Text style={[cardStyles.value, { color: colors.foreground }]}>{value}</Text>
      <Text style={[cardStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 8,
    minWidth: "47%",
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontSize: 22,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  label: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});

function AppointmentCard({
  title,
  appt,
  colors,
}: {
  title: string;
  appt: NonNullable<DashboardSummary["currentAppointment"]>;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[apptStyles.card, { backgroundColor: colors.card, borderColor: colors.primary + "40" }]}>
      <Text style={[apptStyles.cardTitle, { color: colors.primary }]}>{title}</Text>
      <Text style={[apptStyles.clientName, { color: colors.foreground }]}>{appt.clientName}</Text>
      <View style={apptStyles.row}>
        <Feather name="scissors" size={13} color={colors.mutedForeground} />
        <Text style={[apptStyles.detail, { color: colors.mutedForeground }]}>{appt.serviceName}</Text>
        <Feather name="clock" size={13} color={colors.mutedForeground} />
        <Text style={[apptStyles.detail, { color: colors.mutedForeground }]}>{formatTime(appt.scheduledAt)}</Text>
      </View>
    </View>
  );
}

const apptStyles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 6,
  },
  cardTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  clientName: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detail: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginRight: 8,
  },
});

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const isWeb = Platform.OS === "web";

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["dashboard"],
    queryFn: api.getDashboard,
    refetchInterval: 10000,
  });

  const handleRefresh = async () => {
    Haptics.selectionAsync();
    await refetch();
    queryClient.invalidateQueries({ queryKey: ["queue"] });
  };

  const topPad = isWeb ? 67 : insets.top;

  if (isLoading) {
    return (
      <View style={[s.root, { backgroundColor: colors.background, paddingTop: topPad + 24 }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={[s.root, s.center, { backgroundColor: colors.background, paddingTop: topPad + 24 }]}>
        <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
        <Text style={[s.errorText, { color: colors.mutedForeground }]}>Falha ao carregar</Text>
        <Pressable style={[s.retryBtn, { borderColor: colors.border }]} onPress={() => refetch()}>
          <Text style={[s.retryText, { color: colors.foreground }]}>Tentar novamente</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[s.scroll, { paddingTop: topPad + 16, paddingBottom: insets.bottom + 100 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isFetching && !isLoading}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <View style={s.headerRow}>
        <View>
          <Text style={[s.greeting, { color: colors.mutedForeground }]}>Olá,</Text>
          <Text style={[s.shopName, { color: colors.foreground }]}>{user?.barbershopName}</Text>
        </View>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            logout();
          }}
          hitSlop={12}
          testID="logout-btn"
        >
          <Feather name="log-out" size={20} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <View style={s.statsGrid}>
        <StatCard
          icon="dollar-sign"
          label="Receita do mês"
          value={formatCurrency(data.monthlyRevenue)}
          color={colors.primary}
          colors={colors}
        />
        <StatCard
          icon="calendar"
          label="Hoje"
          value={String(data.appointmentsToday)}
          color={colors.info}
          colors={colors}
        />
        <StatCard
          icon="check-circle"
          label="Concluídos"
          value={String(data.appointmentsCompleted)}
          color={colors.success}
          colors={colors}
        />
        <StatCard
          icon="users"
          label="Na fila"
          value={String(data.queueCount)}
          color={colors.warning}
          colors={colors}
        />
      </View>

      {data.currentAppointment && (
        <AppointmentCard
          title="Atendendo agora"
          appt={data.currentAppointment}
          colors={colors}
        />
      )}

      {data.nextAppointment && (
        <View style={{ marginTop: 12 }}>
          <AppointmentCard
            title="Próximo"
            appt={data.nextAppointment}
            colors={colors}
          />
        </View>
      )}

      {!data.currentAppointment && !data.nextAppointment && (
        <View style={[s.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="coffee" size={28} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>Nenhum atendimento no momento</Text>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  scroll: {
    paddingHorizontal: 20,
    gap: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  greeting: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  shopName: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    fontWeight: "700" as const,
    letterSpacing: -0.4,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  emptyBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 32,
    alignItems: "center",
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  errorText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  retryText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
});
