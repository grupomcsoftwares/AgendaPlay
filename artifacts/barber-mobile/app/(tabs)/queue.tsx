import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { api, type QueueEntry } from "@/lib/api";

function statusLabel(status: QueueEntry["status"]) {
  if (status === "waiting") return "Aguardando";
  if (status === "in_progress") return "Atendendo";
  return "Concluído";
}

function statusColor(status: QueueEntry["status"], colors: ReturnType<typeof useColors>) {
  if (status === "in_progress") return colors.primary;
  if (status === "waiting") return colors.warning;
  return colors.mutedForeground;
}

function QueueCard({
  entry,
  colors,
  onStart,
  onRemove,
  startLoading,
  removeLoading,
}: {
  entry: QueueEntry;
  colors: ReturnType<typeof useColors>;
  onStart: () => void;
  onRemove: () => void;
  startLoading: boolean;
  removeLoading: boolean;
}) {
  const isInProgress = entry.status === "in_progress";
  const color = statusColor(entry.status, colors);

  return (
    <View
      style={[
        s.card,
        {
          backgroundColor: colors.card,
          borderColor: isInProgress ? colors.primary + "60" : colors.border,
          borderWidth: isInProgress ? 1.5 : 1,
        },
      ]}
    >
      <View style={s.cardLeft}>
        <View style={[s.positionBadge, { backgroundColor: color + "20" }]}>
          <Text style={[s.positionText, { color }]}>{entry.position}</Text>
        </View>
        <View style={s.cardInfo}>
          <Text style={[s.clientName, { color: colors.foreground }]}>{entry.clientName}</Text>
          <Text style={[s.serviceName, { color: colors.mutedForeground }]}>{entry.serviceName}</Text>
          <View style={s.statusRow}>
            <View style={[s.statusDot, { backgroundColor: color }]} />
            <Text style={[s.statusText, { color }]}>{statusLabel(entry.status)}</Text>
          </View>
        </View>
      </View>

      <View style={s.cardActions}>
        {entry.status === "waiting" && (
          <Pressable
            style={({ pressed }) => [s.actionBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
            onPress={onStart}
            disabled={startLoading}
            testID={`queue-start-${entry.id}`}
          >
            {startLoading ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Feather name="play" size={15} color={colors.primaryForeground} />
            )}
          </Pressable>
        )}
        {entry.status === "in_progress" && (
          <Pressable
            style={({ pressed }) => [s.actionBtn, { backgroundColor: colors.success, opacity: pressed ? 0.8 : 1 }]}
            onPress={onRemove}
            disabled={removeLoading}
            testID={`queue-complete-${entry.id}`}
          >
            {removeLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="check" size={15} color="#fff" />
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

function AddWalkInModal({
  visible,
  onClose,
  onAdd,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (data: { clientName: string; serviceName: string; servicePrice: number; serviceDuration: number }) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [clientName, setClientName] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("30");

  const reset = () => {
    setClientName("");
    setServiceName("");
    setPrice("");
    setDuration("30");
  };

  const handleAdd = () => {
    if (!clientName.trim() || !serviceName.trim()) {
      Alert.alert("Atenção", "Nome do cliente e serviço são obrigatórios.");
      return;
    }
    onAdd({
      clientName: clientName.trim(),
      serviceName: serviceName.trim(),
      servicePrice: parseFloat(price) || 0,
      serviceDuration: parseInt(duration) || 30,
    });
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={[modal.root, { backgroundColor: colors.background }]}>
        <View style={modal.header}>
          <Text style={[modal.title, { color: colors.foreground }]}>Entrada direta</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {[
          { label: "Nome do cliente", value: clientName, setter: setClientName, placeholder: "João Silva" },
          { label: "Serviço", value: serviceName, setter: setServiceName, placeholder: "Corte de cabelo" },
          { label: "Preço (R$)", value: price, setter: setPrice, placeholder: "35", keyboardType: "numeric" as const },
          { label: "Duração (min)", value: duration, setter: setDuration, placeholder: "30", keyboardType: "numeric" as const },
        ].map(({ label, value, setter, placeholder, keyboardType }) => (
          <View key={label} style={modal.field}>
            <Text style={[modal.label, { color: colors.mutedForeground }]}>{label}</Text>
            <TextInput
              style={[modal.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
              value={value}
              onChangeText={setter}
              placeholder={placeholder}
              placeholderTextColor={colors.mutedForeground}
              keyboardType={keyboardType ?? "default"}
            />
          </View>
        ))}

        <Pressable
          style={({ pressed }) => [modal.btn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
          onPress={handleAdd}
        >
          <Text style={[modal.btnText, { color: colors.primaryForeground }]}>Adicionar à fila</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const modal = StyleSheet.create({
  root: {
    flex: 1,
    padding: 24,
    paddingTop: 32,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    fontWeight: "500" as const,
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  btn: {
    borderRadius: 8,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 8,
  },
  btnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
  },
});

export default function QueueScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const isWeb = Platform.OS === "web";

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["queue"],
    queryFn: api.getQueue,
    refetchInterval: 5000,
  });

  const startMutation = useMutation({
    mutationFn: api.startQueueEntry,
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setActionId(null);
    },
    onError: (err: Error) => {
      Alert.alert("Erro", err.message);
      setActionId(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: api.removeFromQueue,
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setActionId(null);
    },
    onError: (err: Error) => {
      Alert.alert("Erro", err.message);
      setActionId(null);
    },
  });

  const addMutation = useMutation({
    mutationFn: api.addToQueue,
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => {
      Alert.alert("Erro", err.message);
    },
  });

  const topPad = isWeb ? 67 : insets.top;

  const activeQueue = (data ?? []).filter((e) => e.status !== "completed");

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: topPad + 16, borderBottomColor: colors.border }]}>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Fila do dia</Text>
        <View style={s.headerRight}>
          <View style={[s.badge, { backgroundColor: colors.primary + "20" }]}>
            <Text style={[s.badgeText, { color: colors.primary }]}>{activeQueue.length}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [s.addBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
            onPress={() => setShowModal(true)}
            testID="add-walkin-btn"
          >
            <Feather name="plus" size={18} color={colors.primaryForeground} />
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError ? (
        <View style={s.center}>
          <Feather name="alert-circle" size={36} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>Erro ao carregar fila</Text>
          <Pressable onPress={() => refetch()} style={[s.retryBtn, { borderColor: colors.border }]}>
            <Text style={[s.retryText, { color: colors.foreground }]}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={activeQueue}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[
            s.list,
            { paddingBottom: insets.bottom + 100 },
            activeQueue.length === 0 && s.listEmpty,
          ]}
          scrollEnabled={!!activeQueue.length}
          showsVerticalScrollIndicator={false}
          refreshing={isFetching && !isLoading}
          onRefresh={() => { Haptics.selectionAsync(); refetch(); }}
          ListEmptyComponent={
            <View style={s.emptyBox}>
              <Feather name="inbox" size={40} color={colors.mutedForeground} />
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>Fila vazia</Text>
              <Text style={[s.emptySubtext, { color: colors.mutedForeground }]}>
                Adicione um cliente para começar
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <QueueCard
              entry={item}
              colors={colors}
              onStart={() => {
                setActionId(item.id);
                startMutation.mutate(item.id);
              }}
              onRemove={() => {
                Alert.alert(
                  "Concluir atendimento",
                  `Confirma conclusão de ${item.clientName}?`,
                  [
                    { text: "Cancelar", style: "cancel" },
                    {
                      text: "Concluir",
                      onPress: () => {
                        setActionId(item.id);
                        removeMutation.mutate(item.id);
                      },
                    },
                  ]
                );
              }}
              startLoading={startMutation.isPending && actionId === item.id}
              removeLoading={removeMutation.isPending && actionId === item.id}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}

      <AddWalkInModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onAdd={(data) => addMutation.mutate(data)}
        colors={colors}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  badge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  list: {
    padding: 16,
  },
  listEmpty: {
    flex: 1,
    justifyContent: "center",
  },
  card: {
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  positionBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  positionText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    fontWeight: "700" as const,
  },
  cardInfo: {
    flex: 1,
    gap: 2,
  },
  clientName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
  },
  serviceName: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    fontWeight: "500" as const,
  },
  cardActions: {
    gap: 8,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBox: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
  },
  emptySubtext: {
    fontSize: 13,
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
