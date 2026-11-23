import { Button as ExpoButton, Host } from "@expo/ui";
import { Image } from "expo-image";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { ListingCategoryPicker } from "@/components/listing-category-picker";
import { Button, Field } from "@/components/ui";
import { useCommunityDemo } from "@/lib/community-demo";
import {
  isSampleListing,
  listingPhotoSource,
  listingText,
  type ListingCategory,
  useDemoListings,
} from "@/lib/demo-listings";
import { myListingsCopy } from "@/lib/my-listings-copy";
import { lendingCopy } from "@/lib/lending-copy";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { colors, controls, spacing } from "@/theme/tokens.json";

const filters = ["all", "tool", "skill"] as const;

function searchString(value: string) {
  return value.normalize("NFKC").toLowerCase();
}

export default function BrowseToolsScreen() {
  const { locale } = useOnboardingText();
  const { actor, people } = useCommunityDemo();
  const { listings } = useDemoListings();
  const copy = lendingCopy[locale];
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const [category, setCategory] = useState<ListingCategory | "">("");
  const terms = searchString(query.trim()).split(/\s+/).filter(Boolean);
  const labelType = localizedType("field-label", locale);
  const supportingType = localizedType("supporting", locale);
  const filtersActive = Boolean(
    query.trim() || category || filter === "tool" || filter === "skill",
  );

  const rows = listings.filter((listing) => {
    if ((filter === "tool" || filter === "skill") && listing.kind !== filter)
      return false;
    if (category && listing.category !== category) return false;
    if (terms.length === 0) return true;

    const fields = [listing.title, listing.description];
    if (isSampleListing(listing))
      fields.push(listing.owner, listing.summary, listing.keywords);
    const searchable = searchString(
      [
        copy.categories[listing.category],
        ...fields.map((value) => listingText(value, locale)),
      ].join(" "),
    );
    return terms.every((term) => searchable.includes(term));
  });

  function clearFilters() {
    setQuery("");
    setCategory("");
    setFilter("all");
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
        label={copy.search}
        labelStyle={labelType}
        style={localizedType("body", locale)}
        value={query}
        onChangeText={setQuery}
        placeholder={copy.searchExample}
        accessibilityHint={copy.searchHint}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
      />
      <View style={styles.filters}>
        <View accessibilityRole="radiogroup" style={styles.segments}>
          {filters.map((option) => {
            const selected = filter === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityLabel={copy[option]}
                accessibilityState={{ checked: selected, selected }}
                style={[styles.segment, selected && styles.selected]}
                onPress={() => setFilter(option)}
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
          <ListingCategoryPicker
            value={category}
            onChange={setCategory}
            filter
          />
        </View>
      </View>
      <View style={styles.results}>
        {rows.length === 0 ? (
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
          const sample = isSampleListing(listing) ? listing : null;
          const title = listingText(listing.title, locale);
          const owner = sample
            ? listingText(sample.owner, locale)
            : people[listing.postedBy ?? "member"].name;
          const description = sample
            ? listingText(sample.summary, locale)
            : copy.categories[listing.category];
          const own = listing.postedBy === actor;
          const skill = listing.kind === "skill";
          const status = own
            ? copy.yourListing
            : skill
              ? copy.askForTime
              : copy.available;

          return (
            <Pressable
              key={listing.id}
              accessibilityRole="link"
              accessibilityLabel={`${title}, ${owner}, ${status}`}
              style={styles.row}
              onPress={() =>
                router.push({
                  pathname: "/tools/[id]",
                  params: { id: listing.id },
                })
              }
            >
              {listing.photo ? (
                <Image
                  source={listingPhotoSource(listing.photo)}
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
                <Text style={[labelType, styles.ink]}>{title}</Text>
                <Text style={[supportingType, styles.secondary]}>
                  {owner} · {description}
                </Text>
                <Text style={[supportingType, styles.action]}>{status}</Text>
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
  results: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.rule,
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
