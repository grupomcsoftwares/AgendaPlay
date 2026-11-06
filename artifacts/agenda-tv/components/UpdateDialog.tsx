import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";

export type UpdateDialogProps = {
  visible: boolean;
  currentVersion: string;
  latestVersion: string;
  apkUrl?: string;
  onDismiss: () => void;
  onUpdate?: (onProgress: (progress: number) => void) => Promise<void>;
};

export default function UpdateDialog({ visible, currentVersion, latestVersion, apkUrl, onDismiss, onUpdate }: UpdateDialogProps) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const handleUpdate = async () => {
    if (!onUpdate || downloading) return;
    setDownloading(true);
    setProgress(0);
    setError("");
    try {
      await onUpdate(setProgress);
    } catch {
      setError(
        Platform.OS === "android"
          ? "Não foi possível abrir o instalador. Confira se a Fire TV permite instalar apps externos para o AgendaPlay."
          : "Não foi possível abrir o download. Tente novamente.",
      );
    } finally {
      setDownloading(false);
    }
  };

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

          {apkUrl ? (
            <TouchableOpacity
              style={[styles.btnPrimary, downloading && styles.btnDisabled]}
              onPress={() => void handleUpdate()}
              disabled={downloading}
            >
              {downloading && <ActivityIndicator color="#0f0f0f" />}
              <Text style={styles.btnPrimaryText}>
                {downloading
                  ? progress > 0
                    ? `Baixando atualização ${Math.round(progress * 100)}%`
                    : "Preparando instalação…"
                  : "Baixar atualização"}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.btnPrimary} onPress={onDismiss}>
              <Text style={styles.btnPrimaryText}>OK, entendi</Text>
            </TouchableOpacity>
          )}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {Platform.OS === "android" && apkUrl ? (
            <Text style={styles.installNote}>
              O Android pode pedir autorização para instalar esta atualização.
            </Text>
          ) : null}

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
    flexDirection: "row",
    gap: 10,
  },
  btnDisabled: { opacity: 0.75 },
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
  errorText: {
    color: "#fca5a5",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 12,
  },
  installNote: {
    color: "#777",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 10,
  },
});
