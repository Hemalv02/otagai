import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Lora_400Regular } from "@expo-google-fonts/lora/400Regular";
import { NotoSansBengali_400Regular } from "@expo-google-fonts/noto-sans-bengali/400Regular";
import { NotoSansBengali_600SemiBold } from "@expo-google-fonts/noto-sans-bengali/600SemiBold";
import { NotoSansJP_400Regular } from "@expo-google-fonts/noto-sans-jp/400Regular";
import { NotoSansJP_700Bold } from "@expo-google-fonts/noto-sans-jp/700Bold";
import { fonts } from "./tokens.json";

export const fontAssets = {
  [fonts.en.regular]: Inter_400Regular,
  [fonts.en.strong]: Inter_600SemiBold,
  [fonts.ja.regular]: NotoSansJP_400Regular,
  [fonts.ja.strong]: NotoSansJP_700Bold,
  [fonts.bn.regular]: NotoSansBengali_400Regular,
  [fonts.bn.strong]: NotoSansBengali_600SemiBold,
  [fonts.wordmark]: Lora_400Regular,
};
