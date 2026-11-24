import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { Button, ErrorText } from "@/components/ui";
import { ApiError } from "@/lib/api";
import {
  assistantApi,
  type HelperProfile,
  type ListingDetail,
  type PostedRequest,
} from "@/lib/assistant-api";
import { assistantCopy } from "@/lib/assistant-copy";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { colors, spacing } from "@/theme/tokens.json";

type Detail =
  | { type: "listing"; listing: ListingDetail }
  | { type: "helper"; helper: HelperProfile; listing: ListingDetail | null }
  | { type: "request"; request: PostedRequest };

async function readDetail(
  type: string,
  id: string,
  skill?: string,
): Promise<Detail> {
  if (type === "listing")
    return { type, listing: await assistantApi.listing(id) };
  if (type === "request")
    return { type, request: await assistantApi.postedRequest(id) };
  if (type === "helper") {
    const [helper, listing] = await Promise.all([
      assistantApi.helper(id),
      skill ? assistantApi.listing(skill).catch(() => null) : null,
    ]);
    return {
      type,
      helper,
      listing: listing?.owner?.id === helper.id ? listing : null,
    };
  }
  throw new ApiError(404, "Unknown detail type");
}

export default function AssistantDetailScreen() {
  const localizedType = useLocalizedType();
  const { type, id, skill } = useLocalSearchParams<{
    type: string;
    id: string;
    skill?: string;
  }>();
  const { locale } = useOnboardingText();
  const copy = assistantCopy[locale];
  const [state, setState] = useState<Detail | "missing" | "failed" | null>(
    null,
  );
  const [retry, setRetry] = useState(0);
  const [translation, setTranslation] = useState<{
    locale: string;
    text: string;
  } | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState(false);
  const body = localizedType("body", locale);
  const label = localizedType("field-label", locale);
  const supporting = localizedType("supporting", locale);

  useEffect(() => {
    let active = true;
    readDetail(type, id, skill)
      .then((detail) => {
        if (active) setState(detail);
      })
      .catch((error) => {
        if (active)
          setState(
            error instanceof ApiError && error.status === 404
              ? "missing"
              : "failed",
          );
      });
    return () => {
      active = false;
    };
  }, [id, retry, skill, type]);

  if (!state || typeof state === "string") {
    return (
      <CommunityScreen back>
        {!state ? (
          <ActivityIndicator
            accessibilityLabel={copy.loading}
            color={colors.action}
          />
        ) : (
          <>
            <ErrorText>
              {state === "missing" ? copy.unavailable : copy.failed}
            </ErrorText>
            <Button
              variant="secondary"
              label={copy.retry}
              labelStyle={label}
              onPress={() => {
                setState(null);
                setRetry((current) => current + 1);
              }}
            />
          </>
        )}
      </CommunityScreen>
    );
  }

  const listing = state.type !== "request" ? state.listing : null;
  const title =
    state.type === "helper"
      ? state.helper.display_name
      : state.type === "listing"
        ? state.listing.title
        : copy.details;
  const description =
    state.type === "request" ? state.request.polite_text : listing?.description;
  const language =
    state.type === "request" ? state.request.lang : listing?.lang;
  const visibleTranslation =
    translation?.locale === locale ? translation.text : null;
  const photo = listing?.photos.find((item) => item.display_url)?.display_url;

  async function translate() {
    if (visibleTranslation) {
      setTranslation(null);
      return;
    }
    if (!description || !language || translating) return;
    setTranslating(true);
    setTranslationError(false);
    try {
      const result = await assistantApi.translate(
        description,
        language,
        locale,
      );
      setTranslation({ locale, text: result.translated });
    } catch {
      setTranslationError(true);
    } finally {
      setTranslating(false);
    }
  }

  return (
    <CommunityScreen back title={title}>
      {photo && state.type === "listing" ? (
        <Image source={photo} style={styles.photo} contentFit="cover" />
      ) : null}
      {state.type === "listing" || state.type === "request" ? (
        <View style={styles.status}>
          <Text style={[label, styles.green]}>
            {
              copy.status[
                state.type === "listing"
                  ? state.listing.status
                  : state.request.status
              ]
            }
          </Text>
        </View>
      ) : null}
      {state.type === "listing" && listing?.owner ? (
        <Text style={[supporting, styles.secondary]}>
          {copy.by} {listing.owner.display_name}
        </Text>
      ) : null}
      {state.type === "helper" ? (
        <>
          {state.helper.intro ? (
            <Text style={[body, styles.ink]}>{state.helper.intro}</Text>
          ) : null}
          {state.helper.happy_to_help_with || listing ? (
            <View style={styles.panel}>
              <Text style={[label, styles.green]}>{copy.skills}</Text>
              {listing ? (
                <Text style={[body, styles.ink]}>{listing.title}</Text>
              ) : null}
              {state.helper.happy_to_help_with ? (
                <Text style={[supporting, styles.secondary]}>
                  {state.helper.happy_to_help_with}
                </Text>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
      {description ? (
        <Text style={[body, styles.ink]}>
          {visibleTranslation ?? description}
        </Text>
      ) : null}
      {description && language && language !== locale ? (
        <Button
          variant="text"
          label={visibleTranslation ? copy.original : copy.translate}
          busy={translating}
          onPress={() => void translate()}
          labelStyle={label}
        />
      ) : null}
      {translationError ? <ErrorText>{copy.failed}</ErrorText> : null}
      {listing?.availability_note ? (
        <Text style={[supporting, styles.secondary]}>
          {listing.availability_note}
        </Text>
      ) : null}
      {listing?.safety_notes ? (
        <View style={styles.panel}>
          <Text style={[label, styles.green]}>{copy.safety}</Text>
          <Text style={[body, styles.ink]}>{listing.safety_notes}</Text>
        </View>
      ) : null}
      {listing?.parts.length ? (
        <View style={styles.panel}>
          <Text style={[label, styles.green]}>{copy.parts}</Text>
          {listing.parts.map((part, index) => (
            <Text
              key={`${part.label}-${index}`}
              style={[supporting, styles.ink]}
            >
              {part.label} × {part.quantity}
            </Text>
          ))}
        </View>
      ) : null}
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  photo: {
    width: "100%",
    aspectRatio: 1.55,
    borderRadius: 14,
    backgroundColor: colors.paper,
  },
  status: {
    alignSelf: "flex-start",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: colors.wash,
  },
  panel: {
    borderRadius: 12,
    padding: spacing["card-inset"],
    gap: 5,
    backgroundColor: colors.paper,
  },
  green: { color: colors.action },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
});
