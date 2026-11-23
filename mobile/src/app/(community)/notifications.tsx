import { router } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, View } from "react-native";
import {
  ActivityStatus,
  ActivityText,
  activityStyles as styles,
} from "@/components/activity-ui";
import { CommunityScreen } from "@/components/community-screen";
import { Button, Choice, ErrorText } from "@/components/ui";
import { api } from "@/lib/api";
import {
  activityCopy,
  formatActivityDate,
  notificationDescription,
} from "@/lib/activity-copy";
import { useLiveResource, usePagedResource } from "@/lib/live-resource";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";

export default function NotificationsScreen() {
  const { locale } = useOnboardingText();
  const copy = activityCopy[locale];
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);
  const feed = usePagedResource(
    useCallback(
      (cursor?: string | null) =>
        api.listNotifications(filter === "unread", cursor),
      [filter],
    ),
  );
  const counts = useLiveResource(api.getUnreadCounts);

  async function refresh() {
    await Promise.all([feed.reload(), counts.reload()]);
  }

  async function markRead(id?: string) {
    if (busy) return;
    setBusy(true);
    setActionError(false);
    try {
      if (id) await api.markNotificationRead(id);
      else await api.markAllNotificationsRead();
      await refresh();
    } catch {
      setActionError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <CommunityScreen live scroll={false} back title={copy.notifications}>
      <Button
        label={copy.preferences}
        variant="text"
        labelStyle={localizedType("field-label", locale)}
        onPress={() => router.push("/notification-preferences")}
      />
      <View style={styles.row}>
        <Choice
          options={[
            { value: "all", label: copy.all },
            { value: "unread", label: copy.unread },
          ]}
          value={filter}
          onChange={setFilter}
          disabled={busy}
          labelStyle={() => localizedType("field-label", locale)}
        />
        <ActivityText>
          {copy.unread}: {counts.data?.notifications ?? "—"}
        </ActivityText>
      </View>
      <Button
        label={copy.markAll}
        variant="secondary"
        busy={busy}
        disabled={feed.loading || !counts.data?.notifications}
        onPress={() => markRead()}
      />
      {actionError ? <ErrorText>{copy.actionError}</ErrorText> : null}
      {counts.error ? (
        <ActivityStatus loading={counts.loading} error retry={counts.reload} />
      ) : null}
      <FlatList
        style={styles.flex}
        data={feed.items}
        keyExtractor={(item) => item.id}
        refreshing={feed.loading}
        onRefresh={refresh}
        renderItem={({ item }) => (
          <View style={[styles.card, !item.read_at && styles.unread]}>
            <ActivityText strong>
              {notificationDescription(item, locale)}
            </ActivityText>
            <ActivityText>
              {formatActivityDate(item.created_at, locale)}
            </ActivityText>
            {item.read_at ? (
              <ActivityText>{copy.read}</ActivityText>
            ) : (
              <Button
                label={copy.markRead}
                variant="text"
                disabled={busy || feed.loading}
                onPress={() => markRead(item.id)}
              />
            )}
            {item.type === "extension" &&
            typeof item.payload.exchange_id === "string" ? (
              <Button
                label={copy.viewLoan}
                variant="text"
                onPress={() =>
                  router.push({
                    pathname: "/loans/[id]",
                    params: { id: item.payload.exchange_id as string },
                  })
                }
              />
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          !feed.loading && !feed.error ? (
            <ActivityText>
              {filter === "unread" ? copy.noUnread : copy.noNotifications}
            </ActivityText>
          ) : undefined
        }
        ListFooterComponent={
          <View style={styles.section}>
            <ActivityStatus
              loading={feed.loading}
              error={feed.error}
              retry={feed.retry}
            />
            {feed.cursor && !feed.error ? (
              <Button
                label={copy.loadMore}
                variant="secondary"
                disabled={feed.loading || busy}
                onPress={feed.loadMore}
              />
            ) : null}
          </View>
        }
      />
    </CommunityScreen>
  );
}
