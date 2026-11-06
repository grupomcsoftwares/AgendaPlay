import { Linking, Platform } from "react-native";

export type ApkDownloadProgress = (progress: number) => void;

export async function downloadAndInstallApk(
  apkUrl: string,
  onProgress?: ApkDownloadProgress,
): Promise<void> {
  if (Platform.OS !== "android") {
    await Linking.openURL(apkUrl);
    return;
  }

  const fileSystem = require("expo-file-system/legacy") as typeof import("expo-file-system/legacy");
  const intentLauncher = require("expo-intent-launcher") as typeof import("expo-intent-launcher");
  const fileUri = `${fileSystem.cacheDirectory ?? ""}agendaplay-update.apk`;
  if (!fileSystem.cacheDirectory || !fileUri.startsWith("file://")) {
    throw new Error("O armazenamento temporário não está disponível.");
  }

  const download = fileSystem.createDownloadResumable(
    apkUrl,
    fileUri,
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      if (totalBytesExpectedToWrite > 0) {
        onProgress?.(Math.min(1, totalBytesWritten / totalBytesExpectedToWrite));
      }
    },
  );
  const result = await download.downloadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    throw new Error("Não foi possível baixar o APK.");
  }

  const file = await fileSystem.getInfoAsync(result.uri);
  if (!file.exists || !file.size) {
    throw new Error("O arquivo da atualização está vazio ou incompleto.");
  }

  const contentUri = await fileSystem.getContentUriAsync(result.uri);
  await intentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: contentUri,
    type: "application/vnd.android.package-archive",
    flags: 1,
  });
}
