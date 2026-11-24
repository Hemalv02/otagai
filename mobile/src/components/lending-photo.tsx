import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";

import type { Language } from "@/lib/api";
import { useLocalizedType } from "@/lib/onboarding-i18n";
import { colors, controls } from "@/theme/tokens.json";

export function LendingPhoto({
  photo,
  caption,
  locale,
}: {
  photo: { uri: string };
  caption: string;
  locale: Language;
}) {
  const localizedType = useLocalizedType();
  return (
    <View style={styles.block}>
      <Image
        source={photo}
        style={styles.photo}
        contentFit="contain"
        accessible={false}
      />
      <Text style={[localizedType("supporting", locale), styles.caption]}>
        {caption}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 5 },
  photo: { height: 220, width: "100%", borderRadius: controls.radius },
  caption: { color: colors.secondary },
});
