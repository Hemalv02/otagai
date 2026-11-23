import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { ListingRow, ListingRowSkeleton } from "@/components/listing-row";
import { RequestNotice } from "@/components/request-notice";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { useCommunityDemo } from "@/lib/community-demo";
import { lendingCopy } from "@/lib/lending-copy";
import { listingReadCopy, requestApiError } from "@/lib/listing-read";
import {
  canRetry,
  createLatestRequest,
  firstPageFailed,
  firstPageLoaded,
  initialBrowseState,
  listingStatusLabel,
  NEARBY_FETCH,
  NEARBY_LIMIT,
  nearbyRows,
  startFirstPage,
  visibleBrowseState,
  type BrowseState,
} from "@/lib/listing-workflow";
import { useMemberships } from "@/lib/memberships";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, spacing } from "@/theme/tokens.json";

const homeCopy = {
  en: {
    greet: (name: string) => `Hello, ${name}`,
    ask: "Ask",
    lend: "Lend",
    browse: "Browse tools and skills",
    nearby: "Available nearby",
    today: "Today",
    empty: "There are no open requests in your circle.",
    demo: "Demo activity",
    preview: (name: string) => `Preview as ${name}`,
    backToYou: "Return to my view",
    nearbyEmptyTitle: "Nothing nearby yet",
    nearbyEmptyDetail:
      "Ask for something you need or lend a tool to get started.",
    nearbyError: "Could not load nearby listings.",
  },
  ja: {
    greet: (name: string) => `こんにちは、${name}`,
    ask: "お願いする",
    lend: "貸す",
    browse: "道具とスキルを探す",
    nearby: "近所で借りられるもの",
    today: "今日",
    empty: "サークルに募集中の依頼はありません。",
    demo: "デモのアクティビティ",
    preview: (name: string) => `${name}の画面を見る`,
    backToYou: "自分の画面に戻る",
    nearbyEmptyTitle: "近所にはまだ何もありません",
    nearbyEmptyDetail:
      "必要なものをお願いするか、道具を貸して始めましょう。",
    nearbyError: "近所の掲載を読み込めませんでした。",
  },
  bn: {
    greet: (name: string) => `স্বাগতম, ${name}`,
    ask: "সাহায্য চাই",
    lend: "ধার দিন",
    browse: "জিনিসপত্র ও সাহায্য দেখুন",
    nearby: "কাছাকাছি পাওয়া যাচ্ছে",
    today: "আজ",
    empty: "আপনার দলে কোনো খোলা অনুরোধ নেই।",
    demo: "ডেমো কার্যকলাপ",
    preview: (name: string) => `${name} হিসেবে দেখুন`,
    backToYou: "নিজের ভিউতে ফিরুন",
    nearbyEmptyTitle: "কাছাকাছি এখনো কিছু নেই",
    nearbyEmptyDetail:
      "প্রয়োজনের জিনিস চান অথবা একটি যন্ত্র ধার দিয়ে শুরু করুন।",
    nearbyError: "কাছাকাছির তালিকা লোড করা যায়নি।",
  },
};

export default function Home() {
  const { state } = useMemberships();
  const { t, locale } = useOnboardingText();
  const circle =
    state.status === "ready"
      ? state.items.find((membership) => membership.status === "approved")
          ?.circle
      : undefined;
  const circleName =
    circle?.name_translations[locale] ??
    circle?.name ??
    t("circleNameFallback");
  return (
    <CircleHome
      circleName={
        typeof circleName === "string" ? circleName : t("circleNameFallback")
      }
    />
  );
}

function CircleHome({ circleName }: { circleName: string }) {
  const { locale } = useOnboardingText();
  const { actor, people, requests, switchActor } = useCommunityDemo();
  const { session, profile } = useSession();
  const account = session?.user.id ?? null;
  const profileId = profile.status === "ready" ? profile.profile.id : null;
  const copy = homeCopy[locale];
  const label = localizedType("field-label", locale);
  const button = localizedType("button", locale);
  const supporting = localizedType("supporting", locale);
  const listingCopy = lendingCopy[locale];
  const readCopy = listingReadCopy[locale];
  const [nearby, setNearby] = useState<BrowseState>(initialBrowseState);
  const [nearbyRequests] = useState(createLatestRequest);
  const [tick, setTick] = useState(0);
  const focusedOnce = useRef(false);
  const key = account ?? "";
  const view = visibleBrowseState(nearby, key);
  const rows = nearbyRows(view.rows, profileId, NEARBY_LIMIT);

  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) setTick((current) => current + 1);
      focusedOnce.current = true;
    }, []),
  );

  useEffect(() => {
    if (!account) return;
    const request = nearbyRequests.start();
    api
      .listListings(
        { limit: NEARBY_FETCH },
        { authUserId: account, signal: request.signal },
      )
      .then((page) => {
        if (!request.isCurrent()) return;
        setNearby((current) => firstPageLoaded(current, account, page));
      })
      .catch((error) => {
        if (!request.isCurrent()) return;
        setNearby((current) =>
          firstPageFailed(current, account, requestApiError(error)),
        );
      });
    return () => nearbyRequests.cancel();
  }, [account, tick, nearbyRequests]);

  function retryNearby() {
    setNearby((current) =>
      current.status === "ready"
        ? startFirstPage(current, key)
        : initialBrowseState(key),
    );
    setTick((current) => current + 1);
  }

  const retryButton = (
    <Button
      label={listingCopy.retry}
      labelStyle={label}
      variant="text"
      onPress={retryNearby}
    />
  );
  const sectionTitle = localizedType("section-heading", locale);
  const openRequests = requests.filter(
    (request) => request.createdBy !== actor && request.status === "open",
  );

  return (
    <CommunityScreen
      title={copy.greet(people[actor].name)}
      eyebrow={circleName}
    >
      <View style={styles.actions}>
        <Button
          label={copy.ask}
          labelStyle={button}
          style={styles.action}
          onPress={() => router.push("/ask")}
        />
        <Button
          label={copy.lend}
          labelStyle={[button, styles.green]}
          style={[styles.action, styles.secondaryButton]}
          variant="secondary"
          onPress={() => router.push("/tools/add")}
        />
      </View>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={[sectionTitle, styles.ink]}>
          {copy.nearby}
        </Text>
        {view.status === "loading" ? (
          <View
            accessible
            accessibilityState={{ busy: true }}
            accessibilityRole="progressbar"
            accessibilityLabel={listingCopy.loadingListings}
          >
            <ListingRowSkeleton />
            <ListingRowSkeleton />
          </View>
        ) : view.status === "error" ? (
          <View style={styles.notice}>
            <Text style={[supporting, styles.secondary]}>
              {view.firstError === "auth" ? readCopy.auth : copy.nearbyError}
            </Text>
            {canRetry(view.firstError) ? retryButton : null}
          </View>
        ) : rows.length === 0 ? (
          <RequestNotice
            title={copy.nearbyEmptyTitle}
            detail={copy.nearbyEmptyDetail}
            locale={locale}
          />
        ) : (
          rows.map((listing) => (
            <ListingRow
              key={listing.id}
              accessibilityRole="link"
              title={listing.title}
              description={
                listing.kind === "skill"
                  ? listingCopy.oneSkill
                  : listingCopy.toolOrItem
              }
              detail={listingStatusLabel(listing, false, {
                yourListing: listingCopy.yourListing,
                available: listingCopy.available,
                askForTime: listingCopy.askForTime,
                lentOut: listingCopy.lentOut,
                paused: listingCopy.paused,
              })}
              photo={listing.photo_url ? { uri: listing.photo_url } : undefined}
              onPress={() =>
                router.push({
                  pathname: "/tools/[id]",
                  params: { id: listing.id },
                })
              }
            />
          ))
        )}
        {view.refreshError ? (
          <View style={styles.notice}>
            <Text style={[supporting, styles.secondary]}>
              {listingCopy.refreshError}
            </Text>
            {canRetry(view.refreshError) ? retryButton : null}
          </View>
        ) : null}
        <Button
          label={copy.browse}
          labelStyle={label}
          variant="text"
          onPress={() => router.navigate("/tools")}
        />
      </View>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={[sectionTitle, styles.ink]}>
          {copy.today}
        </Text>
        {openRequests.length ? (
          openRequests.map((request) => (
            <ListingRow
              key={request.id}
              title={request.title}
              description={people[request.createdBy].name}
              detail={request.timing}
              photo={
                request.id === "carry-rice"
                  ? require("../../../../assets/images/lending-tanaka-thumbnail.png")
                  : undefined
              }
              portrait
              onPress={() =>
                router.push({
                  pathname: "/requests/[id]",
                  params: { id: request.id },
                })
              }
            />
          ))
        ) : (
          <Text style={[supporting, styles.secondary]}>{copy.empty}</Text>
        )}
      </View>
      <View style={styles.demo}>
        <Text style={[supporting, styles.secondary]}>{copy.demo}</Text>
        <Button
          variant="text"
          label={
            actor === "member"
              ? copy.preview(people.neighbour.name)
              : copy.backToYou
          }
          labelStyle={label}
          onPress={switchActor}
        />
      </View>
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: spacing["control-gap"] },
  action: { flex: 1 },
  secondaryButton: { borderColor: colors.control },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
  green: { color: colors.action },
  section: { gap: spacing["related-gap"] },
  notice: { gap: spacing["related-gap"] },
  demo: {
    borderTopWidth: 1,
    borderColor: colors.rule,
    paddingTop: spacing["related-gap"],
  },
});
