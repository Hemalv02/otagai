import { Redirect, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";

import { ActivityStatus } from "@/components/activity-ui";
import { CommunityScreen } from "@/components/community-screen";
import {
  type LegacyExchangeScreen,
  resolveLegacyExchangeHref,
} from "@/lib/legacy-community-routes";
import { liveRequestCopy } from "@/lib/live-request-copy";
import { useLiveResource } from "@/lib/live-resource";
import { neighbourApi, optionalVisible } from "@/lib/neighbour-api";
import { useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";

export function LegacyExchangeRedirect({
  screen,
}: {
  screen: LegacyExchangeScreen;
}) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile } = useSession();
  const authUserId = session?.user.id;
  const profileId = profile.status === "ready" ? profile.profile.id : null;
  if (!authUserId || !profileId) return <Redirect href="/requests" />;

  return (
    <ExchangeDestination
      key={`${authUserId}:${profileId}:${id}`}
      authUserId={authUserId}
      profileId={profileId}
      id={id}
      screen={screen}
    />
  );
}

function ExchangeDestination({
  authUserId,
  profileId,
  id,
  screen,
}: {
  authUserId: string;
  profileId: string;
  id: string;
  screen: LegacyExchangeScreen;
}) {
  const { locale } = useOnboardingText();
  const route = useLiveResource(
    useCallback(
      () =>
        resolveLegacyExchangeHref(screen, id, profileId, (exchangeId) =>
          optionalVisible(neighbourApi(authUserId).exchange(exchangeId)),
        ),
      [authUserId, id, profileId, screen],
    ),
  );

  if (route.data) return <Redirect href={route.data} />;
  return (
    <CommunityScreen title={liveRequestCopy[locale].exchange} back>
      <ActivityStatus
        loading={route.loading}
        error={route.error}
        retry={route.reload}
      />
    </CommunityScreen>
  );
}
