import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ActivityStatus, ActivityText } from "@/components/activity-ui";
import { CommunityScreen } from "@/components/community-screen";
import { NeighbourHeading } from "@/components/neighbour-ui";
import { Button } from "@/components/ui";
import { activityCopy, formatActivityDate } from "@/lib/activity-copy";
import { useLiveResource, usePagedResource } from "@/lib/live-resource";
import {
  exchangeLabel,
  isUnavailable,
  isUuid,
  neighbourApi,
  optionalVisible,
  partnerFor,
} from "@/lib/neighbour-api";
import { neighbourCopy, shortExchangeDate } from "@/lib/neighbour-copy";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, controls, fonts, spacing } from "@/theme/tokens.json";

export default function NeighbourProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile } = useSession();
  return (
    <NeighbourProfile
      key={`${session?.user.id}:${id}`}
      id={id}
      authUserId={session?.user.id ?? ""}
      profileId={profile.status === "ready" ? profile.profile.id : ""}
    />
  );
}

function NeighbourProfile({
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
  const api = useMemo(() => neighbourApi(authUserId), [authUserId]);
  const resource = useLiveResource(
    useCallback(async () => {
      if (!authUserId || !isUuid(id) || id === profileId)
        return { status: "unavailable" } as const;
      try {
        const [person, pair] = await Promise.all([
          api.profile(id),
          api.pair(id),
        ]);
        return { status: "ready", person, pair } as const;
      } catch (error) {
        if (isUnavailable(error)) return { status: "unavailable" } as const;
        throw error;
      }
    }, [api, authUserId, id, profileId]),
  );
  const listing = useLiveResource(
    useCallback(async () => {
      if (!authUserId || !isUuid(id) || id === profileId) return null;
      const page = await optionalVisible(api.listings(id));
      return page?.items.find((item) => item.status === "active") ?? null;
    }, [api, authUserId, id, profileId]),
  );
  const openRequests = useLiveResource(
    useCallback(async () => {
      if (!authUserId || !isUuid(id) || id === profileId) return [];
      const page = await optionalVisible(api.openRequests(id));
      return page?.items ?? [];
    }, [api, authUserId, id, profileId]),
  );
  const data = resource.data?.status === "ready" ? resource.data : null;
  const available = listing.data;
  const name = data?.person.display_name;
  const languages = data?.person.languages
    .map((language) => copy.languages[language])
    .filter(Boolean);

  return (
    <CommunityScreen
      design
      back
      title={name ?? copy.profile}
      subtitle={
        languages?.length
          ? copy.speaks(languages.join(locale === "ja" ? "、" : ", "))
          : undefined
      }
    >
      <ActivityStatus
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
      />
      {resource.data?.status === "unavailable" ? (
        <ActivityText>{copy.unavailable}</ActivityText>
      ) : null}
      {data && name && !resource.error ? (
        <>
          {data.person.avatar_url ? (
            <Image
              source={data.person.avatar_url}
              style={styles.avatar}
              cachePolicy="none"
              accessible={false}
            />
          ) : null}
          {data.person.intro ? (
            <View>
              <ActivityText strong>{copy.intro}</ActivityText>
              <ActivityText>{data.person.intro}</ActivityText>
            </View>
          ) : null}
          {data.person.happy_to_help_with ? (
            <View style={styles.row}>
              {!data.person.avatar_url ? (
                <View style={styles.avatar} accessible={false} aria-hidden>
                  <Text
                    style={[localizedType("field-label", locale), styles.green]}
                  >
                    {Array.from(name.trim())[0]?.toLocaleUpperCase(locale)}
                  </Text>
                </View>
              ) : null}
              <View style={styles.text}>
                <ActivityText strong>{copy.happyToHelp}</ActivityText>
                <ActivityText>{data.person.happy_to_help_with}</ActivityText>
              </View>
            </View>
          ) : null}
          {available && !listing.error ? (
            <View style={styles.row}>
              {available.photo_url ? (
                <Image
                  source={available.photo_url}
                  accessible={false}
                  style={styles.photo}
                />
              ) : null}
              <View style={styles.text}>
                <ActivityText strong>{available.title}</ActivityText>
                <ActivityText>
                  {available.kind === "tool" &&
                  available.lend_mode !== "help_only"
                    ? copy.availableToBorrow
                    : copy.availableToHelp}
                </ActivityText>
              </View>
              <Button
                label={copy.viewListing}
                accessibilityLabel={`${copy.viewListing}: ${available.title}`}
                variant="text"
                labelStyle={localizedType("field-label", locale)}
                onPress={() =>
                  router.push({
                    pathname: "/tools/[id]",
                    params: { id: available.id },
                  })
                }
              />
            </View>
          ) : null}
          {listing.error ? (
            <ActivityStatus
              loading={listing.loading}
              error
              retry={listing.reload}
            />
          ) : null}
          <View style={styles.counts}>
            <Count value={data.pair.i_helped_them} label={copy.given(name)} />
            <Count
              value={data.pair.they_helped_me}
              label={copy.receivedHelp(name)}
            />
          </View>
          <NeighbourHeading>{copy.openRequests}</NeighbourHeading>
          <ActivityText>{copy.openRequestsHint}</ActivityText>
          {openRequests.data?.map((item) => (
            <View key={item.id} style={styles.row}>
              <View style={styles.text}>
                <ActivityText strong>{item.polite_text}</ActivityText>
              </View>
              <Button
                label={copy.offerHelp}
                accessibilityLabel={`${copy.offerHelp}: ${item.polite_text}`}
                variant="text"
                labelStyle={localizedType("field-label", locale)}
                onPress={() =>
                  router.push({
                    pathname: "/requests/[id]",
                    params: { id: item.id },
                  })
                }
              />
            </View>
          ))}
          {openRequests.data?.length === 0 &&
          !openRequests.loading &&
          !openRequests.error ? (
            <ActivityText>{copy.noOpenRequests}</ActivityText>
          ) : null}
          <ActivityStatus
            loading={openRequests.loading}
            error={openRequests.error}
            retry={openRequests.reload}
          />
          <NeighbourHeading>{copy.history}</NeighbourHeading>
          <PairHistory
            authUserId={authUserId}
            profileId={profileId}
            partnerId={id}
            partnerName={name}
            lastExchangeAt={data.pair.last_exchange_at}
          />
          <Button
            label={copy.reportOrBlock}
            variant="text"
            labelStyle={localizedType("field-label", locale)}
            onPress={() =>
              router.push({
                pathname: "/report-or-block",
                params: { targetId: id, targetType: "user" },
              })
            }
          />
        </>
      ) : null}
    </CommunityScreen>
  );
}

function Count({ value, label }: { value: number; label: string }) {
  const localizedType = useLocalizedType();
  const { locale } = useOnboardingText();
  return (
    <View style={styles.count}>
      <Text style={[localizedType("screen-title", locale), styles.countValue]}>
        {value.toLocaleString(locale)}
      </Text>
      <ActivityText>{label}</ActivityText>
    </View>
  );
}

function PairHistory({
  authUserId,
  profileId,
  partnerId,
  partnerName,
  lastExchangeAt,
}: {
  authUserId: string;
  profileId: string;
  partnerId: string;
  partnerName: string;
  lastExchangeAt: string | null;
}) {
  const localizedType = useLocalizedType();
  const { locale } = useOnboardingText();
  const copy = neighbourCopy[locale];
  const history = usePagedResource(
    useCallback(
      async (initial?: string | null) => {
        const api = neighbourApi(authUserId);
        let cursor = initial;
        do {
          const page = await api.exchanges(cursor);
          const shared = page.items.filter(
            (item) => partnerFor(item, profileId) === partnerId,
          );
          if (shared.length || !page.next_cursor) {
            return {
              items: await Promise.all(
                shared.map(async (exchange) => ({
                  id: exchange.id,
                  exchange,
                  title: await exchangeLabel(api, exchange),
                })),
              ),
              next_cursor: page.next_cursor,
            };
          }
          cursor = page.next_cursor;
        } while (cursor);
        return { items: [], next_cursor: null };
      },
      [authUserId, profileId, partnerId],
    ),
  );
  return (
    <View style={styles.history}>
      {history.items.map(({ id, exchange, title }, index) => {
        const lent = exchange.helper_user_id === profileId;
        const isLoan = exchange.mode === "loan";
        const heading =
          isLoan && title
            ? lent
              ? copy.lentItem(title)
              : copy.borrowedItem(title)
            : (title ?? (isLoan ? copy.loan : copy.completed));
        const timestamp =
          exchange.completed_at ?? (index === 0 ? lastExchangeAt : null);
        const date = shortExchangeDate(timestamp, locale);
        const role = lent
          ? copy.given(partnerName)
          : copy.receivedHelp(partnerName);
        const label = isLoan
          ? activityCopy[locale].viewLoan
          : copy.viewExchange;
        return (
          <View key={id} style={styles.row}>
            <View style={styles.text}>
              <ActivityText strong>{heading}</ActivityText>
              <Text
                style={[
                  localizedType("supporting", locale),
                  styles.detailLabel,
                ]}
                accessibilityLabel={
                  timestamp
                    ? `${role} · ${formatActivityDate(timestamp, locale)}`
                    : role
                }
              >
                {date ? `${role} · ${date}` : role}
              </Text>
            </View>
            <Button
              label={label}
              accessibilityLabel={`${label}: ${heading}`}
              variant="text"
              labelStyle={localizedType("field-label", locale)}
              onPress={() =>
                router.push({
                  pathname: isLoan ? "/loans/[id]" : "/exchanges/[id]",
                  params: { id },
                })
              }
            />
          </View>
        );
      })}
      {!history.loading && !history.error && history.items.length === 0 ? (
        <ActivityText>{copy.noHistory}</ActivityText>
      ) : null}
      <ActivityStatus
        loading={history.loading}
        error={history.error}
        retry={history.retry}
      />
      {history.cursor ? (
        <Button
          label={activityCopy[locale].loadMore}
          variant="secondary"
          disabled={history.loading || history.error}
          onPress={history.loadMore}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["control-gap"],
  },
  text: { flex: 1 },
  detailLabel: { color: colors.secondary },
  counts: { flexDirection: "row", gap: spacing["control-gap"] },
  count: {
    flex: 1,
    backgroundColor: colors.wash,
    padding: spacing["control-gap"],
    borderRadius: controls.radius,
    gap: 4,
  },
  green: { color: colors.action },
  countValue: { color: colors.action, fontFamily: fonts.wordmark },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.wash,
    alignItems: "center",
    justifyContent: "center",
  },
  photo: { width: 56, height: 56, borderRadius: controls.radius },
  history: { gap: spacing["related-gap"] },
});
