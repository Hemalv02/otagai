import { router } from "expo-router";

import { ActivityStatus, ActivityText } from "@/components/activity-ui";
import { NeighbourNotice } from "@/components/neighbour-ui";
import { Button } from "@/components/ui";
import { activityCopy, formatActivityDate } from "@/lib/activity-copy";
import type { Page } from "@/lib/api";
import { usePagedResource } from "@/lib/live-resource";
import type { WallThankYou } from "@/lib/neighbour-api";
import { neighbourCopy } from "@/lib/neighbour-copy";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { recognitionCopy } from "@/lib/recognition-copy";

export function PublishedThankYous({
  loadPage,
  showRecipient = false,
  viewerId,
  empty,
}: {
  loadPage: (cursor?: string | null) => Promise<Page<WallThankYou>>;
  showRecipient?: boolean;
  viewerId?: string;
  empty: string;
}) {
  const localizedType = useLocalizedType();
  const { locale } = useOnboardingText();
  const copy = recognitionCopy[locale];
  const neighbour = neighbourCopy[locale];
  const page = usePagedResource(loadPage);

  return (
    <>
      {!page.error && page.items.map((item) => (
        <NeighbourNotice key={item.id}>
          <ActivityText strong>
            {showRecipient
              ? copy.thanked(item.from_name, item.to_name)
              : neighbour.from(item.from_name)}
          </ActivityText>
          <ActivityText>{item.note}</ActivityText>
          <ActivityText>{formatActivityDate(item.created_at, locale)}</ActivityText>
          {showRecipient && item.to_user_id !== viewerId ? (
            <Button
              label={neighbour.viewProfileFor(item.to_name)}
              variant="text"
              labelStyle={localizedType("field-label", locale)}
              onPress={() =>
                router.push({
                  pathname: "/neighbours/[id]",
                  params: { id: item.to_user_id },
                })
              }
            />
          ) : null}
        </NeighbourNotice>
      ))}
      {!page.items.length && !page.loading && !page.error ? (
        <ActivityText>{empty}</ActivityText>
      ) : null}
      <ActivityStatus loading={page.loading} error={page.error} retry={page.retry} />
      {page.cursor ? (
        <Button
          label={activityCopy[locale].loadMore}
          variant="secondary"
          labelStyle={localizedType("field-label", locale)}
          disabled={page.loading || page.error}
          onPress={page.loadMore}
        />
      ) : null}
    </>
  );
}
