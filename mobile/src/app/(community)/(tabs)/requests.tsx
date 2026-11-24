import { router, useFocusEffect } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { assistantIcons } from "@/components/assistant-widgets";
import { CommunityScreen } from "@/components/community-screen";
import { Button, ErrorText } from "@/components/ui";
import { assistantError } from "@/lib/assistant-api";
import { assistantCopy } from "@/lib/assistant-copy";
import { liveRequestCopy } from "@/lib/live-request-copy";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { requestCopy } from "@/lib/request-demo-copy";
import { activityCopy } from "@/lib/activity-copy";
import { neighbourCopy } from "@/lib/neighbour-copy";
import { type IncomingRequest, requestsApi } from "@/lib/requests-api";
import { colors, controls, spacing } from "@/theme/tokens.json";

type Feed = "mine" | "incoming";
const feeds: Feed[] = ["mine", "incoming"];

export default function RequestsScreen() {
  const { locale, t } = useOnboardingText();
  const copy = requestCopy[locale];
  const live = liveRequestCopy[locale];
  const words = assistantCopy[locale];
  const labels = { mine: copy.myRequests, incoming: live.incoming };
  const [feed, setFeed] = useState<Feed>("mine");
  const [rows, setRows] = useState<IncomingRequest[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const version = useRef(0);

  const load = useCallback(
    async (next?: string) => {
      const current = ++version.current;
      setBusy(true);
      setError(null);
      try {
        const data =
          feed === "mine"
            ? await requestsApi.mine(next).then((page) => ({
                next_cursor: page.next_cursor,
                items: page.items.map((request) => ({
                  request,
                  seen: true,
                  my_response_status: null,
                })),
              }))
            : await requestsApi.incoming(next);
        if (current !== version.current) return;
        setRows((previous) =>
          next
            ? [
                ...previous,
                ...data.items.filter(
                  (item) =>
                    !previous.some((row) => row.request.id === item.request.id),
                ),
              ]
            : data.items,
        );
        setCursor(data.next_cursor);
      } catch (cause) {
        if (current === version.current) setError(cause);
      } finally {
        if (current === version.current) setBusy(false);
      }
    },
    [feed],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        version.current += 1;
      };
    }, [load]),
  );

  function switchFeed(next: Feed) {
    if (next === feed) return;
    version.current += 1;
    setRows([]);
    setCursor(null);
    setError(null);
    setBusy(true);
    setFeed(next);
  }

  const supporting = localizedType("supporting", locale);
  const label = localizedType("field-label", locale);

  return (
    <CommunityScreen title={copy.requests} showDemoPreview={false}>
      <Button
        label={activityCopy[locale].loans}
        labelStyle={localizedType("button", locale)}
        variant="secondary"
        onPress={() => router.push("/loans")}
      />
      <Button
        label={neighbourCopy[locale].neighbours}
        labelStyle={label}
        variant="text"
        onPress={() => router.push("/neighbours")}
      />
      <View style={styles.tabs}>
        {feeds.map((key) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: feed === key }}
            onPress={() => switchFeed(key)}
            style={[styles.tab, feed === key && styles.selectedTab]}
          >
            <Text
              style={[label, feed === key ? styles.green : styles.secondary]}
            >
              {labels[key]}
            </Text>
          </Pressable>
        ))}
      </View>
      {feed === "mine" ? (
        <Button
          label={copy.newRequest}
          labelStyle={label}
          onPress={() => router.navigate("/assistant")}
        />
      ) : null}
      {busy && !rows.length ? (
        <View
          accessibilityLabel={words.loading}
          accessible
          style={styles.cards}
        >
          <View style={styles.skeleton} />
          <View style={styles.skeleton} />
        </View>
      ) : null}
      {rows.map(({ request, seen, my_response_status }) => (
        <Pressable
          key={request.id}
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: "/requests/[id]",
              params: { id: request.id },
            })
          }
          style={styles.card}
        >
          <View style={styles.cardText}>
            <Text
              numberOfLines={2}
              style={[localizedType("body", locale), styles.ink]}
            >
              {request.polite_text}
            </Text>
            <View style={styles.tags}>
              <Text style={[supporting, styles.green]}>
                {live.status[request.status]}
              </Text>
              {feed === "incoming" && !seen && request.status === "open" ? (
                <Text style={[supporting, styles.green]}>
                  {live.newRequest}
                </Text>
              ) : null}
              {feed === "incoming" && request.direct_to_user_id ? (
                <Text style={[supporting, styles.secondary]}>
                  {live.direct}
                </Text>
              ) : null}
              {my_response_status ? (
                <Text style={[supporting, styles.secondary]}>
                  {live.responseStatus[my_response_status]}
                </Text>
              ) : null}
            </View>
          </View>
          <SymbolView
            name={assistantIcons.next}
            size={16}
            tintColor={colors.action}
            accessible={false}
          />
        </Pressable>
      ))}
      {error ? (
        <>
          <ErrorText>{assistantError(error, locale)}</ErrorText>
          <Button
            variant="text"
            label={t("tryAgain")}
            labelStyle={label}
            onPress={() => void load()}
          />
        </>
      ) : !busy && !rows.length ? (
        <Text style={[supporting, styles.secondary]}>
          {feed === "mine" ? copy.emptyMine : copy.emptyCircle}
        </Text>
      ) : null}
      {cursor && !error ? (
        <Button
          variant="secondary"
          label={words.more}
          labelStyle={label}
          busy={busy}
          onPress={() => void load(cursor)}
        />
      ) : null}
      {!busy && !error && feed === "incoming" ? (
        <Button
          variant="text"
          label={live.refresh}
          labelStyle={label}
          onPress={() => void load()}
        />
      ) : null}
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: "row",
    backgroundColor: colors.paper,
    borderRadius: controls.radius,
    padding: 4,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: controls["touch-target"],
    borderRadius: controls.radius,
    paddingHorizontal: 4,
  },
  selectedTab: { backgroundColor: colors.wash },
  cards: { gap: spacing["related-gap"] },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: spacing["card-inset"],
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: controls.radius,
  },
  cardText: { flex: 1, minWidth: 0, gap: 8 },
  skeleton: {
    minHeight: 80,
    borderRadius: controls.radius,
    backgroundColor: colors.paper,
  },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  ink: { color: colors.ink },
  green: { color: colors.action },
  secondary: { color: colors.secondary },
});
