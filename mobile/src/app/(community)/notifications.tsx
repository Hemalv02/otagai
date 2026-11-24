import { router } from "expo-router";
import { useCallback, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ActivityStatus, ActivityText } from "@/components/activity-ui";
import { CommunityScreen } from "@/components/community-screen";
import { Button, ErrorText } from "@/components/ui";
import { api } from "@/lib/api";
import { activityCopy, notificationDescription } from "@/lib/activity-copy";
import { activityLocale } from "@/lib/activity-screen-copy";
import { assistantCopy } from "@/lib/assistant-copy";
import { requestNotificationId } from "@/lib/request-ripple";
import { useLiveResource, usePagedResource } from "@/lib/live-resource";
import { isUuid } from "@/lib/neighbour-api";
import { neighbourCopy } from "@/lib/neighbour-copy";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";

import { colors, controls, spacing } from "@/theme/tokens.json";

export default function NotificationsScreen() {
  const localizedType = useLocalizedType();
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

  const unread = counts.data?.notifications;
  const language = activityLocale(locale);
  const dateLabel = new Intl.DateTimeFormat(language, { dateStyle: "long" });
  const timeLabel = new Intl.DateTimeFormat(language, { timeStyle: "short" });

  return (
    <CommunityScreen
      design
      back
      title={copy.notifications}
      backAction={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.preferences}
          style={({ pressed }) => [
            styles.preferencesButton,
            pressed && styles.pressed,
          ]}
          onPress={() => router.push("/notification-preferences")}
        >
          <Image
            accessible={false}
            source={require("../../../assets/images/activity/preferences-gear.png")}
            style={styles.preferencesIcon}
          />
        </Pressable>
      }
      renderList={(header) => (
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.content}
          data={feed.items}
          keyExtractor={(item) => item.id}
          refreshing={feed.loading && feed.items.length === 0}
          onRefresh={refresh}
          ListHeaderComponent={
            <View style={styles.header}>
              {header}
              <View style={styles.toolbar}>
                <View accessibilityRole="radiogroup" style={styles.filters}>
                  {(["all", "unread"] as const).map((option) => {
                    const selected = filter === option;
                    const label =
                      option === "unread" && unread !== undefined
                        ? `${copy.unread} (${unread.toLocaleString(language)})`
                        : copy[option];

                    return (
                      <Pressable
                        key={option}
                        accessibilityRole="radio"
                        aria-checked={selected}
                        accessibilityState={{
                          checked: selected,
                          disabled: busy,
                        }}
                        disabled={busy}
                        style={[
                          styles.filter,
                          selected && styles.selectedFilter,
                        ]}
                        onPress={() => setFilter(option)}
                      >
                        <Text
                          style={[
                            localizedType("field-label", locale),
                            selected
                              ? styles.activeLabel
                              : styles.inactiveLabel,
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Button
                  label={copy.markAll}
                  variant="text"
                  labelStyle={localizedType("field-label", locale)}
                  busy={busy}
                  disabled={feed.loading || !unread}
                  onPress={() => markRead()}
                />
              </View>
              {actionError ? <ErrorText>{copy.actionError}</ErrorText> : null}
              {counts.error ? (
                <ActivityStatus
                  loading={counts.loading}
                  error
                  retry={counts.reload}
                />
              ) : null}
            </View>
          }
          renderItem={({ item, index }) => {
            const date = new Date(item.created_at);
            const previous = feed.items[index - 1];
            const validDate = Number.isFinite(date.getTime());
            const newDay =
              date.toDateString() !==
              new Date(previous?.created_at ?? "").toDateString();
            const exchangeId = item.payload.exchange_id;
            const hasLoan =
              item.type === "extension" && typeof exchangeId === "string";
            const requestId = requestNotificationId(
              item.type,
              item.payload.request_id,
            );
            const isUnread = !item.read_at;
            const thankYouId = item.payload.thank_you_id;

            return (
              <View>
                {!previous || newDay ? (
                  <Text
                    accessibilityRole="header"
                    style={[localizedType("field-label", locale), styles.date]}
                  >
                    {validDate ? dateLabel.format(date) : copy.noDate}
                  </Text>
                ) : null}
                <View style={styles.row}>
                  <View style={styles.marker}>
                    {isUnread ? <View style={styles.dot} /> : null}
                  </View>
                  <View style={styles.detail}>
                    <Text
                      style={[
                        localizedType(
                          isUnread ? "field-label" : "supporting",
                          locale,
                        ),
                        styles.description,
                      ]}
                    >
                      {notificationDescription(item, locale)}
                    </Text>
                    {validDate ? (
                      <ActivityText>{timeLabel.format(date)}</ActivityText>
                    ) : null}
                    {item.type === "thank_you" && isUuid(thankYouId) ? (
                      <Button
                        label={neighbourCopy[locale].viewThanks}
                        variant="text"
                        labelStyle={localizedType("field-label", locale)}
                        onPress={() => {
                          if (isUnread) void markRead(item.id);
                          router.push({
                            pathname: "/thank-yous/[id]",
                            params: { id: thankYouId },
                          });
                        }}
                      />
                    ) : null}
                    {requestId ? (
                      <Button
                        label={assistantCopy[locale].viewRequest}
                        variant="text"
                        labelStyle={localizedType("field-label", locale)}
                        onPress={() => {
                          if (isUnread) void markRead(item.id);
                          router.push({
                            pathname: "/requests/[id]",
                            params: { id: requestId },
                          });
                        }}
                      />
                    ) : null}
                    {hasLoan ? (
                      <Button
                        label={copy.viewLoan}
                        variant="text"
                        labelStyle={localizedType("field-label", locale)}
                        onPress={() =>
                          router.push({
                            pathname: "/loans/[id]",
                            params: { id: exchangeId },
                          })
                        }
                      />
                    ) : null}
                  </View>
                  {isUnread ? (
                    <Button
                      label={copy.markRead}
                      variant="text"
                      labelStyle={localizedType("field-label", locale)}
                      disabled={busy || feed.loading}
                      onPress={() => markRead(item.id)}
                    />
                  ) : null}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            !feed.loading && !feed.error ? (
              <View style={styles.empty}>
                <ActivityText>
                  {filter === "unread" ? copy.noUnread : copy.noNotifications}
                </ActivityText>
              </View>
            ) : undefined
          }
          ListFooterComponent={
            <View style={styles.footer}>
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
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 540,
    alignSelf: "center",
    paddingHorizontal: spacing["screen-gutter"],
    paddingTop: 4,
    paddingBottom: spacing["screen-gutter"],
  },
  header: { gap: 4 },
  preferencesButton: {
    width: controls["touch-target"],
    height: controls["touch-target"],
    alignItems: "center",
    justifyContent: "center",
    borderRadius: controls.radius,
  },
  pressed: { backgroundColor: colors.wash },
  preferencesIcon: { width: 24, height: 24 },
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: spacing["related-gap"],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing["related-gap"],
  },
  filter: {
    minHeight: controls["touch-target"],
    minWidth: controls["touch-target"],
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  selectedFilter: { borderBottomColor: colors.action },
  activeLabel: { color: colors.action },
  inactiveLabel: { color: colors.secondary },
  date: {
    color: colors.secondary,
    backgroundColor: colors.paper,
    borderRadius: 8,
    marginTop: spacing["related-gap"],
    paddingHorizontal: spacing["control-gap"],
    paddingVertical: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing["related-gap"],
    paddingVertical: spacing["control-gap"],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  marker: { width: 12, alignItems: "center", paddingTop: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.action },
  detail: { flex: 1, minWidth: 0, gap: 2 },
  description: { color: colors.ink },
  empty: { paddingVertical: 32 },
  footer: { paddingTop: spacing["card-inset"], gap: spacing["related-gap"] },
});
