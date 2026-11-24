import { router } from "expo-router";
import { useCallback, useState } from "react";

import { ActivityStatus, ActivityText } from "@/components/activity-ui";
import { CommunityScreen } from "@/components/community-screen";
import { NeighbourHeading } from "@/components/neighbour-ui";
import { PublishedThankYous } from "@/components/published-thank-yous";
import { Button } from "@/components/ui";
import { useMemberships } from "@/lib/memberships";
import { neighbourApi } from "@/lib/neighbour-api";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { recognitionCopy } from "@/lib/recognition-copy";
import { useSession } from "@/lib/session";

export default function ThankYouWallScreen() {
  const { session, profile } = useSession();
  return (
    <ThankYouWall
      key={session?.user.id}
      authUserId={session?.user.id}
      viewerId={profile.status === "ready" ? profile.profile.id : undefined}
    />
  );
}

function ThankYouWall({
  authUserId,
  viewerId,
}: {
  authUserId?: string;
  viewerId?: string;
}) {
  const { locale } = useOnboardingText();
  const localizedType = useLocalizedType();
  const copy = recognitionCopy[locale];
  const { state, refresh } = useMemberships();
  const [selected, setSelected] = useState<string>();
  const circles =
    state.status === "ready"
      ? state.items.flatMap((membership) =>
          membership.status === "approved" && membership.circle ? [membership.circle] : [],
        )
      : [];
  const circle = circles.find((item) => item.id === selected) ?? circles[0];
  const circleId = circle?.id;
  const localizedName = circle?.name_translations[locale];
  const circleName = typeof localizedName === "string" ? localizedName : circle?.name;


  return (
    <CommunityScreen design back title={copy.title} subtitle={circleName}>
      <Button
        label={copy.myThanks}
        variant="secondary"
        labelStyle={localizedType("field-label", locale)}
        onPress={() => router.push("/thank-yous")}
      />
      <ActivityStatus
        loading={state.status === "loading"}
        error={state.status === "error" || (state.status === "ready" && state.refreshFailed)}
        retry={refresh}
      />
      {circles.length > 1 ? (
        <>
          <NeighbourHeading>{copy.circles}</NeighbourHeading>
          {circles.map((option) => {
            const name = option.name_translations[locale];
            return (
              <Button
                key={option.id}
                label={typeof name === "string" ? name : option.name}
                variant="outline"
                disabled={option.id === circleId}
                labelStyle={localizedType("field-label", locale)}
                onPress={() => setSelected(option.id)}
              />
            );
          })}
        </>
      ) : null}
      {authUserId && circleId ? (
        <>
          <ActivityText>{copy.wallIntro}</ActivityText>
          <CircleWall
            key={circleId}
            authUserId={authUserId}
            circleId={circleId}
            viewerId={viewerId}
            empty={copy.wallEmpty}
          />
        </>
      ) : null}
    </CommunityScreen>
  );
}

function CircleWall({
  authUserId,
  circleId,
  viewerId,
  empty,
}: {
  authUserId: string;
  circleId: string;
  viewerId?: string;
  empty: string;
}) {
  const loadPage = useCallback(
    (cursor?: string | null) => neighbourApi(authUserId).circleWall(circleId, cursor),
    [authUserId, circleId],
  );
  return <PublishedThankYous loadPage={loadPage} showRecipient viewerId={viewerId} empty={empty} />;
}
