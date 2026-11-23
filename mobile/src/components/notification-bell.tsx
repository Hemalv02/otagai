import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import {
  ActivityText,
  activityStyles as styles,
} from "@/components/activity-ui";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { activityCopy } from "@/lib/activity-copy";
import { useLiveResource } from "@/lib/live-resource";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { controls } from "@/theme/tokens.json";

export function NotificationBell() {
  const { locale } = useOnboardingText();
  const copy = activityCopy[locale];
  const counts = useLiveResource(api.getUnreadCounts);
  const count = counts.data?.notifications;
  const label = `${copy.notifications}${count === undefined ? "" : `, ${copy.unread}: ${count}`}`;
  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          minHeight: controls["touch-target"],
          justifyContent: "center",
        }}
        onPress={() => router.push("/notifications")}
      >
        <Text style={[localizedType("field-label", locale), styles.green]}>
          🔔 {copy.notifications}
          {count === undefined ? "" : ` · ${count.toLocaleString(locale)}`}
        </Text>
      </Pressable>
      {counts.error ? (
        <>
          <ActivityText>{copy.loadError}</ActivityText>
          <Button label={copy.retry} variant="text" onPress={counts.reload} />
        </>
      ) : null}
    </View>
  );
}
