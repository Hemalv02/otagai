import { Button as ExpoButton, Host, Picker } from "@expo/ui";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { Button, Field } from "@/components/ui";
import { api, type CategoryNode, type ListingKind } from "@/lib/api";
import {
  browseFilterKey,
  canRetry,
  changeKind,
  firstPageFailed,
  firstPageLoaded,
  initialBrowseState,
  nextPageFailed,
  nextPageLoaded,
  normalizeSearch,
  startNextPage,
  visibleBrowseState,
  type BrowseFilters,
  type BrowseState,
  type KindFilter,
} from "@/lib/browse-state";
import { lendingCopy } from "@/lib/lending-copy";
import {
  categoryName,
  flattenCategories,
  listingReadCopy,
  requestApiError,
} from "@/lib/listing-read";
import { createLatestRequest } from "@/lib/listing-workflow";
import { myListingsCopy } from "@/lib/my-listings-copy";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, controls, spacing } from "@/theme/tokens.json";

const KIND_FILTERS = ["all", "tool", "skill"] as const;

type CategoryLoad =
  | { state: "loading" }
  | { state: "error" }
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
    const request = listingRequests.start();
    api
      .listListings(listParams(), {
        authUserId: account,
        signal: request.signal,
      })
      .then((page) => {
        if (!request.isCurrent()) return;
        setBrowse((current) => firstPageLoaded(current, key, page));
      })
      .catch((error) => {
        if (!request.isCurrent()) return;
        setBrowse((current) =>
          firstPageFailed(current, key, requestApiError(error)),
        );
      });
    return () => listingRequests.cancel();
  }, [account, filterKey, refreshTick, listParams, listingRequests]);

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
      .catch(() => {
        if (!request.isCurrent()) return;
        setCategoryLoad({ state: "error" });
      });
    return () => categoryRequests.cancel();
  }, [account, kindFilter, categoryTick, categoryRequests]);

  function handleKindChange(next: KindFilter) {
    if (next === kindFilter) return;
    const changed = changeKind(filters, next);
    setCategoryLoad({ state: "loading" });
    setCategoryId(changed.categoryId);
    setKindFilter(changed.kind);
  }

  function reloadCategories() {
    setCategoryLoad({ state: "loading" });
    setCategoryTick((tick) => tick + 1);
  }

  function loadNextPage() {
    const cursor = view.nextCursor;
    if (!account || !cursor || view.loadingMore) return;
    const key = filterKey;
    setBrowse((current) => startNextPage(current, key));
    const request = listingRequests.start();
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
    setBrowse(initialBrowseState(filterKey));
    setRefreshTick((tick) => tick + 1);
  }

  const flatCategoryItems =
    categoryLoad.state === "ready" ? categoryLoad.items : [];
  const rows = view.rows;
  const filtersActive = Boolean(rawQuery.trim() || categoryId || kindFilter !== "all");

  function clearFilters() {
    setRawQuery("");
    setDebouncedQuery("");
    setCategoryId("");
    if (kindFilter !== "all") {
      setCategoryLoad({ state: "loading" });
      setKindFilter("all");
    }
  }

  return (
    <CommunityScreen
      title={copy.browseTitle}
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
      <Field
        label={readCopy.titleSearch}
        labelStyle={labelType}
        style={localizedType("body", locale)}
        value={rawQuery}
        onChangeText={setRawQuery}
        placeholder={copy.searchExample}
        accessibilityHint={readCopy.titleHint}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
      />
      <View style={styles.filters}>
        <View accessibilityRole="radiogroup" style={styles.segments}>
          {KIND_FILTERS.map((option) => {
            const selected = kindFilter === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityLabel={copy[option]}
                accessibilityState={{ checked: selected, selected }}
                style={[styles.segment, selected && styles.selected]}
                onPress={() => handleKindChange(option)}
              >
                <Text
                  style={[
                    labelType,
                    styles.segmentLabel,
                    selected && styles.action,
                  ]}
                >
                  {copy[option]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Button
          label={myListingsCopy[locale].title}
          variant="text"
          onPress={() => router.push("/my-listings")}
        />
        <View style={styles.category}>
          <Text style={[supportingType, styles.secondary]}>
            {copy.category}
          </Text>
          {categoryLoad.state === "loading" ? (
            <Text style={[supportingType, styles.secondary]}>
              {copy.loadingCategories}
            </Text>
          ) : categoryLoad.state === "error" ? (
            <View style={styles.categoryError}>
              <Text style={[supportingType, styles.secondary]}>
                {copy.categoriesError}
              </Text>
              <Button
                label={copy.retry}
                labelStyle={labelType}
                variant="text"
                onPress={reloadCategories}
              />
            </View>
          ) : (
            <Host matchContents seedColor={colors.action}>
              <Picker<string>
                selectedValue={categoryId}
                onValueChange={(id) => {
                  if (
                    id === "" ||
                    flatCategoryItems.some((item) => item.id === id)
                  ) {
                    setCategoryId(id);
                  }
                }}
                accessibilityLabel={copy.category}
              >
                <Picker.Item label={copy.allCategories} value="" />
                {flatCategoryItems.map((item) => (
                  <Picker.Item
                    key={item.id}
                    value={item.id}
                    label={categoryName(item, locale)}
                  />
                ))}
              </Picker>
            </Host>
          )}
        </View>
      </View>
      <View style={styles.results}>
        {view.status === "loading" ? (
          <View style={styles.centered}>
            <ActivityIndicator accessibilityLabel={copy.loadingListings} />
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
              style={[supportingType, styles.secondary]}
            >
              {copy.empty}
            </Text>
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
          const skill = listing.kind === "skill";
          const own =
            profileId !== null && profileId === listing.owner_user_id;
          const catNode = flatCategoryItems.find(
            (item) => item.id === listing.category_id,
          );
          const catLabel = catNode ? categoryName(catNode, locale) : null;
          const lendLabel = readCopy[listing.lend_mode];
          const statusLabel = own ? copy.yourListing : lendLabel;

          return (
            <Pressable
              key={listing.id}
              accessibilityRole="link"
              accessibilityLabel={[listing.title, catLabel, statusLabel]
                .filter(Boolean)
                .join(", ")}
              style={styles.row}
              onPress={() =>
                router.push({
                  pathname: "/tools/[id]",
                  params: { id: listing.id },
                })
              }
            >
              {listing.photo_url ? (
                <Image
                  source={{ uri: listing.photo_url }}
                  style={styles.thumbnail}
                  accessible={false}
                />
              ) : (
                <View
                  style={[styles.thumbnail, styles.placeholder]}
                  accessible={false}
                >
                  <SymbolView
                    name={
                      skill
                        ? {
                            ios: "hand.raised",
                            android: "handshake",
                            web: "handshake",
                          }
                        : {
                            ios: "wrench",
                            android: "construction",
                            web: "construction",
                          }
                    }
                    size={22}
                    tintColor={colors.action}
                  />
                </View>
              )}
              <View style={styles.rowCopy}>
                <Text style={[labelType, styles.ink]}>{listing.title}</Text>
                {catLabel ? (
                  <Text style={[supportingType, styles.secondary]}>
                    {catLabel}
                  </Text>
                ) : null}
                <Text style={[supportingType, styles.action]}>
                  {statusLabel}
                </Text>
              </View>
              <SymbolView
                name={{
                  ios: "chevron.right",
                  android: "chevron_right",
                  web: "chevron_right",
                }}
                size={15}
                tintColor={colors.secondary}
              />
            </Pressable>
          );
        })}
        {view.loadingMore ? (
          <View style={styles.centered}>
            <ActivityIndicator accessibilityLabel={copy.loadingListings} />
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
  filters: { gap: spacing["related-gap"] },
  segments: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 3,
    gap: 3,
    backgroundColor: colors.paper,
    borderRadius: 12,
  },
  segment: {
    flexGrow: 1,
    minWidth: 60,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: controls.radius,
  },
  selected: { backgroundColor: colors.wash },
  segmentLabel: { color: colors.secondary, textAlign: "center" },
  category: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    minHeight: 42,
    gap: spacing["related-gap"],
  },
  categoryError: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["related-gap"],
  },
  results: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.rule,
  },
  centered: {
    paddingTop: spacing["card-inset"],
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["control-gap"],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
    paddingVertical: spacing["control-gap"],
  },
  rowCopy: { flex: 1, minWidth: 0 },
  thumbnail: { width: 56, height: 56, borderRadius: controls.radius },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.wash,
  },
  empty: { paddingTop: spacing["card-inset"], gap: spacing["related-gap"] },
  action: { color: colors.action },
  secondary: { color: colors.secondary },
  ink: { color: colors.ink },
});
