import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";

import { StyleSheet, View } from "react-native";

import { ActivityToggle } from "@/components/activity-toggle";
import { ActivityStatus, ActivityText } from "@/components/activity-ui";
import { CommunityScreen } from "@/components/community-screen";
import { NeighbourNotice } from "@/components/neighbour-ui";
import { Button, ErrorText } from "@/components/ui";
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
import { recognitionCopy } from "@/lib/recognition-copy";
import { useSession } from "@/lib/session";
import { spacing } from "@/theme/tokens.json";

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
  const recognition = recognitionCopy[locale];
  const api = useMemo(() => neighbourApi(authUserId), [authUserId]);
  const [saving, setSaving] = useState(false);
  const [shareError, setShareError] = useState(false);
  const changeLock = useRef(false);
  const receipt = useLiveResource(
    useCallback(async () => {
      if (!authUserId || !profileId || !isUuid(id)) return {};
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
    }, [api, authUserId, id, profileId]),
  );
  const { note, received, name, exchange, title } = receipt.data ?? {};

  async function share(show: boolean) {
    if (!received || !note?.allow_wall_sharing || changeLock.current) return;
    changeLock.current = true;
    setSaving(true);
    setShareError(false);
    try {
      await api.setWallVisibility(id, show);
      await receipt.reload();
    } catch {
      setShareError(true);
    } finally {
      changeLock.current = false;
      setSaving(false);
    }
  }

  return (
    <CommunityScreen
      design
      back
      title={
        received === false
          ? copy.sent
          : note?.allow_wall_sharing && note.show_on_wall
            ? recognition.sharedNote
            : copy.received
      }
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
          {note.points_amount ? (
            <ActivityText>
              {recognition.pointsReceived(note.points_amount)}
            </ActivityText>
          ) : null}
          <ActivityText>
            {formatActivityDate(note.created_at, locale)}
          </ActivityText>
        </NeighbourNotice>
      ) : null}
      {received && note?.allow_wall_sharing ? (
        <NeighbourNotice>
          <View style={styles.permissionRow}>
            <View style={styles.permissionLabel}>
              <ActivityText strong>{recognition.shareOnWall}</ActivityText>
            </View>
            <ActivityToggle
              label={recognition.shareOnWall}
              hint={recognition.shareDetail}
              value={note.show_on_wall}
              disabled={saving || receipt.loading || receipt.error}
              onChange={(show) => void share(show)}
            />
          </View>
          <ActivityText>{recognition.shareDetail}</ActivityText>
          {shareError ? <ErrorText>{recognition.shareError}</ErrorText> : null}
        </NeighbourNotice>
      ) : null}
      {exchange ? (
        <Button
          label={copy.viewExchange}
          labelStyle={localizedType("button", locale)}
          onPress={() =>
            router.push({
              pathname:
                exchange.mode === "loan" ? "/loans/[id]" : "/exchanges/[id]",
              params: { id: exchange.id },
            })
          }
        />
      ) : null}
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  permissionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["control-gap"],
  },
  permissionLabel: { flex: 1 },
});
