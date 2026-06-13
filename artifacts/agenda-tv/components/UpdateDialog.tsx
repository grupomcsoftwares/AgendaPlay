import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from "react-native";
import { Feather } from "@expo/vector-icons";

export type UpdateDialogProps = {
  visible: boolean;
  currentVersion: string;
  latestVersion: string;
  onDismiss: () => void;
};

export default function UpdateDialog({ visible, currentVersion, latestVersion, onDismiss }: UpdateDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Feather name="download-cloud" size={28} color="#c9a84c" />
          </View>

          <Text style={styles.title}>Nova versão disponível</Text>
          <Text style={styles.subtitle}>
            O app foi atualizado com melhorias e novos recursos.
          </Text>

          <View style={styles.versionRow}>
            <Text style={styles.versionLabel}>Versão atual:</Text>
            <Text style={styles.versionOld}>{currentVersion}</Text>
          </View>
          <View style={styles.versionRow}>
            <Text style={styles.versionLabel}>Nova versão:</Text>
            <Text style={styles.versionNew}>{latestVersion}</Text>
          </View>

          <TouchableOpacity style={styles.btnPrimary} onPress={onDismiss}>
            <Text style={styles.btnPrimaryText}>Baixar atualização</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnSecondary} onPress={onDismiss}>
            <Text style={styles.btnSecondaryText}>Lembrar depois</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#1a1a1a",
    borderRadius: 24,
    padding: 28,
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#c9a84c22",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#f5f5f5",
    marginBottom: 6,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    color: "#888",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 19,
  },
  versionRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 4,
  },
  versionLabel: {
    fontSize: 12,
    color: "#666",
  },
  versionOld: {
    fontSize: 12,
    color: "#888",
    fontWeight: "600",
  },
  versionNew: {
    fontSize: 12,
    color: "#c9a84c",
    fontWeight: "700",
  },
  btnPrimary: {
    width: "100%",
    backgroundColor: "#c9a84c",
    borderRadius: 14,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  btnPrimaryText: {
    color: "#0f0f0f",
    fontWeight: "700",
    fontSize: 15,
  },
  btnSecondary: {
    width: "100%",
    marginTop: 10,
    padding: 12,
    alignItems: "center",
  },
  btnSecondaryText: {
    color: "#777",
    fontSize: 13,
    fontWeight: "500",
  },
});
