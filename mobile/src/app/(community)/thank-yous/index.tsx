import { router } from "expo-router";
import { useCallback } from "react";

import { ActivityStatus, ActivityText } from "@/components/activity-ui";
import { CommunityScreen } from "@/components/community-screen";
import { NeighbourNotice } from "@/components/neighbour-ui";
import { Button } from "@/components/ui";
import { activityCopy, formatActivityDate } from "@/lib/activity-copy";
import { usePagedResource } from "@/lib/live-resource";
import { neighbourApi } from "@/lib/neighbour-api";
import { neighbourCopy } from "@/lib/neighbour-copy";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { recognitionCopy } from "@/lib/recognition-copy";
import { useSession } from "@/lib/session";

export default function ReceivedThankYousScreen() {
  const { session } = useSession();
  return <ReceivedThankYous key={session?.user.id} authUserId={session?.user.id} />;
}

function ReceivedThankYous({ authUserId }: { authUserId?: string }) {
  const { locale } = useOnboardingText();
  const localizedType = useLocalizedType();
  const copy = recognitionCopy[locale];
  const page = usePagedResource(
    useCallback(
      async (cursor) =>
        authUserId
          ? neighbourApi(authUserId).received(cursor)
          : { items: [], next_cursor: null },
      [authUserId],
    ),
  );
  const label = localizedType("field-label", locale);

  return (
    <CommunityScreen design back title={copy.myThanks} backHref="/thank-you-wall">
      {page.items.map((item) => (
        <NeighbourNotice key={item.id}>
          <ActivityText strong>{item.note || copy.privateNote}</ActivityText>
          {item.points_amount ? (
            <ActivityText>{copy.pointsReceived(item.points_amount)}</ActivityText>
          ) : null}
          <ActivityText>{formatActivityDate(item.created_at, locale)}</ActivityText>
          <Button
            label={neighbourCopy[locale].viewThanks}
            variant="text"
            labelStyle={label}
            onPress={() =>
              router.push({ pathname: "/thank-yous/[id]", params: { id: item.id } })
            }
          />
        </NeighbourNotice>
      ))}
      {!page.items.length && !page.loading && !page.error ? (
        <ActivityText>{copy.myThanksEmpty}</ActivityText>
      ) : null}
      <ActivityStatus loading={page.loading} error={page.error} retry={page.retry} />
      {page.cursor ? (
        <Button
          label={activityCopy[locale].loadMore}
          variant="secondary"
          labelStyle={label}
          disabled={page.loading || page.error}
          onPress={page.loadMore}
        />
      ) : null}
    </CommunityScreen>
  );
}
