import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { LendingPhoto } from "@/components/lending-photo";
import { RequestNotice } from "@/components/request-notice";
import { Button } from "@/components/ui";
import { useCommunityDemo } from "@/lib/community-demo";
import {
  isSampleListing,
  listingText,
  useDemoListings,
} from "@/lib/demo-listings";
import { lendingCopy } from "@/lib/lending-copy";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { colors, spacing } from "@/theme/tokens.json";

const tanakaPortrait = require("../../../../assets/images/lending-tanaka-thumbnail.png");

export default function ToolListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { locale } = useOnboardingText();
  const { actor, people } = useCommunityDemo();
  const { listings, ready } = useDemoListings();
  const copy = lendingCopy[locale];
  const listing = listings.find((item) => item.id === id);
  const bodyType = localizedType("body", locale);
  const labelType = localizedType("field-label", locale);

  if (!listing) {
    return (
      <CommunityScreen back>
        {ready ? (
          <>
            <Text accessibilityRole="alert" style={[bodyType, styles.ink]}>
              {copy.listingMissing}
            </Text>
            <Button
              label={copy.browseTitle}
              onPress={() => router.dismissTo("/tools")}
              labelStyle={localizedType("button", locale)}
            />
          </>
        ) : (
          <ActivityIndicator color={colors.action} />
        )}
      </CommunityScreen>
    );
  }

  const sample = isSampleListing(listing) ? listing : null;
  const title = listingText(listing.title, locale);
  const description = listingText(listing.description, locale);
  const owner = sample
    ? listingText(sample.owner, locale)
    : people[listing.postedBy ?? "member"].name;
  const own = listing.postedBy === actor;
  const skill = listing.kind === "skill";
  const weekend = sample?.availability === "weekend";
  const availability = skill ? copy.askForTime : copy.available;
  const publicNotice = {
    title: weekend ? copy.availableWeekend : availability,
    detail:
      listing.availabilityNote ??
      (weekend
        ? copy.weekendPickup
        : skill
          ? sample
            ? copy.skillTime
            : copy.arrangeHelp
          : copy.arrangePickup),
  };
  const notice = own
    ? {
        title: copy.yourListing,
        detail: sample
          ? publicNotice.title
          : skill
            ? copy.ownSkill
            : copy.ownTool,
      }
    : publicNotice;
  const ownerDetail = own
    ? copy.yourListing
    : weekend
      ? copy.neighbourHan
      : copy.neighbour;
  const photoCaption = listing.photo === "drill" ? copy.drillCaption : title;

  return (
    <CommunityScreen title={title} back>
      {listing.photo ? (
        <LendingPhoto
          photo={listing.photo}
          caption={photoCaption}
          locale={locale}
        />
      ) : null}
      <View style={styles.owner}>
        {listing.postedBy === "neighbour" ? (
          <Image
            source={tanakaPortrait}
            style={styles.portrait}
            accessible={false}
          />
        ) : null}
        <View style={styles.ownerCopy}>
          <Text style={[labelType, styles.ink]}>{owner}</Text>
          <Text style={[localizedType("supporting", locale), styles.secondary]}>
            {ownerDetail}
          </Text>
        </View>
      </View>
      {description ? (
        <>
          <Text
            accessibilityRole="header"
            style={[localizedType("section-heading", locale), styles.ink]}
          >
            {skill ? copy.skillHeading : copy.includedHeading}
          </Text>
          <Text style={[bodyType, styles.ink]}>{description}</Text>
        </>
      ) : null}
      {!skill && listing.safetyNote ? (
        <RequestNotice
          title={copy.safety}
          detail={listing.safetyNote}
          locale={locale}
        />
      ) : null}
      <RequestNotice
        title={notice.title}
        detail={notice.detail}
        locale={locale}
      />
      {own && listing.availabilityNote ? (
        <RequestNotice
          title={copy.availability}
          detail={listing.availabilityNote}
          locale={locale}
        />
      ) : null}
      {!own ? (
        <Button
          label={skill ? copy.askForHelp : copy.askToBorrow}
          labelStyle={localizedType("button", locale)}
          onPress={() =>
            router.push({
              pathname: "/ask",
              params: { listingId: listing.id },
            })
          }
        />
      ) : null}
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  owner: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 54,
    gap: spacing["control-gap"],
  },
  ownerCopy: { flex: 1, minWidth: 0, paddingTop: 4, paddingBottom: 5 },
  portrait: { width: 56, height: 56, borderRadius: 28 },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
});
