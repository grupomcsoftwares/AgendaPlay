import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { api, type FinancialSummary } from "@/lib/api";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

function MonthPicker({
  month,
  year,
  onPrev,
  onNext,
  colors,
}: {
  month: number;
  year: number;
  onPrev: () => void;
  onNext: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const now = new Date();
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  return (
    <View style={[mp.row, { borderBottomColor: colors.border }]}>
      <Pressable onPress={onPrev} hitSlop={12}>
        <Feather name="chevron-left" size={22} color={colors.foreground} />
      </Pressable>
      <Text style={[mp.label, { color: colors.foreground }]}>
        {MONTHS[month - 1]} {year}
      </Text>
      <Pressable onPress={onNext} hitSlop={12} disabled={isCurrentMonth} style={{ opacity: isCurrentMonth ? 0.3 : 1 }}>
        <Feather name="chevron-right" size={22} color={colors.foreground} />
      </Pressable>
    </View>
  );
}

const mp = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  label: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
  },
});

function StatRow({
  label,
  value,
  icon,
  iconColor,
  colors,
}: {
  label: string;
  value: string;
  icon: keyof typeof Feather.glyphMap;
  iconColor: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[sr.row, { borderBottomColor: colors.border }]}>
      <View style={[sr.iconWrap, { backgroundColor: iconColor + "20" }]}>
        <Feather name={icon} size={16} color={iconColor} />
      </View>
      <Text style={[sr.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[sr.value, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

const sr = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  value: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
  },
});

function ServiceBar({
  name,
  revenue,
  maxRevenue,
  count,
  colors,
}: {
  name: string;
  revenue: number;
  maxRevenue: number;
  count: number;
  colors: ReturnType<typeof useColors>;
}) {
  const pct = maxRevenue > 0 ? (revenue / maxRevenue) * 100 : 0;
  return (
    <View style={sb.wrap}>
      <View style={sb.header}>
        <Text style={[sb.name, { color: colors.foreground }]}>{name}</Text>
        <Text style={[sb.revenue, { color: colors.primary }]}>{formatCurrency(revenue)}</Text>
      </View>
      <View style={[sb.track, { backgroundColor: colors.border }]}>
        <View style={[sb.fill, { width: `${pct}%` as `${number}%`, backgroundColor: colors.primary }]} />
      </View>
      <Text style={[sb.count, { color: colors.mutedForeground }]}>{count} atendimento{count !== 1 ? "s" : ""}</Text>
    </View>
  );
}

const sb = StyleSheet.create({
  wrap: { gap: 6 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 14, fontFamily: "Inter_500Medium", fontWeight: "500" as const, flex: 1 },
  revenue: { fontSize: 14, fontFamily: "Inter_600SemiBold", fontWeight: "600" as const },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
  count: { fontSize: 12, fontFamily: "Inter_400Regular" },
});

export default function FinancialScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const goToPrev = () => {
    Haptics.selectionAsync();
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const goToNext = () => {
    Haptics.selectionAsync();
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const { data, isLoading, isError, refetch } = useQuery<FinancialSummary>({
    queryKey: ["financial", month, year],
    queryFn: () => api.getFinancialSummary(month, year),
  });

  const topPad = isWeb ? 67 : insets.top;
  const maxRevenue = Math.max(...(data?.revenueByService.map((s) => s.revenue) ?? [0]));

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: topPad + 16, borderBottomColor: colors.border }]}>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Financeiro</Text>
      </View>

      <MonthPicker month={month} year={year} onPrev={goToPrev} onNext={goToNext} colors={colors} />

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
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 100, gap: 24 }}
        >
          <View style={[s.heroCard, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
            <Text style={[s.heroLabel, { color: colors.primary }]}>Receita total</Text>
            <Text style={[s.heroValue, { color: colors.foreground }]}>
              {formatCurrency(data?.totalRevenue ?? 0)}
            </Text>
          </View>

          <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <StatRow
              icon="scissors"
              label="Atendimentos"
              value={String(data?.totalAppointments ?? 0)}
              iconColor={colors.info}
              colors={colors}
            />
            <StatRow
              icon="trending-up"
              label="Ticket médio"
              value={formatCurrency(data?.averageTicket ?? 0)}
              iconColor={colors.primary}
              colors={colors}
            />
          </View>

          {(data?.revenueByService.length ?? 0) > 0 && (
            <View>
              <Text style={[s.sectionTitle, { color: colors.foreground }]}>Receita por serviço</Text>
              <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border, gap: 16, padding: 16 }]}>
                {data?.revenueByService.map((svc) => (
                  <ServiceBar
                    key={svc.serviceName}
                    name={svc.serviceName}
                    revenue={svc.revenue}
                    maxRevenue={maxRevenue}
                    count={svc.count}
                    colors={colors}
                  />
                ))}
              </View>
            </View>
          )}

          {(data?.totalAppointments ?? 0) === 0 && (
            <View style={s.empty}>
              <Feather name="bar-chart-2" size={40} color={colors.mutedForeground} />
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
                Sem dados para {MONTHS[(month - 1)]} {year}
              </Text>
            </View>
          )}
        </ScrollView>
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  heroCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  heroLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    fontWeight: "500" as const,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  heroValue: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    fontWeight: "700" as const,
    letterSpacing: -1,
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    marginBottom: 12,
  },
  empty: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 24,
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
