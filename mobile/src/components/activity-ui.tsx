import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { PropsWithChildren } from "react";
import { Button, ErrorText } from "@/components/ui";
import { activityCopy } from "@/lib/activity-copy";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { colors, controls, spacing } from "@/theme/tokens.json";

export function ActivityText({
  children,
  strong = false,
}: PropsWithChildren<{ strong?: boolean }>) {
  const localizedType = useLocalizedType();
  const { locale } = useOnboardingText();
  return (
    <Text
      style={[
        localizedType(strong ? "field-label" : "supporting", locale),
        strong ? activityStyles.ink : activityStyles.secondary,
      ]}
    >
      {children}
    </Text>
  );
}

export function ActivityStatus({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: boolean;
  retry: () => void;
}) {
  const { locale } = useOnboardingText();
  const copy = activityCopy[locale];
  if (!loading && !error) return null;
  return (
    <View style={activityStyles.section}>
      {loading ? (
        <ActivityIndicator
          accessibilityLabel={copy.loading}
          color={colors.action}
        />
      ) : null}
      {error ? (
        <>
          <ErrorText>{copy.loadError}</ErrorText>
          <Button label={copy.retry} variant="secondary" onPress={retry} />
        </>
      ) : null}
    </View>
  );
}

export const activityStyles = StyleSheet.create({
  section: { gap: spacing["related-gap"] },
  card: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: controls.radius,
    padding: spacing["card-inset"],
    gap: spacing["related-gap"],
    marginBottom: spacing["related-gap"],
  },
  dueCard: {
    backgroundColor: colors.paper,
    padding: spacing["card-inset"],
    borderRadius: controls.radius,
    gap: spacing["related-gap"],
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing["control-gap"],
  },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
  green: { color: colors.action },
  unread: { backgroundColor: colors.wash },
  flex: { flex: 1 },
});
