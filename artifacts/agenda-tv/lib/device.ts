import { Dimensions, Platform } from "react-native";

type PlatformConstants = { uiMode?: string };

export function isTvDevice(width = Dimensions.get("window").width): boolean {
  const uiMode = (Platform.constants as PlatformConstants | undefined)?.uiMode;
  return Platform.isTV === true || (
    Platform.OS === "android" &&
    (uiMode === "tv" || width >= 900)
  );
}