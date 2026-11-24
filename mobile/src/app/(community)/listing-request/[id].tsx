import { Image } from "expo-image";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { RequestNotice } from "@/components/request-notice";
import { Button, ErrorText, Field } from "@/components/ui";
import { api, type ListingDetail } from "@/lib/api";
import { lendingCopy } from "@/lib/lending-copy";
import {
  buildListingRequest,
  isListingRequestKind,
  listingRequestError,
  listingRequestState,
  singleFlight,
  type ListingRequestError,
  type ListingRequestKind,
} from "@/lib/listing-request";
import { listingRequestCopy } from "@/lib/listing-request-copy";
import {
  createLatestRequest,
  isListingId,
  photoUrls,
} from "@/lib/listing-workflow";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { requestsApi } from "@/lib/requests-api";
import { useSession } from "@/lib/session";
import { colors, controls } from "@/theme/tokens.json";

export default function ListingRequestScreen() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind: string }>();
  const { session } = useSession();
  const { locale } = useOnboardingText();
  const account = session?.user.id ?? "";
  if (!isListingId(id) || !isListingRequestKind(kind))
    return (
      <CommunityScreen back>
        <Text>{lendingCopy[locale].listingMissing}</Text>
        <Button
          label={lendingCopy[locale].browseTitle}
          onPress={() => router.dismissTo("/tools")}
        />
      </CommunityScreen>
    );
  return (
    <ReviewListing
      key={`${account}:${id}:${kind}`}
      account={account}
      id={id}
      kind={kind}
    />
  );
}

function ReviewListing({
  account,
  id,
  kind,
}: {
  account: string;
  id: string;
  kind: ListingRequestKind;
}) {
  const { locale } = useOnboardingText();
  const { profile } = useSession();
  const profileId = profile.status === "ready" ? profile.profile.id : null;
  const copy = listingRequestCopy[locale];
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [text, setText] = useState("");
  const initialized = useRef(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ListingRequestError | null>(null);
  const [error, setError] = useState<ListingRequestError | null>(null);
  const [sending, setSending] = useState(false);
  const [tick, setTick] = useState(0);
  const [reads] = useState(createLatestRequest);
  const [sends] = useState(createLatestRequest);
  const [submit] = useState(() =>
    singleFlight(async (run: () => Promise<void>) => run()),
  );
  const active = useRef(false);
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      void tick;
      const read = reads.start();
      setLoading(true);
      setLoadError(null);
      if (!account) {
        setLoadError("auth");
        setLoading(false);
      } else {
        api
          .getListing(id, read.signal, account)
          .then((value) => {
            if (!read.isCurrent()) return;
            setListing(value);
            if (!initialized.current) {
              initialized.current = true;
              setText(
                kind === "borrow"
                  ? copy.defaultBorrow(value.title)
                  : copy.defaultHelp(value.title),
              );
            }
          })
          .catch((cause: unknown) => {
            if (read.isCurrent()) setLoadError(listingRequestError(cause));
          })
          .finally(() => {
            if (read.isCurrent()) setLoading(false);
          });
      }
      return () => {
        active.current = false;
        reads.cancel();
        sends.cancel();
      };
    }, [account, id, kind, reads, sends, tick, copy]),
  );

  const sendRequest = useCallback(async () => {
    if (!listing || !profileId || !active.current) return;
    const state = listingRequestState(listing, profileId);
    const body =
      state.mode === "actions"
        ? buildListingRequest(listing, kind, text, locale)
        : null;
    if (!body) {
      setError("invalid");
      return;
    }
    const send = sends.start();
    setSending(true);
    setError(null);
    try {
      const created = await requestsApi.create(body, {
        authUserId: account,
        signal: send.signal,
      });
      if (active.current && send.isCurrent())
        router.replace({
          pathname: "/requests/[id]",
          params: { id: created.id },
        });
    } catch (cause) {
      if (active.current && send.isCurrent())
        setError(listingRequestError(cause));
    } finally {
      if (active.current) setSending(false);
    }
  }, [account, kind, locale, listing, profileId, text, sends]);

  const state = listing ? listingRequestState(listing, profileId) : null;
  const allowed = state?.mode === "actions" && state.actions.includes(kind);
  const readOnly =
    state?.mode === "readOnly"
      ? {
          own: copy.ownListing,
          paused: copy.pausedReadOnly,
          lent_out: copy.lentOutReadOnly,
          noOwner: copy.noOwner,
        }[state.reason]
      : copy.unavailable;
  const photo = listing ? photoUrls(listing)[0] : null;
  return (
    <CommunityScreen
      title={copy.reviewTitle}
      back
      keyboard
      showDemoPreview={false}
      footer={
        !loading && !loadError && allowed ? (
          <Button
            label={sending ? copy.sending : copy.send}
            busy={sending}
            disabled={!profileId || !text.trim()}
            onPress={() => void submit(sendRequest)}
          />
        ) : undefined
      }
    >
      {loading ? (
        <ActivityIndicator color={colors.action} />
      ) : loadError ? (
        <>
          <ErrorText>{copy[loadError]}</ErrorText>
          <Button label={copy.retry} onPress={() => setTick((n) => n + 1)} />
        </>
      ) : listing ? (
        <>
          {photo ? (
            <Image
              source={{ uri: photo.url }}
              style={styles.photo}
              contentFit="cover"
              accessibilityLabel={listing.title}
            />
          ) : null}
          <RequestNotice
            title={copy.about}
            detail={listing.title}
            locale={locale}
          />
          <RequestNotice
            title={copy.to}
            detail={listing.owner?.display_name ?? copy.noOwner}
            locale={locale}
          />
          {allowed ? (
            <>
              <Field
                label={copy.messageLabel}
                value={text}
                onChangeText={setText}
                multiline
                maxLength={2000}
                editable={!sending}
                labelStyle={localizedType("field-label", locale)}
              />
              <Text style={localizedType("supporting", locale)}>
                {copy.nothingSent}
              </Text>
            </>
          ) : (
            <ErrorText>{readOnly}</ErrorText>
          )}
          {error ? <ErrorText>{copy[error]}</ErrorText> : null}
          {!allowed || error === "unavailable" ? (
            <Button
              label={copy.backToListing}
              variant="secondary"
              onPress={() => router.back()}
            />
          ) : null}
        </>
      ) : null}
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  photo: { width: "100%", aspectRatio: 2, borderRadius: controls.radius },
});
