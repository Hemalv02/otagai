import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { RequestNotice } from "@/components/request-notice";
import { Button } from "@/components/ui";
import type { Language } from "@/lib/api";
import { analyzeAsk, findAskMatches } from "@/lib/ask-suggestions";
import { askSuggestionsCopy } from "@/lib/ask-suggestions-copy";
import { useCommunityDemo } from "@/lib/community-demo";
import {
  type DemoListing,
  drillListingId,
  isSampleListing,
  listingPhotoSource,
  listingText,
  useDemoListings,
} from "@/lib/demo-listings";
import { lendingCopy } from "@/lib/lending-copy";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { suggestRequestTitle } from "@/lib/request-demo-copy";
import { colors, controls, spacing } from "@/theme/tokens.json";

function searchableFields(listing: DemoListing, locale: Language) {
  const fields = [listing.title, listing.description];
  if (isSampleListing(listing)) fields.push(listing.summary, listing.keywords);
  return fields.flatMap((field) => {
    const localized = listingText(field, locale);
    return locale === "en"
      ? [localized]
      : [localized, listingText(field, "en")];
  });
}

export default function AskSuggestionsScreen() {
  const { locale } = useOnboardingText();
  const { actor, people, askDraft, setAskDraft } = useCommunityDemo();
  const { listings } = useDemoListings();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const copy = askSuggestionsCopy[locale];
  const lending = lendingCopy[locale];
  const label = localizedType("field-label", locale);
  const supporting = localizedType("supporting", locale);
  const body = localizedType("body", locale);
  const button = localizedType("button", locale);

  if (!askDraft) {
    return (
      <CommunityScreen title={copy.suggestions} back>
        <Button
          label={copy.describe}
          labelStyle={button}
          onPress={() => router.replace("/ask")}
        />
      </CommunityScreen>
    );
  }

  const { description, wall: answer } = askDraft;
  const task = analyzeAsk(description, answer);
  const matches = findAskMatches(
    description,
    answer,
    listings.map((listing) => ({
      id: listing.id,
      kind: listing.kind,
      own: listing.postedBy === actor,
      fields: searchableFields(listing, locale),
    })),
  );
  const byId = new Map(listings.map((listing) => [listing.id, listing]));
  const fromIds = (ids: string[]) =>
    ids.flatMap((id) => {
      const listing = byId.get(id);
      return listing ? [listing] : [];
    });
  const tools = fromIds(matches.tools);
  const skills = fromIds(matches.skills);
  const choices = [...tools, ...skills];
  const masonryShelf = task.topic === "shelf" && task.wall === "masonry";
  const masonryDrill = masonryShelf && matches.tools.includes(drillListingId);
  const preferSkill =
    task.topic === "shelf" && (task.wall === "wood" || task.wall === "unsure");
  const selected =
    choices.find((item) => item.id === selectedId) ??
    (preferSkill ? skills[0] : undefined) ??
    choices[0];

  function draftRequest(listing?: DemoListing) {
    setAskDraft({
      title: listing
        ? listingText(listing.title, locale)
        : suggestRequestTitle(description),
      description,
      wall: answer,
      ...(listing ? { listingId: listing.id } : {}),
    });
    router.push("/ask-review");
  }

  const wallAction =
    task.topic === "shelf" ? (
      <Button
        label={copy.changeWall}
        labelStyle={label}
        variant="text"
        onPress={() => router.dismissTo("/ask-clarify")}
      />
    ) : null;

  if (!selected) {
    return (
      <CommunityScreen
        title={masonryShelf ? copy.noDrill : copy.noMatches}
        back
      >
        {masonryShelf ? (
          <RequestNotice
            title={copy.wouldHelp}
            detail={copy.masonryTool}
            locale={locale}
          />
        ) : null}
        <Text style={[body, styles.ink]}>{copy.askCircle}</Text>
        <Button
          label={copy.draft}
          labelStyle={button}
          onPress={() => draftRequest()}
        />
        {wallAction}
      </CommunityScreen>
    );
  }

  const title = masonryDrill
    ? copy.hammer
    : preferSkill && skills.length
      ? copy.woodShelf
      : copy.suggestions;
  const subtitle = masonryDrill
    ? copy.hammerDetail
    : task.wall === "unsure"
      ? copy.unsureDetail
      : task.wall === "wood"
        ? copy.woodShelfDetail
        : undefined;
  const sections = [
    { title: copy.tools, items: tools },
    {
      title: task.topic === "shelf" ? copy.shelfSkills : copy.skills,
      items: skills,
    },
  ];

  return (
    <CommunityScreen
      title={title}
      subtitle={subtitle}
      back
      footer={
        <Button
          label={selected.kind === "tool" ? copy.draftBorrow : copy.draftSkill}
          labelStyle={button}
          onPress={() => draftRequest(selected)}
        />
      }
    >
      <View accessibilityRole="radiogroup" style={styles.sections}>
        {sections
          .filter((section) => section.items.length > 0)
          .map((section) => (
            <View key={section.title} style={styles.section}>
              <Text
                accessibilityRole="header"
                style={[localizedType("section-heading", locale), styles.ink]}
              >
                {section.title}
              </Text>
              {section.items.map((listing) => {
                const sample = isSampleListing(listing) ? listing : null;
                const name = listingText(listing.title, locale);
                const owner = sample
                  ? listingText(sample.owner, locale)
                  : people[listing.postedBy ?? "member"].name;
                const summary = sample
                  ? listingText(sample.summary, locale)
                  : lending.categories[listing.category];
                const status =
                  listing.kind === "tool"
                    ? lending.available
                    : lending.askForTime;
                const checked = selected.id === listing.id;

                return (
                  <Pressable
                    key={listing.id}
                    accessibilityRole="radio"
                    accessibilityLabel={`${name}, ${owner}, ${status}`}
                    accessibilityState={{ checked }}
                    style={[styles.listing, checked && styles.selected]}
                    onPress={() => setSelectedId(listing.id)}
                  >
                    {listing.photo ? (
                      <Image
                        source={listingPhotoSource(listing.photo)}
                        style={styles.thumbnail}
                        accessible={false}
                      />
                    ) : null}
                    <View style={styles.details}>
                      <Text style={[label, styles.ink]}>{name}</Text>
                      <Text style={[supporting, styles.secondary]}>
                        {owner} · {summary}
                      </Text>
                    </View>
                    <Text style={[supporting, styles.status]}>{status}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
      </View>
      <View>
        {wallAction}
        <Button
          variant="text"
          label={copy.draftGeneral}
          labelStyle={label}
          onPress={() => draftRequest()}
        />
      </View>
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  sections: { gap: spacing["card-inset"] },
  section: { gap: spacing["related-gap"] },
  listing: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 68,
    padding: spacing["related-gap"],
    gap: spacing["control-gap"],
    borderWidth: 1,
    borderRadius: controls.radius,
    borderColor: "transparent",
  },
  selected: { borderColor: colors.control, backgroundColor: colors.wash },
  thumbnail: { width: 56, height: 56, borderRadius: controls.radius },
  details: { flex: 1, minWidth: 0 },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
  status: { color: colors.action, textAlign: "right", maxWidth: "27%" },
});
