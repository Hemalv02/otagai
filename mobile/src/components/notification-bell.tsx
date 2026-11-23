import { router } from "expo-router";
import { Image, Pressable, StyleSheet, Text } from "react-native";
import { api } from "@/lib/api";
import { activityCopy } from "@/lib/activity-copy";
import { useLiveResource } from "@/lib/live-resource";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { colors, controls } from "@/theme/tokens.json";

export function NotificationBell() {
  const { locale } = useOnboardingText();
  const copy = activityCopy[locale];
  const { data } = useLiveResource(api.getUnreadCounts);
  const count = data?.notifications;
  const label = `${copy.notifications}${count === undefined ? "" : `, ${copy.unread}: ${count.toLocaleString(locale)}`}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      onPress={() => router.push("/notifications")}
    >
      <Image
        accessible={false}
        source={require("../../assets/images/activity/notification-bell.png")}
        style={styles.icon}
      />
      {count !== undefined && count > 0 ? (
        <Text
          aria-hidden
          maxFontSizeMultiplier={1.25}
          style={[localizedType("field-label", locale), styles.badge]}
        >
          {count > 99
            ? `${(99).toLocaleString(locale)}+`
            : count.toLocaleString(locale)}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: controls["touch-target"],
    height: controls["touch-target"],
    flexShrink: 0,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: controls.radius,
  },
  pressed: { backgroundColor: colors.wash },
  icon: { width: 32, height: 32 },
  badge: {
    position: "absolute",
    top: 2,
    right: 0,
    minWidth: 14,
    paddingHorizontal: 3,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.canvas,
    color: colors["on-action"],
    backgroundColor: colors.action,
    textAlign: "center",
    fontSize: 8,
    lineHeight: 12,
  },
});
