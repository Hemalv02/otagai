import { Image, type ImageSource } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { colors, controls, spacing } from "@/theme/tokens.json";

export function ListingRow({
  title,
  description,
  detail,
  photo,
  portrait,
  accessibilityRole = "button",
  onPress,
}: {
  title: string;
  description?: string;
  detail?: string;
  photo?: ImageSource;
  portrait?: boolean;
  accessibilityRole?: "button" | "link";
  onPress: () => void;
}) {
  const { locale } = useOnboardingText();
  const supporting = localizedType("supporting", locale);

  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={[title, description, detail]
        .filter(Boolean)
        .join(", ")}
      onPress={onPress}
      style={styles.row}
    >
      {photo ? (
        <Image
          source={photo}
          style={[styles.thumbnail, portrait && styles.portrait]}
          contentFit="cover"
          accessible={false}
        />
      ) : null}
      <View style={styles.rowCopy}>
        <Text style={[localizedType("field-label", locale), styles.ink]}>
          {title}
        </Text>
        {description ? (
          <Text style={[supporting, styles.secondary]}>{description}</Text>
        ) : null}
      </View>
      {detail ? (
        <Text style={[supporting, styles.rowDetail]}>{detail}</Text>
      ) : null}
    </Pressable>
  );
}

export function ListingRowSkeleton() {
  return (
    <View style={styles.skeletonRow}>
      <View style={styles.skeletonTitle} />
      <View style={styles.skeletonMeta} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["control-gap"],
    minHeight: 64,
    paddingVertical: 4,
    borderRadius: controls.radius,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: controls.radius,
    backgroundColor: colors.paper,
  },
  portrait: { borderRadius: 28 },
  rowCopy: { flex: 1, minWidth: 0 },
  rowDetail: { color: colors.action, textAlign: "right", maxWidth: "30%" },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
  skeletonRow: {
    paddingVertical: spacing["control-gap"],
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  skeletonTitle: {
    height: 14,
    width: "40%",
    backgroundColor: colors.rule,
    borderRadius: 4,
  },
  skeletonMeta: {
    height: 12,
    width: "68%",
    backgroundColor: colors.paper,
    borderRadius: 4,
    marginTop: spacing["related-gap"],
  },
});
