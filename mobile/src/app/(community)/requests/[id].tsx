import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { RequestNotice } from "@/components/request-notice";
import { Button } from "@/components/ui";
import { useCommunityDemo } from "@/lib/community-demo";
import { listingText, useDemoListings } from "@/lib/demo-listings";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { requestCopy } from "@/lib/request-demo-copy";
import { colors, controls, spacing } from "@/theme/tokens.json";

const stairsPhoto = require("../../../../assets/images/request-mizunoura-steps.png");
const tanakaPhoto = require("../../../../assets/images/lending-tanaka-thumbnail.png");

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actor, people, requests, offerHelp, acceptOffer } =
    useCommunityDemo();
  const { listings } = useDemoListings();
  const { locale } = useOnboardingText();
  const copy = requestCopy[locale];
  const [showOriginal, setShowOriginal] = useState(false);
  const request = requests.find((item) => item.id === id);

  if (!request) {
    return <CommunityScreen back title={copy.notFound} />;
  }

  const ownsRequest = request.createdBy === actor;
  const isRiceRequest = request.id === "carry-rice";
  const isOpen = request.status === "open";
  const canOffer = !ownsRequest && isOpen && !request.offer;
  const canAccept = ownsRequest && isOpen && !!request.offer;
  const canThank =
    ownsRequest && request.status === "completed" && !request.thankYou;
  const personId = ownsRequest ? request.offer?.by : request.createdBy;
  const person = personId ? people[personId] : undefined;
  const matchedPerson = request.status === "matched" ? person : undefined;
  const listing = listings.find((item) => item.id === request.listingId);
  const isLoan = listing?.kind === "tool";
  const body = localizedType("body", locale);
  const supporting = localizedType("supporting", locale);
  const fieldLabel = localizedType("field-label", locale);
  const button = localizedType("button", locale);
  const showLocation = isRiceRequest && !ownsRequest;
  const showMessageOriginal = showLocation && showOriginal && locale !== "ja";
  const timingLabel = isRiceRequest
    ? copy.riceDate
    : isLoan
      ? copy.listingTiming
      : copy.timing;
  const hasActions = canOffer || canAccept || matchedPerson || canThank;

  return (
    <CommunityScreen
      back
      title={request.title}
      subtitle={
        showLocation && isOpen
          ? copy.fromCircle
          : copy.requestStatus[request.status]
      }
      footer={
        hasActions ? (
          <>
            {canOffer ? (
              <Button
                label={copy.canHelp}
                labelStyle={button}
                onPress={() => offerHelp(request.id)}
              />
            ) : null}
            {canAccept ? (
              <Button
                label={copy.accept}
                labelStyle={button}
                onPress={() => acceptOffer(request.id)}
              />
            ) : null}
            {matchedPerson ? (
              <>
                <Button
                  label={copy.chatWith.replace("{{name}}", matchedPerson.name)}
                  labelStyle={button}
                  onPress={() =>
                    router.push({
                      pathname: "/exchanges/[id]/chat",
                      params: { id: request.id },
                    })
                  }
                />
                <Button
                  label={copy.finish}
                  labelStyle={button}
                  variant="secondary"
                  onPress={() =>
                    router.push({
                      pathname: "/exchanges/[id]/complete",
                      params: { id: request.id },
                    })
                  }
                />
              </>
            ) : null}
            {canThank ? (
              <Button
                label={copy.thank}
                labelStyle={button}
                onPress={() =>
                  router.push({
                    pathname: "/exchanges/[id]/thank-you",
                    params: { id: request.id },
                  })
                }
              />
            ) : null}
          </>
        ) : undefined
      }
    >
      {showLocation ? (
        <View style={styles.photo}>
          <Image
            source={stairsPhoto}
            style={styles.stairs}
            contentFit="cover"
            accessible={false}
          />
          <Text style={[supporting, styles.detail]}>{copy.steps}</Text>
        </View>
      ) : null}
      {person ? (
        <View style={styles.person}>
          {personId === "neighbour" ? (
            <Image
              source={tanakaPhoto}
              style={styles.avatar}
              contentFit="cover"
              accessible={false}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text
                style={[fieldLabel, styles.title]}
                accessibilityElementsHidden
                importantForAccessibility="no"
              >
                {Array.from(person.name)[0]}
              </Text>
            </View>
          )}
          <View style={styles.personText}>
            <Text style={[fieldLabel, styles.title]}>{person.name}</Text>
            <Text style={[supporting, styles.detail]}>
              {showLocation
                ? copy.postedBy
                : ownsRequest && isOpen
                  ? copy.offeredToHelp
                  : copy.neighbour}
            </Text>
          </View>
          {ownsRequest && matchedPerson && isLoan ? (
            <Text style={[supporting, styles.lending]}>{copy.lending}</Text>
          ) : null}
        </View>
      ) : null}
      <Text
        style={[
          showMessageOriginal ? localizedType("body", "ja") : body,
          styles.title,
        ]}
      >
        {showMessageOriginal ? copy.originalRiceRequest : request.description}
      </Text>
      <View style={styles.fact}>
        <Text style={[fieldLabel, styles.title]}>{timingLabel}</Text>
        {ownsRequest ? (
          <View style={styles.timingField}>
            <Text style={[body, styles.title]}>{request.timing}</Text>
          </View>
        ) : (
          <Text style={[supporting, styles.detail]}>{request.timing}</Text>
        )}
      </View>
      {listing ? (
        <RequestNotice
          title={isLoan && matchedPerson ? copy.collect : copy.relatedListing}
          detail={
            isLoan && matchedPerson
              ? [
                  listingText(listing.title, locale),
                  listingText(listing.description, locale),
                ]
                  .filter(Boolean)
                  .join("\n")
              : listingText(listing.title, locale)
          }
          locale={locale}
        />
      ) : null}
      {showLocation ? (
        <View style={styles.fact}>
          <Text style={[fieldLabel, styles.title]}>{copy.riceLocation}</Text>
          <Text style={[supporting, styles.detail]}>{copy.meeting}</Text>
        </View>
      ) : null}
      {ownsRequest && isOpen && !request.offer ? (
        <Text style={[supporting, styles.detail]}>{copy.noOffers}</Text>
      ) : null}
      {!ownsRequest && isOpen && request.offer ? (
        <RequestNotice
          title={copy.offerSent}
          detail={copy.waitForReply}
          locale={locale}
        />
      ) : null}
      {showLocation && locale !== "ja" ? (
        <Button
          label={showMessageOriginal ? copy.showRequest : copy.originalJapanese}
          labelStyle={fieldLabel}
          variant="text"
          onPress={() => setShowOriginal(!showOriginal)}
        />
      ) : null}
      {request.thankYou ? (
        <RequestNotice
          title={copy.thanksSent}
          detail={request.thankYou}
          locale={locale}
        />
      ) : null}
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  photo: { gap: 4 },
  stairs: { width: "100%", height: 146, borderRadius: controls.radius },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.wash,
  },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["control-gap"],
  },
  personText: { flex: 1 },
  fact: { gap: 4 },
  timingField: {
    minHeight: controls["touch-target"],
    borderColor: colors.control,
    borderRadius: controls.radius,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: spacing["control-gap"],
    paddingVertical: spacing["related-gap"],
  },
  title: { color: colors.ink },
  detail: { color: colors.secondary },
  lending: { color: colors.action, flexShrink: 1 },
});
