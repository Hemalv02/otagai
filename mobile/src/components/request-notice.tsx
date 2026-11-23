import { StyleSheet, Text, View } from "react-native";

import type { Language } from "@/lib/api";
import { localizedType } from "@/lib/onboarding-i18n";
import { colors, controls, spacing } from "@/theme/tokens.json";

export function RequestNotice({
  title,
  detail,
  locale,
}: {
  title: string;
  detail: string;
  locale: Language;
}) {
  return (
    <View style={styles.notice}>
      <Text style={[localizedType("field-label", locale), styles.title]}>
        {title}
      </Text>
      <Text style={[localizedType("supporting", locale), styles.detail]}>
        {detail}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    backgroundColor: colors.paper,
    borderRadius: controls.radius,
    gap: 2,
    paddingHorizontal: spacing["control-gap"],
    paddingVertical: 9,
  },
  title: { color: colors.ink },
  detail: { color: colors.secondary },
});
