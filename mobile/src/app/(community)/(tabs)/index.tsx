import { router, useFocusEffect } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { ListingRow, ListingRowSkeleton } from "@/components/listing-row";
import { NotificationBell } from "@/components/notification-bell";
import { RequestNotice } from "@/components/request-notice";
import { Button } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { activityCopy, formatActivityDate } from "@/lib/activity-copy";
import { todayPeople, todayRows } from "@/lib/home-today";
import { lendingCopy } from "@/lib/lending-copy";
import { useLiveResource } from "@/lib/live-resource";
import { listingReadCopy, requestApiError } from "@/lib/listing-read";
import {
  canRetry,
  createLatestRequest,
  firstPageFailed,
  firstPageLoaded,
  initialBrowseState,
  listingStatusLabel,
  NEARBY_LIMIT,
  nearbyRows,
  startFirstPage,
  visibleBrowseState,
  type BrowseState,
} from "@/lib/listing-workflow";
import { useMemberships } from "@/lib/memberships";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, controls, spacing } from "@/theme/tokens.json";

const homeCopy = {
  en: {
    greet: (name: string) => `Hello, ${name}`,
    greetFallback: "Hello",
    lentItem: "Lent item",
    ask: "Ask",
    lend: "Lend",
    family: "Family",
    browse: "Browse tools and skills",
    nearby: "Available nearby",
    today: "Today",
    empty: "Nothing needs you today.",
    todayError: "Could not load today's activity.",
    someone: "A neighbour",
    kinds: {
      borrow: "Wants to borrow",
      help: "Asks for help",
      borrow_with_help: "Borrow with help",
    },
    nearbyEmptyTitle: "Nothing nearby yet",
    nearbyEmptyDetail:
      "Ask for something you need or lend a tool to get started.",
    nearbyError: "Could not load nearby listings.",
  },
  ja: {
    greet: (name: string) => `こんにちは、${name}`,
    greetFallback: "こんにちは",
    lentItem: "貸しているもの",
    ask: "お願いする",
    lend: "貸す",
    family: "家族",
    browse: "道具とスキルを探す",
    nearby: "近所で借りられるもの",
    today: "今日",
    empty: "今日対応することはありません。",
    todayError: "今日のアクティビティを読み込めませんでした。",
    someone: "近所の人",
    kinds: {
      borrow: "借りたい",
      help: "手伝ってほしい",
      borrow_with_help: "手伝い付きで借りたい",
    },
    nearbyEmptyTitle: "近所にはまだ何もありません",
    nearbyEmptyDetail: "必要なものをお願いするか、道具を貸して始めましょう。",
    nearbyError: "近所の掲載を読み込めませんでした。",
  },
  bn: {
    greet: (name: string) => `স্বাগতম, ${name}`,
    greetFallback: "স্বাগতম",
    lentItem: "ধার দেওয়া জিনিস",
    ask: "সাহায্য চাই",
    lend: "ধার দিন",
    family: "পরিবার",
    browse: "জিনিসপত্র ও সাহায্য দেখুন",
    nearby: "কাছাকাছি পাওয়া যাচ্ছে",
    today: "আজ",
    empty: "আজ আপনার জন্য কিছু নেই।",
    todayError: "আজকের কার্যকলাপ লোড করা যায়নি।",
    someone: "একজন প্রতিবেশী",
    kinds: {
      borrow: "ধার চান",
      help: "সাহায্য চান",
      borrow_with_help: "সাহায্যসহ ধার চান",
    },
    nearbyEmptyTitle: "কাছাকাছি এখনো কিছু নেই",
    nearbyEmptyDetail: "প্রয়োজনের জিনিস চান অথবা একটি যন্ত্র ধার দিয়ে শুরু করুন।",
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

async function loadToday(me: string) {
  const rows = todayRows(await api.getHome(), me);
  const lookup = async <T,>(load: () => Promise<T>) => {
    try {
      return await load();
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  };
  const people = Object.fromEntries(
    await Promise.all(
      todayPeople(rows).map(
        async (id) =>
          [
            id,
            (await lookup(() => api.getPublicProfile(id)))?.display_name,
          ] as const,
      ),
    ),
  );
  const titles = Object.fromEntries(
    await Promise.all(
      [
        ...new Set(
          rows.flatMap((row) =>
            row.type === "due" && row.listingId ? [row.listingId] : [],
          ),
        ),
      ].map(
        async (id) =>
          [id, (await lookup(() => api.getListing(id)))?.title] as const,
      ),
    ),
  );
  return { rows, people, titles };
}

function CircleHome({ circleName }: { circleName: string }) {
  const { locale } = useOnboardingText();
  const { session, profile, reloadProfile } = useSession();
  const account = session?.user.id ?? null;
  const profileId = profile.status === "ready" ? profile.profile.id : null;
  const copy = homeCopy[locale];
  const sectionTitle = localizedType("section-heading", locale);
  const label = localizedType("field-label", locale);
  const button = localizedType("button", locale);
  const supporting = localizedType("supporting", locale);
  const listingCopy = lendingCopy[locale];
  const readCopy = listingReadCopy[locale];
  const activity = activityCopy[locale];
  const today = useLiveResource(
    useCallback(() => {
      if (!profileId) throw new Error("Profile is not ready.");
      return loadToday(profileId);
    }, [profileId]),
  );
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
        { limit: NEARBY_LIMIT, activeOnly: true, excludeOwn: true },
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
  const displayName =
    profile.status === "ready" ? profile.profile.display_name : "";

  return (
    <CommunityScreen
      title={displayName ? copy.greet(displayName) : copy.greetFallback}
      eyebrow={circleName}
      titleAction={<NotificationBell />}
      inlineTitleAction
    >
      <View style={styles.actions}>
        <Button
          label={copy.ask}
          labelStyle={button}
          style={styles.action}
          onPress={() => router.navigate("/assistant")}
        />
        <Button
          label={copy.lend}
          labelStyle={[button, styles.green]}
          style={[styles.action, styles.secondaryButton]}
          variant="secondary"
          onPress={() => router.push("/tools/add")}
        />
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={copy.family}
        onPress={() => router.push("/family")}
        android_ripple={{ color: colors.wash }}
        style={styles.family}
      >
        <SymbolView
          name={{ ios: "person.2", android: "group", web: "group" }}
          size={20}
          tintColor={colors.action}
        />
        <Text style={[label, styles.familyLabel]}>{copy.family}</Text>
        <SymbolView
          name={{
            ios: "chevron.forward",
            android: "chevron_right",
            web: "chevron_right",
          }}
          size={18}
          tintColor={colors.action}
        />
      </Pressable>
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
          <View style={styles.section}>
            <Text style={[supporting, styles.secondary]}>
              {view.firstError === "transient" || view.firstError === null
                ? copy.nearbyError
                : readCopy[view.firstError]}
            </Text>
            {canRetry(view.firstError) ? retryButton : null}
          </View>
        ) : rows.length === 0 && !view.refreshError ? (
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
              detail={listingStatusLabel(listing, false, listingCopy)}
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
          <View style={styles.section}>
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
        {profile.status === "loading" ||
        (profile.status === "ready" && today.loading && !today.data) ? (
          <View
            accessible
            accessibilityState={{ busy: true }}
            accessibilityRole="progressbar"
            accessibilityLabel={activity.loading}
          >
            <ListingRowSkeleton />
          </View>
        ) : profile.status !== "ready" || today.error ? (
          <View style={styles.section}>
            <Text
              accessibilityLiveRegion="polite"
              style={[supporting, styles.secondary]}
            >
              {copy.todayError}
            </Text>
            <Button
              label={listingCopy.retry}
              labelStyle={label}
              variant="text"
              onPress={() =>
                void (profile.status === "ready"
                  ? today.reload()
                  : reloadProfile())
              }
            />
          </View>
        ) : today.data?.rows.length ? (
          today.data.rows.map((row) =>
            row.type === "due" ? (
              <ListingRow
                key={`due-${row.id}`}
                accessibilityRole="link"
                title={
                  (row.listingId && today.data?.titles[row.listingId]) ||
                  (row.borrowing ? activity.unnamedLoan : copy.lentItem)
                }
                description={today.data?.people[row.partnerId] ?? copy.someone}
                detail={`${activity.due}: ${formatActivityDate(row.dueAt, locale)}`}
                onPress={() =>
                  router.push({
                    pathname: "/loans/[id]",
                    params: { id: row.id },
                  })
                }
              />
            ) : (
              <ListingRow
                key={`request-${row.id}`}
                accessibilityRole="link"
                title={row.text}
                description={today.data?.people[row.personId] ?? copy.someone}
                detail={copy.kinds[row.kind]}
                portrait
                onPress={() =>
                  router.push({
                    pathname: "/requests/[id]",
                    params: { id: row.id },
                  })
                }
              />
            ),
          )
        ) : (
          <RequestNotice
            title={copy.today}
            detail={copy.empty}
            locale={locale}
          />
        )}
      </View>
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: spacing["control-gap"] },
  action: { flex: 1 },
  secondaryButton: { borderColor: colors.control },
  family: {
    minHeight: controls["touch-target"],
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: controls.radius,
    gap: spacing["control-gap"],
    paddingHorizontal: spacing["control-gap"],
    paddingVertical: spacing["related-gap"],
  },
  familyLabel: { flex: 1, color: colors.action },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
  green: { color: colors.action },
  section: { gap: spacing["related-gap"] },
});
