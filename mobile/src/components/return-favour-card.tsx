import { router } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, View } from "react-native";

import { ActivityStatus, ActivityText } from "@/components/activity-ui";
import { NeighbourHeading, NeighbourNotice } from "@/components/neighbour-ui";
import { Button } from "@/components/ui";
import { formatActivityDate } from "@/lib/activity-copy";
import { assistantCopy } from "@/lib/assistant-copy";
import { liveRequestCopy } from "@/lib/live-request-copy";
import { useLiveResource } from "@/lib/live-resource";
import { neighbourApi } from "@/lib/neighbour-api";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { thankYouCopy } from "@/lib/thank-you-copy";
import { colors, spacing } from "@/theme/tokens.json";

export function ReturnFavourCard({
  exchangeId,
  authUserId,
  partnerName,
}: {
  exchangeId: string;
  authUserId: string;
  partnerName?: string | null;
}) {
  const { locale } = useOnboardingText();
  const localizedType = useLocalizedType();
  const copy = thankYouCopy[locale];
  const resource = useLiveResource(
    useCallback(
      () => neighbourApi(authUserId).returnFavours(exchangeId),
      [authUserId, exchangeId],
    ),
  );
  const options = resource.data?.items ?? [];
  if (!resource.error && !options.length) return null;

  return (
    <NeighbourNotice>
      <NeighbourHeading>{copy.returnFavour}</NeighbourHeading>
      {resource.error ? (
        <ActivityStatus
          loading={resource.loading}
          error
          retry={resource.reload}
        />
      ) : (
        <>
          <ActivityText>
            {partnerName ? copy.favourFor(partnerName) : copy.favourDetail}
          </ActivityText>
          {options.map((option) => {
            const start = option.needed_from;
            const end = option.needed_until;
            const wording = liveRequestCopy[locale];
            const timing = [
              start &&
                `${wording.needed_from} ${formatActivityDate(start, locale)}`,
              end &&
                `${wording.needed_until} ${formatActivityDate(end, locale)}`,
            ]
              .filter(Boolean)
              .join(" · ");
            const label = assistantCopy[locale].viewRequest;
            return (
              <View key={option.id} style={styles.option}>
                <ActivityText strong>{option.polite_text}</ActivityText>
                {timing ? <ActivityText>{timing}</ActivityText> : null}
                <Button
                  label={label}
                  accessibilityLabel={`${label}: ${option.polite_text}`}
                  variant="text"
                  labelStyle={localizedType("field-label", locale)}
                  onPress={() =>
                    router.push({
                      pathname: "/requests/[id]",
                      params: { id: option.id },
                    })
                  }
                />
              </View>
            );
          })}
        </>
      )}
    </NeighbourNotice>
  );
}

const styles = StyleSheet.create({
  option: {
    paddingTop: spacing["control-gap"],
    borderTopColor: colors.rule,
    borderTopWidth: 1,
    gap: spacing["related-gap"],
  },
});
