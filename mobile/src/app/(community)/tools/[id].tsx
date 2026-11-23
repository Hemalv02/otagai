import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { RequestNotice } from "@/components/request-notice";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { lendingCopy } from "@/lib/lending-copy";
import {
  availabilityLabel,
  createLatestRequest,
  type DetailContext,
  type DetailState,
  detailView,
  formatAvailableAgain,
  isCurrentDetail,
  isListingId,
  isListingOwner,
  photoUrls,
} from "@/lib/listing-workflow";
import { listingReadCopy, requestApiError } from "@/lib/listing-read";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, controls, spacing } from "@/theme/tokens.json";

export default function ToolListingScreen() {
  const { id: routeId } = useLocalSearchParams<{ id: string }>();
  const { locale } = useOnboardingText();
  const { session, profile } = useSession();
  const account = session?.user.id ?? "";
  const profileId = profile.status === "ready" ? profile.profile.id : null;
  const id = routeId ?? "";
  const current: DetailContext = { account, id };
  const copy = lendingCopy[locale];
  const readCopy = listingReadCopy[locale];
  const bodyType = localizedType("body", locale);
  const labelType = localizedType("field-label", locale);

  const [state, setState] = useState<DetailState>({
    account,
    id,
    status: "loading",
  });
  const [tick, setTick] = useState(0);
  const [requests] = useState(createLatestRequest);

  useEffect(() => {
    if (!account || !isListingId(id)) {
      requests.cancel();
      return;
    }
    const context: DetailContext = { account, id };
    const request = requests.start();
    api
      .getListing(id, request.signal, account)
      .then((listing) => {
        if (!request.isCurrent()) return;
        setState({ ...context, status: "loaded", listing });
      })
      .catch((error: unknown) => {
        if (!request.isCurrent()) return;
        setState({
          ...context,
          status: "error",
          errorKind: requestApiError(error),
        });
      });
    return () => requests.cancel();
  }, [account, id, tick, requests]);

  const view = account ? detailView(state, current) : "auth";
  const listing =
    view === "loaded" && state.status === "loaded" && isCurrentDetail(state, current)
      ? state.listing
      : null;

  if (!listing) {
    const message =
      view === "unavailable"
        ? copy.listingMissing
        : view === "retryable"
          ? readCopy.transient
          : view === "auth"
            ? readCopy.auth
            : view === "error"
              ? readCopy.error
              : null;
    return (
      <CommunityScreen back>
        {message ? (
          <>
            <Text accessibilityRole="alert" style={[bodyType, styles.ink]}>
              {message}
            </Text>
            {view === "retryable" ? (
              <Button
                label={copy.retry}
                onPress={() => {
                  setState({ ...current, status: "loading" });
                  setTick((value) => value + 1);
                }}
                labelStyle={localizedType("button", locale)}
              />
            ) : null}
            {view === "unavailable" ? (
              <Button
                label={copy.browseTitle}
                onPress={() => router.dismissTo("/tools")}
                labelStyle={localizedType("button", locale)}
              />
            ) : null}
          </>
        ) : (
          <ActivityIndicator color={colors.action} />
        )}
      </CommunityScreen>
    );
  }

  const own = isListingOwner(listing, profileId);
  const skill = listing.kind === "skill";
  const photos = photoUrls(listing);
  const lendState = availabilityLabel(listing, {
    available: copy.available,
    askForTime: copy.askForTime,
    lentOut: copy.lentOut,
    paused: copy.paused,
  });
  const availableAgain = formatAvailableAgain(
    listing.available_again_at,
    locale,
  );
  const availabilityDetail = [
    listing.availability_note,
    availableAgain ? `${copy.availableAgain}: ${availableAgain}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <CommunityScreen title={listing.title} back>
      {photos.map((photo) => (
        <Image
          key={photo.id}
          source={{ uri: photo.url }}
          style={styles.photo}
          contentFit="contain"
          accessibilityLabel={listing.title}
        />
      ))}
      {listing.owner ? (
        <View style={styles.ownerCopy}>
          <Text style={[labelType, styles.ink]}>
            {listing.owner.display_name}
          </Text>
        </View>
      ) : null}
      {listing.description ? (
        <>
          <Text
            accessibilityRole="header"
            style={[localizedType("section-heading", locale), styles.ink]}
          >
            {skill ? copy.skillHeading : copy.includedHeading}
          </Text>
          <Text style={[bodyType, styles.ink]}>{listing.description}</Text>
        </>
      ) : null}
      {listing.parts.length > 0 ? (
        <RequestNotice
          title={copy.includedParts}
          detail={listing.parts
            .map((part) => `${part.label} × ${part.quantity}`)
            .join("\n")}
          locale={locale}
        />
      ) : null}
      {listing.safety_notes ? (
        <RequestNotice
          title={copy.safety}
          detail={listing.safety_notes}
          locale={locale}
        />
      ) : null}
      <RequestNotice
        title={lendState}
        detail={availabilityDetail || copy.availability}
        locale={locale}
      />
      {own ? (
        <Button
          label={copy.mine}
          labelStyle={localizedType("button", locale)}
          onPress={() => router.push("/my-listings")}
        />
      ) : (
        <Text style={[localizedType("supporting", locale), styles.secondary]}>
          {readCopy.readOnly}
        </Text>
      )}
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  photo: { height: 220, width: "100%", borderRadius: controls.radius },
  ownerCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: 4,
    paddingBottom: 5,
    gap: spacing["control-gap"],
  },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
});
