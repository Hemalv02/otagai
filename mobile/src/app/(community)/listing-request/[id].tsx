import { Image } from "expo-image";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { Button, ErrorText, Field } from "@/components/ui";
import { api, ApiError, type ListingDetail } from "@/lib/api";
import { lendingCopy } from "@/lib/lending-copy";
import {
  buildListingRequest,
  isListingRequestKind,
  listingRequestError,
  type ListingRequestError,
  listingRequestState,
  MAX_REQUEST_TEXT,
} from "@/lib/listing-request";
import { listingRequestCopy } from "@/lib/listing-request-copy";
import { listingReadCopy, requestApiError } from "@/lib/listing-read";
import {
  createLatestRequest,
  isListingId,
  photoUrls,
} from "@/lib/listing-workflow";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { requestsApi } from "@/lib/requests-api";
import { useSession } from "@/lib/session";
import { colors, controls, spacing } from "@/theme/tokens.json";

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; listing: ListingDetail }
  | { status: "error"; kind: ReturnType<typeof requestApiError> };

export default function ListingRequestScreen() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind: string }>();
  const { session } = useSession();
  const account = session?.user.id ?? "";
  return (
    <ListingRequestFlow
      key={`${account}:${id}:${kind}`}
      id={id}
      kind={kind}
      account={account}
    />
  );
}

function ListingRequestFlow({
  id,
  kind,
  account,
}: {
  id: string;
  kind: string;
  account: string;
}) {
  const { locale } = useOnboardingText();
  const { profile } = useSession();
  const profileId = profile.status === "ready" ? profile.profile.id : null;
  const copy = listingRequestCopy[locale];
  const lending = lendingCopy[locale];
  const readCopy = listingReadCopy[locale];
  const bodyType = localizedType("body", locale);
  const buttonType = localizedType("button", locale);
  const validRoute = isListingId(id) && isListingRequestKind(kind);

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [requests] = useState(createLatestRequest);
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<ListingRequestError | null>(null);

  const load = useCallback(() => {
    if (!account || !validRoute) {
      requests.cancel();
      return;
    }
    const request = requests.start();
    setState({ status: "loading" });
    api
      .getListing(id, request.signal, account)
      .then((listing) => {
        if (request.isCurrent()) setState({ status: "loaded", listing });
      })
      .catch((error: unknown) => {
        if (request.isCurrent()) {
          setState({ status: "error", kind: requestApiError(error) });
        }
      });
  }, [account, id, validRoute, requests]);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => requests.cancel();
    }, [load, requests]),
  );

  const listing = state.status === "loaded" ? state.listing : null;
  const [existingId, setExistingId] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const [sendRequests] = useState(createLatestRequest);
  const focus = useRef<symbol | null>(null);
  useFocusEffect(
    useCallback(() => {
      focus.current = Symbol();
      return () => {
        focus.current = null;
        sendRequests.cancel();
        sendingRef.current = false;
        setSending(false);
      };
    }, [sendRequests]),
  );

  async function send() {
    const startedOn = focus.current;
    if (
      !startedOn ||
      sendingRef.current ||
      !listing ||
      !profileId ||
      !isListingRequestKind(kind) ||
      !allowed
    )
      return;
    const body = buildListingRequest(listing, kind, text, locale);
    if (!body) {
      setFailure("invalid");
      return;
    }
    const request = sendRequests.start();
    const stillCurrent = () =>
      focus.current === startedOn && request.isCurrent();
    sendingRef.current = true;
    setSending(true);
    setFailure(null);
    setExistingId(null);
    try {
      const created = await requestsApi.create(body, account, request.signal);
      if (!stillCurrent()) return;
      router.replace({
        pathname: "/requests/[id]",
        params: { id: created.id },
      });
    } catch (cause) {
      if (!stillCurrent()) return;
      const kind = listingRequestError(cause);
      setFailure(kind);
      if (kind === "alreadyOpen" && cause instanceof ApiError) {
        setExistingId(cause.requestId ?? null);
      }
    } finally {
      if (stillCurrent()) {
        sendingRef.current = false;
        setSending(false);
      }
    }
  }

  if (!validRoute) {
    return (
      <CommunityScreen back showDemoPreview={false}>
        <Text accessibilityRole="alert" style={[bodyType, styles.ink]}>
          {lending.listingMissing}
        </Text>
        <Button
          label={lending.browseTitle}
          labelStyle={buttonType}
          onPress={() => router.dismissTo("/tools")}
        />
      </CommunityScreen>
    );
  }

  if (!listing) {
    const errorMessage =
      state.status !== "error"
        ? null
        : state.kind === "unavailable"
          ? lending.listingMissing
          : state.kind === "transient"
            ? readCopy.transient
            : state.kind === "auth"
              ? readCopy.auth
              : readCopy.error;
    return (
      <CommunityScreen back showDemoPreview={false} title={copy.reviewTitle}>
        {errorMessage ? (
          <>
            <Text accessibilityRole="alert" style={[bodyType, styles.ink]}>
              {errorMessage}
            </Text>
            {state.status === "error" && state.kind === "transient" ? (
              <Button
                label={copy.retry}
                labelStyle={buttonType}
                onPress={load}
              />
            ) : (
              <Button
                label={lending.browseTitle}
                labelStyle={buttonType}
                onPress={() => router.dismissTo("/tools")}
              />
            )}
          </>
        ) : (
          <ActivityIndicator color={colors.action} />
        )}
      </CommunityScreen>
    );
  }

  const requestState = listingRequestState(listing, profileId);
  const allowed =
    requestState.mode === "actions" && requestState.actions.includes(kind);
  if (!allowed) {
    const note =
      requestState.mode === "readOnly"
        ? requestState.reason === "own"
          ? copy.ownListing
          : requestState.reason === "paused"
            ? copy.pausedReadOnly
            : requestState.reason === "lent_out"
              ? copy.lentOutReadOnly
              : copy.noOwner
        : copy.unavailable;
    return (
      <CommunityScreen back showDemoPreview={false} title={copy.reviewTitle}>
        <Text accessibilityRole="alert" style={[bodyType, styles.ink]}>
          {note}
        </Text>
        <Button
          label={copy.backToListing}
          labelStyle={buttonType}
          onPress={() => router.back()}
        />
      </CommunityScreen>
    );
  }

  const text =
    message ??
    (kind === "borrow"
      ? copy.defaultBorrow(listing.title)
      : copy.defaultHelp(listing.title));
  const photo = photoUrls(listing)[0];
  const failureText = failure ? copy[failure] : null;

  return (
    <CommunityScreen
      back
      showDemoPreview={false}
      keyboard
      title={copy.reviewTitle}
      footer={
        <View style={styles.footer}>
          {failure === "alreadyOpen" && existingId ? (
            <Button
              variant="secondary"
              label={copy.openExisting}
              labelStyle={buttonType}
              onPress={() =>
                router.replace({
                  pathname: "/requests/[id]",
                  params: { id: existingId },
                })
              }
            />
          ) : null}
          {failure === "unavailable" ? (
            <Button
              variant="secondary"
              label={copy.backToListing}
              labelStyle={buttonType}
              onPress={() => router.back()}
            />
          ) : null}
          <Button
            label={sending ? copy.sending : copy.send}
            labelStyle={buttonType}
            busy={sending}
            disabled={!text.trim() || !profileId}
            onPress={() => void send()}
          />
        </View>
      }
    >
      <View style={styles.summary}>
        {photo ? (
          <Image
            source={{ uri: photo.url }}
            style={styles.thumb}
            contentFit="cover"
            accessibilityLabel={listing.title}
          />
        ) : null}
        <View style={styles.summaryText}>
          <Text style={[localizedType("supporting", locale), styles.secondary]}>
            {copy.about}
          </Text>
          <Text style={[localizedType("field-label", locale), styles.ink]}>
            {listing.title}
          </Text>
          <Text style={[localizedType("supporting", locale), styles.secondary]}>
            {copy.to}
          </Text>
          <Text style={[localizedType("field-label", locale), styles.ink]}>
            {listing.owner?.display_name}
          </Text>
        </View>
      </View>
      <Field
        label={copy.messageLabel}
        labelStyle={localizedType("field-label", locale)}
        value={text}
        onChangeText={(value) => {
          setMessage(value);
          setFailure(null);
        }}
        multiline
        maxLength={MAX_REQUEST_TEXT}
        editable={!sending}
      />
      <Text style={[localizedType("supporting", locale), styles.secondary]}>
        {copy.nothingSent}
      </Text>
      {failureText ? <ErrorText>{failureText}</ErrorText> : null}
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", gap: spacing["related-gap"] },
  summaryText: { flex: 1, minWidth: 0, gap: 2 },
  thumb: { width: 72, height: 72, borderRadius: controls.radius },
  footer: { gap: spacing["related-gap"] },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
});
