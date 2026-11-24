import { router, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";

import { ActivityStatus, ActivityText } from "@/components/activity-ui";
import { CommunityScreen } from "@/components/community-screen";
import { NeighbourNotice } from "@/components/neighbour-ui";
import { Button } from "@/components/ui";
import { formatActivityDate } from "@/lib/activity-copy";
import { useLiveResource } from "@/lib/live-resource";
import {
  exchangeLabel,
  isUuid,
  neighbourApi,
  optionalVisible,
} from "@/lib/neighbour-api";
import { neighbourCopy } from "@/lib/neighbour-copy";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";

export default function ThankYouReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile } = useSession();
  return (
    <Receipt
      key={`${session?.user.id}:${id}`}
      id={id}
      authUserId={session?.user.id ?? ""}
      profileId={profile.status === "ready" ? profile.profile.id : ""}
    />
  );
}

function Receipt({
  id,
  authUserId,
  profileId,
}: {
  id: string;
  authUserId: string;
  profileId: string;
}) {
  const localizedType = useLocalizedType();
  const { locale } = useOnboardingText();
  const copy = neighbourCopy[locale];
  const receipt = useLiveResource(
    useCallback(async () => {
      if (!authUserId || !profileId || !isUuid(id)) return {};
      const api = neighbourApi(authUserId);
      const note = await optionalVisible(api.thankYou(id));
      if (!note || ![note.from_user_id, note.to_user_id].includes(profileId))
        return {};
      const received = note.to_user_id === profileId;
      const [person, exchange] = await Promise.all([
        optionalVisible(
          api.profile(received ? note.from_user_id : note.to_user_id),
        ),
        optionalVisible(api.exchange(note.exchange_id)),
      ]);
      return {
        note,
        received,
        name: person?.display_name,
        exchange,
        title: exchange ? await exchangeLabel(api, exchange) : null,
      };
    }, [authUserId, id, profileId]),
  );
  const { note, received, name, exchange, title } = receipt.data ?? {};

  return (
    <CommunityScreen
      design
      back
      title={received === false ? copy.sent : copy.received}
      subtitle={title ? copy.forExchange(title) : undefined}
    >
      <ActivityStatus
        loading={receipt.loading}
        error={receipt.error}
        retry={receipt.reload}
      />
      {receipt.data && !note ? (
        <ActivityText>{copy.unavailable}</ActivityText>
      ) : null}
      {note ? (
        <NeighbourNotice>
          <ActivityText strong>
            {received
              ? copy.from(name ?? copy.neighbour)
              : copy.to(name ?? copy.neighbour)}
          </ActivityText>
          {note.note ? <ActivityText>{note.note}</ActivityText> : null}
          <ActivityText>
            {formatActivityDate(note.created_at, locale)}
          </ActivityText>
        </NeighbourNotice>
      ) : null}
      {exchange?.mode === "loan" ? (
        <Button
          label={copy.viewExchange}
          labelStyle={localizedType("button", locale)}
          onPress={() =>
            router.push({
              pathname: "/loans/[id]",
              params: { id: exchange.id },
            })
          }
        />
      ) : null}
    </CommunityScreen>
  );
}
