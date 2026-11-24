import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ActivityStatus, ActivityText } from "@/components/activity-ui";
import { CommunityScreen } from "@/components/community-screen";
import { NeighbourConfirmation } from "@/components/neighbour-ui";
import { Button, ErrorText } from "@/components/ui";
import { activityCopy } from "@/lib/activity-copy";
import { usePagedResource } from "@/lib/live-resource";
import { neighbourApi } from "@/lib/neighbour-api";
import { neighbourCopy } from "@/lib/neighbour-copy";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, controls, spacing } from "@/theme/tokens.json";

type Person = { id: string; display_name: string };

export default function BlockedPeopleScreen() {
  const { session } = useSession();
  return (
    <BlockedPeople key={session?.user.id} authUserId={session?.user.id ?? ""} />
  );
}

function BlockedPeople({ authUserId }: { authUserId: string }) {
  const { locale } = useOnboardingText();
  const copy = neighbourCopy[locale];
  const list = usePagedResource(
    useCallback(
      (cursor?: string | null) => neighbourApi(authUserId).blocks(cursor),
      [authUserId],
    ),
  );
  const [selected, setSelected] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const lock = useRef(false);

  async function unblock() {
    if (!selected || lock.current) return;
    lock.current = true;
    setSelected(null);
    setBusy(true);
    setError(false);
    try {
      await neighbourApi(authUserId).unblock(selected.id);
      await list.reload();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }

  return (
    <CommunityScreen
      showDemoPreview={false}
      design
      back
      title={copy.blockedPeople}
      subtitle={copy.blockedIntro}
    >
      <ActivityStatus
        loading={list.loading}
        error={list.error}
        retry={list.retry}
      />
      {!list.loading && !list.error && !list.items.length ? (
        <ActivityText>{copy.noBlocks}</ActivityText>
      ) : null}
      {error ? <ErrorText>{activityCopy[locale].actionError}</ErrorText> : null}
      {list.items.map((person) => (
        <View key={person.id} style={styles.row}>
          <View style={styles.name}>
            <ActivityText strong>{person.display_name}</ActivityText>
          </View>
          <Button
            label={copy.unblock}
            variant="text"
            labelStyle={localizedType("field-label", locale)}
            disabled={busy || list.loading || list.error}
            onPress={() => setSelected(person)}
          />
        </View>
      ))}
      {list.cursor && !list.error ? (
        <Button
          variant="secondary"
          label={activityCopy[locale].loadMore}
          disabled={busy || list.loading}
          onPress={list.loadMore}
        />
      ) : null}
      {selected ? (
        <NeighbourConfirmation
          title={copy.confirmUnblock(selected.display_name)}
          confirmLabel={copy.unblock}
          cancelLabel={copy.cancel}
          onConfirm={unblock}
          onCancel={() => setSelected(null)}
        >
          <ActivityText>{copy.unblockDetail}</ActivityText>
        </NeighbourConfirmation>
      ) : null}
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: controls["touch-target"],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["control-gap"],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  name: { flex: 1 },
});
