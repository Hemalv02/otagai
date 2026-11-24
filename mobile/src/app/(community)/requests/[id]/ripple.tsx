import { useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ActivityStatus, ActivityText } from "@/components/activity-ui";
import { CommunityScreen } from "@/components/community-screen";
import { Button } from "@/components/ui";
import { formatActivityDate } from "@/lib/activity-copy";
import { liveRequestCopy } from "@/lib/live-request-copy";
import { useLiveResource } from "@/lib/live-resource";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { getDeliveryReceipt, rippleCopy } from "@/lib/request-ripple";
import { isUuid } from "@/lib/uuid";
import { colors, spacing } from "@/theme/tokens.json";

export default function RequestDeliveryScreen() {
  const localizedType = useLocalizedType();
  const { id, actingFor } = useLocalSearchParams<{
    id: string;
    actingFor?: string;
  }>();
  const { locale } = useOnboardingText();
  const copy = rippleCopy[locale];
  const receipt = useLiveResource(
    useCallback(
      () => getDeliveryReceipt(id, isUuid(actingFor) ? actingFor : undefined),
      [id, actingFor],
    ),
  );
  const data = receipt.data;
  const labelStyle = localizedType("field-label", locale);
  const count = new Intl.NumberFormat(locale);

  return (
    <CommunityScreen
      back
      design
      actingFor={isUuid(actingFor) ? actingFor : undefined}
      title={copy.delivery}
      subtitle={
        data ? liveRequestCopy[locale].status[data.request_status] : undefined
      }
    >
      <ActivityStatus
        loading={receipt.loading}
        error={receipt.error}
        retry={receipt.reload}
      />
      {data && !receipt.error ? (
        <>
          <View style={styles.panel}>
            {data.stages.map((row, index) => {
              const sent = row.status === "sent";
              const current =
                data.request_status === "open" &&
                row.stage === data.current_stage;
              return (
                <View key={row.stage} style={styles.row}>
                  <View
                    style={styles.timeline}
                    importantForAccessibility="no-hide-descendants"
                    accessibilityElementsHidden
                  >
                    <View
                      style={[
                        styles.dot,
                        sent && styles.sent,
                        current && styles.current,
                      ]}
                    />
                    {index < data.stages.length - 1 ? (
                      <View style={styles.line} />
                    ) : null}
                  </View>
                  <View style={styles.words}>
                    <ActivityText strong>{copy.stages[row.stage]}</ActivityText>
                    <ActivityText>
                      {sent
                        ? copy.delivered(count.format(row.recipient_count))
                        : copy.status[row.status]}
                    </ActivityText>
                    {row.delivered_at && sent ? (
                      <Text
                        style={[
                          localizedType("supporting", locale),
                          styles.secondary,
                        ]}
                      >
                        {formatActivityDate(row.delivered_at, locale)}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
          {data.next_widen_at || data.expires_at ? (
            <View style={styles.schedule}>
              {data.next_widen_at ? (
                <ActivityText>
                  {copy.next} · {formatActivityDate(data.next_widen_at, locale)}
                </ActivityText>
              ) : null}
              {data.expires_at && data.request_status === "open" ? (
                <ActivityText>
                  {copy.expires} · {formatActivityDate(data.expires_at, locale)}
                </ActivityText>
              ) : null}
            </View>
          ) : null}
          <Button
            label={copy.refresh}
            variant="text"
            labelStyle={labelStyle}
            disabled={receipt.loading}
            onPress={() => void receipt.reload()}
          />
        </>
      ) : null}
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
    borderRadius: 12,
    padding: spacing["card-inset"],
  },
  row: { flexDirection: "row", gap: spacing["card-inset"], minHeight: 65 },
  timeline: { width: 20, alignItems: "center", paddingTop: 5 },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.control,
    backgroundColor: colors.canvas,
  },
  sent: { borderColor: colors.action, backgroundColor: colors.action },
  current: {
    backgroundColor: colors.wash,
    borderColor: colors.action,
    borderWidth: 3,
  },
  line: { width: 1, flex: 1, backgroundColor: colors.rule },
  words: { flex: 1, paddingBottom: spacing["related-gap"] },
  secondary: { color: colors.secondary },
  schedule: { gap: spacing["related-gap"] },
});
