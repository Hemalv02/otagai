import { Button as ExpoButton, Host } from "@expo/ui";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { ListingRow, ListingRowSkeleton } from "@/components/listing-row";
import { Button, Field } from "@/components/ui";
import { api, type CategoryNode, type ListingKind } from "@/lib/api";
import {
  browseFilterKey,
  browseHeading,
  canRetry,
  emptyMessage,
  changeKind,
  firstPageFailed,
  SEARCH_MAX_LENGTH,
  firstPageLoaded,
  listingStatusLabel,
  initialBrowseState,
  nextPageFailed,
  nextPageLoaded,
  normalizeSearch,
  selectAll,
  selectCategory,
  startFirstPage,
  startNextPage,
  visibleBrowseState,
  type BrowseErrorKind,
  type BrowseFilters,
  type BrowseState,
  type KindFilter,
  createLatestRequest,
} from "@/lib/listing-workflow";
import { lendingCopy } from "@/lib/lending-copy";
import {
  categoryName,
  flattenCategories,
  listingReadCopy,
  requestApiError,
} from "@/lib/listing-read";
import { myListingsCopy } from "@/lib/my-listings-copy";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, controls, spacing } from "@/theme/tokens.json";

const KIND_FILTERS = ["all", "tool", "skill"] as const;

type CategoryLoad =
  | { state: "loading" }
  | { state: "error"; errorKind: BrowseErrorKind }
  | { state: "ready"; items: CategoryNode[] };

export default function BrowseToolsScreen() {
  const { locale } = useOnboardingText();
  const { session, profile } = useSession();
  const account = session?.user.id ?? null;
  const profileId = profile.status === "ready" ? profile.profile.id : null;

  const copy = lendingCopy[locale];
  const readCopy = listingReadCopy[locale];
  const labelType = localizedType("field-label", locale);
  const supportingType = localizedType("supporting", locale);

  const [rawQuery, setRawQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [categoryId, setCategoryId] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [categoryTick, setCategoryTick] = useState(0);
  const [categoryLoad, setCategoryLoad] = useState<CategoryLoad>({
    state: "loading",
  });
  const [browse, setBrowse] = useState<BrowseState>(initialBrowseState);

  const [categoryRequests] = useState(createLatestRequest);
  const [listingRequests] = useState(createLatestRequest);
  const [nextRequests] = useState(createLatestRequest);
  const firstPageLoading = useRef(false);
  const focusedOnce = useRef(false);

  const filters: BrowseFilters = {
    account: account ?? "",
    kind: kindFilter,
    categoryId,
    q: debouncedQuery,
  };
  const filterKey = browseFilterKey(filters);
  const view = visibleBrowseState(browse, filterKey);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(normalizeSearch(rawQuery)), 300);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) setRefreshTick((tick) => tick + 1);
      focusedOnce.current = true;
    }, []),
  );

  const listParams = useCallback(
    (cursor?: string) => ({
      ...(debouncedQuery ? { q: debouncedQuery } : {}),
      ...(kindFilter !== "all" ? { kind: kindFilter } : {}),
      ...(categoryId ? { category_id: categoryId } : {}),
      ...(cursor ? { cursor } : {}),
    }),
    [debouncedQuery, kindFilter, categoryId],
  );

  useEffect(() => {
    if (!account) return;
    const key = filterKey;
    nextRequests.cancel();
    const request = listingRequests.start();
    firstPageLoading.current = true;
    api
      .listListings(listParams(), {
        authUserId: account,
        signal: request.signal,
      })
      .then((page) => {
        if (!request.isCurrent()) return;
        firstPageLoading.current = false;
        setBrowse((current) => firstPageLoaded(current, key, page));
      })
      .catch((error) => {
        if (!request.isCurrent()) return;
        firstPageLoading.current = false;
        setBrowse((current) =>
          firstPageFailed(current, key, requestApiError(error)),
        );
      });
    return () => {
      listingRequests.cancel();
      nextRequests.cancel();
    };
  }, [
    account,
    filterKey,
    refreshTick,
    listParams,
    listingRequests,
    nextRequests,
  ]);

  useEffect(() => {
    if (!account) return;
    const request = categoryRequests.start();
    const options = { authUserId: account, signal: request.signal };
    const kinds: ListingKind[] = kindFilter === "all" ? ["tool", "skill"] : [kindFilter];
    Promise.all(kinds.map((kind) => api.listCategories(kind, options)))
      .then((results) => {
        if (!request.isCurrent()) return;
        setCategoryLoad({
          state: "ready",
          items: flattenCategories(results.flatMap((result) => result.items)),
        });
      })
      .catch((error) => {
        if (!request.isCurrent()) return;
        setCategoryLoad({ state: "error", errorKind: requestApiError(error) });
      });
    return () => categoryRequests.cancel();
  }, [account, kindFilter, categoryTick, categoryRequests]);

  function applyKindFilters(changed: BrowseFilters) {
    if (changed.kind !== kindFilter) setCategoryLoad({ state: "loading" });
    setCategoryId(changed.categoryId);
    setKindFilter(changed.kind);
  }

  function handleKindChange(next: KindFilter) {
    if (next === "all") {
      applyKindFilters(selectAll(filters));
      return;
    }
    if (next === kindFilter) return;
    applyKindFilters(changeKind(filters, next));
  }

  function reloadCategories() {
    setCategoryLoad({ state: "loading" });
    setCategoryTick((tick) => tick + 1);
  }

  function loadNextPage() {
    const cursor = view.nextCursor;
    if (!account || !cursor || view.loadingMore || firstPageLoading.current) {
      return;
    }
    const key = filterKey;
    setBrowse((current) => startNextPage(current, key));
    const request = nextRequests.start();
    api
      .listListings(listParams(cursor), {
        authUserId: account,
        signal: request.signal,
      })
      .then((page) => {
        if (!request.isCurrent()) return;
        setBrowse((current) => nextPageLoaded(current, key, page));
      })
      .catch((error) => {
        if (!request.isCurrent()) return;
        setBrowse((current) =>
          nextPageFailed(current, key, requestApiError(error)),
        );
      });
  }

  function retryFirstPage() {
    const key = filterKey;
    setBrowse((current) =>
      current.status === "ready"
        ? startFirstPage(current, key)
        : initialBrowseState(key),
    );
    setRefreshTick((tick) => tick + 1);
  }

  const flatCategoryItems =
    categoryLoad.state === "ready" ? categoryLoad.items : [];
  const rows = view.rows;
  const filtersActive = Boolean(debouncedQuery || categoryId || kindFilter !== "all");

  function clearFilters() {
    setRawQuery("");
    setDebouncedQuery("");
    setCategoryId("");
    if (kindFilter !== "all") {
      setCategoryLoad({ state: "loading" });
      setKindFilter("all");
    }
  }

  const heading = browseHeading(view, kindFilter);
  const emptyKey = emptyMessage(filtersActive, debouncedQuery);

  return (
    <CommunityScreen
      title={copy[heading === "explore" ? "exploreTitle" : heading]}
      titleAction={
        <Host matchContents seedColor={colors.action}>
          <ExpoButton
            label={copy.addListing}
            onPress={() => router.push("/tools/add")}
          />
        </Host>
      }
      keyboard
    >
      <View style={styles.search}>
        <Field
          label={copy.searchLabel}
          labelStyle={labelType}
          style={localizedType("body", locale)}
          value={rawQuery}
          onChangeText={setRawQuery}
          placeholder={copy.searchPlaceholder}
          accessibilityHint={readCopy.titleHint}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
          maxLength={SEARCH_MAX_LENGTH}
        />
        <Text style={[supportingType, styles.secondary]}>
          {readCopy.titleHint}
        </Text>
      </View>
      <View style={styles.filters}>
        <View accessibilityRole="radiogroup" style={styles.links}>
          {KIND_FILTERS.map((option) => {
            const selected = kindFilter === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityLabel={copy[option]}
                accessibilityState={{ checked: selected, selected }}
                style={styles.link}
                onPress={() => handleKindChange(option)}
              >
                <Text
                  style={[
                    labelType,
                    styles.action,
                    selected && styles.underline,
                  ]}
                >
                  {copy[option]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {categoryLoad.state === "loading" ? (
          <Text style={[supportingType, styles.secondary]}>
            {copy.loadingCategories}
          </Text>
        ) : categoryLoad.state === "error" ? (
          <View style={styles.categoryError}>
            <Text style={[supportingType, styles.secondary]}>
              {copy.categoriesError}
            </Text>
            {canRetry(categoryLoad.errorKind) ? (
              <Button
                label={copy.retry}
                labelStyle={labelType}
                variant="text"
                onPress={reloadCategories}
              />
            ) : null}
          </View>
        ) : (
          <View style={styles.links}>
            {flatCategoryItems.map((item) => {
              const selected = categoryId === item.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="radio"
                  accessibilityLabel={categoryName(item, locale)}
                  accessibilityState={{ checked: selected }}
                  style={styles.link}
                  onPress={() =>
                    setCategoryId(selectCategory(filters, item.id).categoryId)
                  }
                >
                  <Text
                    style={[
                      labelType,
                      styles.action,
                      selected && styles.underline,
                    ]}
                  >
                    {categoryName(item, locale)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <Button
          label={myListingsCopy[locale].title}
          variant="text"
          onPress={() => router.push("/my-listings")}
        />
      </View>
      <View>
        {view.status === "loading" ? (
          <View
            accessible
            accessibilityState={{ busy: true }}
            accessibilityRole="progressbar"
            accessibilityLabel={copy.loadingListings}
          >
            {[0, 1, 2].map((index) => (
              <ListingRowSkeleton key={index} />
            ))}
          </View>
        ) : view.status === "error" ? (
          <View style={styles.empty}>
            <Text style={[supportingType, styles.secondary]}>
              {readCopy[view.firstError ?? "error"]}
            </Text>
            {canRetry(view.firstError) ? (
              <Button
                label={copy.retry}
                labelStyle={labelType}
                variant="text"
                onPress={retryFirstPage}
              />
            ) : null}
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.empty}>
            <Text
              accessibilityLiveRegion="polite"
              style={[localizedType("body", locale), styles.ink]}
            >
              {emptyKey === "emptyQuery"
                ? copy.emptyQuery(debouncedQuery)
                : copy[emptyKey]}
            </Text>
            {!view.refreshError ? (
              <Button
                label={copy.askForIt}
                labelStyle={localizedType("button", locale)}
                onPress={() => router.push("/ask")}
              />
            ) : null}
            {filtersActive ? (
              <Button
                label={copy.clearFilters}
                labelStyle={labelType}
                variant="text"
                onPress={clearFilters}
              />
            ) : null}
          </View>
        ) : null}
        {rows.map((listing) => {
          const own =
            profileId !== null && profileId === listing.owner_user_id;
          const catNode = flatCategoryItems.find(
            (item) => item.id === listing.category_id,
          );
          const catLabel = catNode ? categoryName(catNode, locale) : null;
          const statusLabel = listingStatusLabel(listing, own, copy);

          return (
            <ListingRow
              key={listing.id}
              accessibilityRole="link"
              title={listing.title}
              description={catLabel ?? undefined}
              detail={statusLabel}
              photo={listing.photo_url ? { uri: listing.photo_url } : undefined}
              onPress={() =>
                router.push({
                  pathname: "/tools/[id]",
                  params: { id: listing.id },
                })
              }
            />
          );
        })}
        {view.loadingMore ? (
          <View style={styles.centered}>
            <ActivityIndicator accessibilityLabel={copy.loadingListings} />
          </View>
        ) : null}
        {view.refreshError ? (
          <View style={styles.empty}>
            <Text style={[supportingType, styles.secondary]}>
              {copy.refreshError}
            </Text>
            {canRetry(view.refreshError) ? (
              <Button
                label={copy.retry}
                labelStyle={labelType}
                variant="text"
                onPress={retryFirstPage}
              />
            ) : null}
          </View>
        ) : null}
        {view.nextError ? (
          <View style={styles.empty}>
            <Text style={[supportingType, styles.secondary]}>
              {copy.listingsNextError}
            </Text>
            {canRetry(view.nextError) ? (
              <Button
                label={copy.retry}
                labelStyle={labelType}
                variant="text"
                onPress={loadNextPage}
              />
            ) : null}
          </View>
        ) : null}
        {view.nextCursor && !view.loadingMore && !view.nextError ? (
          <Button
            label={copy.loadMore}
            labelStyle={labelType}
            variant="text"
            onPress={loadNextPage}
          />
        ) : null}
      </View>
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  search: { gap: spacing["related-gap"] },
  filters: { gap: spacing["screen-gutter"] },
  links: { gap: spacing["control-gap"] },
  link: { minHeight: controls["touch-target"], justifyContent: "center" },
  categoryError: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["related-gap"],
  },
  centered: {
    paddingTop: spacing["card-inset"],
    alignItems: "center",
  },
  empty: { paddingTop: spacing["card-inset"], gap: spacing["related-gap"] },
  action: { color: colors.action },
  underline: { textDecorationLine: "underline" },
  secondary: { color: colors.secondary },
  ink: { color: colors.ink },
});
