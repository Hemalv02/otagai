import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AssistantSheet } from "@/components/assistant-widgets";
import { CommunityScreen } from "@/components/community-screen";
import { DemoRequestDetail } from "@/components/demo-request-detail";
import { RequestNotice } from "@/components/request-notice";
import { RequestResponseForm } from "@/components/request-response-form";
import { Button, ErrorText } from "@/components/ui";
import { api, ApiError, type Page } from "@/lib/api";
import { assistantError, assistantApi } from "@/lib/assistant-api";
import { assistantCopy } from "@/lib/assistant-copy";
import { listingRequestCopy } from "@/lib/listing-request-copy";
import { liveRequestCopy } from "@/lib/live-request-copy";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { requestCopy } from "@/lib/request-demo-copy";
import {
  type RequestDetail,
  type RequestResponse,
  type ResponseKind,
  requestsApi,
} from "@/lib/requests-api";
import { colors, controls, spacing } from "@/theme/tokens.json";

const requestIdPattern = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;

type RequestConfirmation = {
  title: string;
  message: string;
  label: string;
  action: () => Promise<unknown>;
};

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return requestIdPattern.test(id) ? (
    <LiveRequestDetail key={id} id={id} />
  ) : (
    <DemoRequestDetail id={id} />
  );
}

function LiveRequestDetail({ id }: { id: string }) {
  const { locale, t } = useOnboardingText();
  const copy = requestCopy[locale];
  const live = liveRequestCopy[locale];
  const words = assistantCopy[locale];
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [responses, setResponses] = useState<Page<RequestResponse> | null>(
    null,
  );
  const [names, setNames] = useState<Record<string, string>>({});
  const [listingTitle, setListingTitle] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [responseError, setResponseError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [working, setWorking] = useState(false);
  const mutating = useRef(false);
  const version = useRef(0);
  const markedSeen = useRef(false);
  const [form, setForm] = useState<ResponseKind>();
  const [confirmation, setConfirmation] = useState<RequestConfirmation>();
  const [translation, setTranslation] = useState<{
    locale: string;
    text: string;
    source: string;
  }>();
  const [translating, setTranslating] = useState(false);
  const translated =
    translation?.locale === locale &&
    translation.source === detail?.polite_text;

  const load = useCallback(async () => {
    const current = ++version.current;
    setLoading(true);
    setLoadingResponses(false);
    setError(null);
    setResponseError(null);
    try {
      const data = await requestsApi.detail(id);
      if (current !== version.current) return;
      setDetail(data);
      setListingTitle(null);
      if (data.listing_id) {
        const listingId = data.listing_id;
        void api
          .getListing(listingId)
          .then((listing) => {
            if (current === version.current) setListingTitle(listing.title);
          })
          .catch(() => undefined);
      }
      if (data.my_role === "requester") {
        try {
          const page = await requestsApi.responses(id);
          if (current !== version.current) return;
          setResponses(page);
          void loadNames(
            page.items.map((item) => item.responder_user_id),
            current,
          );
        } catch (cause) {
          if (current === version.current) setResponseError(cause);
        }
      } else {
        void loadNames([data.requester_user_id], current);
        if (!markedSeen.current) {
          markedSeen.current = true;
          void requestsApi.markSeen(id).catch(() => {
            markedSeen.current = false;
          });
        }
      }
    } catch (cause) {
      if (current !== version.current) return;
      setError(cause);
      if (cause instanceof ApiError && [403, 404].includes(cause.status))
        setDetail(null);
    } finally {
      if (current === version.current) setLoading(false);
    }
  }, [id]);

  async function loadNames(ids: string[], current: number) {
    const people = await Promise.allSettled(
      [...new Set(ids)].map(
        async (person) =>
          [person, (await requestsApi.person(person)).display_name] as const,
      ),
    );
    if (current !== version.current) return;
    setNames((existing) => ({
      ...existing,
      ...Object.fromEntries(
        people.flatMap((person) =>
          person.status === "fulfilled" ? [person.value] : [],
        ),
      ),
    }));
  }

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        version.current += 1;
      };
    }, [load]),
  );

  async function loadMore() {
    if (!responses?.next_cursor || loadingResponses || loading || working)
      return;
    const current = version.current;
    setLoadingResponses(true);
    setResponseError(null);
    try {
      const page = await requestsApi.responses(id, responses.next_cursor);
      if (current !== version.current) return;
      setResponses((previous) => ({
        items: [...(previous?.items ?? []), ...page.items],
        next_cursor: page.next_cursor,
      }));
      void loadNames(
        page.items.map((item) => item.responder_user_id),
        current,
      );
    } catch (cause) {
      if (current === version.current) setResponseError(cause);
    } finally {
      if (current === version.current) setLoadingResponses(false);
    }
  }

  async function apply(action: () => Promise<unknown>) {
    if (mutating.current || loading) return;
    mutating.current = true;
    setWorking(true);
    setActionError(undefined);
    try {
      await action();
      setForm(undefined);
      setConfirmation(undefined);
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setForm(undefined);
        setConfirmation(undefined);
        await load();
        setActionError(live.changed);
      } else {
        setActionError(assistantError(cause, locale));
      }
    } finally {
      mutating.current = false;
      setWorking(false);
    }
  }

  async function showTranslation() {
    if (!detail || translating) return;
    if (translated) {
      setTranslation(undefined);
      return;
    }
    setTranslating(true);
    setActionError(undefined);
    try {
      const result = await assistantApi.translate(
        detail.polite_text,
        detail.lang,
        locale,
      );
      setTranslation({
        locale,
        text: result.translated,
        source: detail.polite_text,
      });
    } catch (cause) {
      setActionError(assistantError(cause, locale));
    } finally {
      setTranslating(false);
    }
  }

  const label = localizedType("field-label", locale);
  const supporting = localizedType("supporting", locale);
  const body = localizedType("body", locale);
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));

  if (!detail) {
    const unavailable =
      error instanceof ApiError && [403, 404].includes(error.status);
    return (
      <CommunityScreen
        back
        title={unavailable ? copy.notFound : copy.requests}
        showDemoPreview={false}
      >
        {loading ? (
          <ActivityIndicator
            accessibilityLabel={words.loading}
            color={colors.action}
          />
        ) : null}
        {error && !unavailable ? (
          <>
            <ErrorText>{assistantError(error, locale)}</ErrorText>
            <Button
              variant="text"
              label={t("tryAgain")}
              onPress={() => void load()}
            />
          </>
        ) : null}
      </CommunityScreen>
    );
  }

  const owns = detail.my_role === "requester";
  const isOpen = detail.status === "open";
  const responding = !owns && isOpen && !detail.my_response_id;
  const pendingResponse =
    !owns && isOpen && detail.my_response_status === "pending";
  const timing = [detail.needed_from, detail.needed_until]
    .filter((value) => value !== null)
    .map(formatDate)
    .join(" – ");
  const requesterName = names[detail.requester_user_id];
  const disabled = loading || working;

  function startForm(kind: ResponseKind) {
    setActionError(undefined);
    setForm(kind);
  }

  function confirmAction(
    title: string,
    message: string,
    submitLabel: string,
    action: () => Promise<unknown>,
  ) {
    setActionError(undefined);
    setConfirmation({ title, message, label: submitLabel, action });
  }

  return (
    <CommunityScreen
      back
      showDemoPreview={false}
      title={copy.requests}
      subtitle={live.status[detail.status]}
      footer={
        detail.exchange_id || responding ? (
          <Button
            label={detail.exchange_id ? live.openExchange : copy.canHelp}
            labelStyle={label}
            disabled={disabled}
            onPress={() => {
              if (detail.exchange_id) {
                router.push({
                  pathname: "/exchanges/[id]",
                  params: { id: detail.exchange_id },
                });
              } else {
                startForm("offer");
              }
            }}
          />
        ) : undefined
      }
    >
      <View style={styles.card}>
        {!owns && requesterName ? (
          <Text style={[supporting, styles.secondary]}>
            {live.postedBy} · {requesterName}
          </Text>
        ) : null}
        <Text style={[body, styles.ink]}>
          {translated ? translation?.text : detail.polite_text}
        </Text>
        {timing ? (
          <Text style={[supporting, styles.secondary]}>{timing}</Text>
        ) : null}
        {detail.lang !== locale ? (
          <Button
            variant="text"
            label={translated ? words.original : words.translate}
            labelStyle={label}
            busy={translating}
            onPress={() => void showTranslation()}
          />
        ) : null}
      </View>
      {detail.listing_id && listingTitle ? (
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            router.push({
              pathname: "/tools/[id]",
              params: { id: detail.listing_id! },
            })
          }
        >
          <RequestNotice
            title={listingRequestCopy[locale].requestedListing}
            detail={listingTitle}
            locale={locale}
          />
        </Pressable>
      ) : null}
      {error ? (
        <>
          <ErrorText>{assistantError(error, locale)}</ErrorText>
          <Button
            variant="text"
            label={t("tryAgain")}
            onPress={() => void load()}
          />
        </>
      ) : null}
      {actionError && !form && !confirmation ? (
        <ErrorText>{actionError}</ErrorText>
      ) : null}

      {responding ? (
        <View style={styles.actions}>
          <Button
            variant="secondary"
            label={live.question}
            labelStyle={label}
            disabled={disabled}
            onPress={() => startForm("question")}
          />
          <Button
            variant="secondary"
            label={live.counter_time}
            labelStyle={label}
            disabled={disabled}
            onPress={() => startForm("counter_time")}
          />
        </View>
      ) : null}

      {!owns && detail.my_response_status ? (
        <RequestNotice
          title={live.responseSent}
          detail={live.responseStatus[detail.my_response_status]}
          locale={locale}
        />
      ) : null}
      {pendingResponse && detail.my_response_id ? (
        <Button
          variant="text"
          label={live.withdraw}
          labelStyle={label}
          disabled={disabled}
          onPress={() =>
            confirmAction(
              live.withdraw,
              live.withdrawDetail,
              live.withdraw,
              () => requestsApi.withdraw(id, detail.my_response_id!),
            )
          }
        />
      ) : null}

      {owns ? (
        <View style={styles.actions}>
          <Text
            accessibilityRole="header"
            style={[localizedType("section-heading", locale), styles.ink]}
          >
            {live.received}
          </Text>
          {!loading && !responseError && !responses?.items.length ? (
            <Text style={[supporting, styles.secondary]}>{live.available}</Text>
          ) : null}
          {responses?.items.map((response) => {
            const canAccept =
              isOpen &&
              response.status === "pending" &&
              response.kind !== "question";
            const acceptLabel =
              response.kind === "counter_time" ? live.acceptTime : copy.accept;
            return (
              <View key={response.id} style={styles.card}>
                <Text style={[label, styles.ink]}>
                  {names[response.responder_user_id] ?? copy.neighbour}
                </Text>
                <Text style={[supporting, styles.secondary]}>
                  {live[response.kind]} · {live.responseStatus[response.status]}
                </Text>
                {response.proposed_start ? (
                  <Text style={[label, styles.green]}>
                    {formatDate(response.proposed_start)}
                  </Text>
                ) : null}
                {response.message ? (
                  <Text style={[body, styles.ink]}>{response.message}</Text>
                ) : null}
                {canAccept ? (
                  <Button
                    variant="secondary"
                    label={acceptLabel}
                    labelStyle={label}
                    disabled={disabled}
                    onPress={() =>
                      confirmAction(
                        live.acceptTitle,
                        live.acceptDetail,
                        acceptLabel,
                        () => requestsApi.accept(id, response.id),
                      )
                    }
                  />
                ) : null}
              </View>
            );
          })}
          {responseError ? (
            <>
              <ErrorText>{assistantError(responseError, locale)}</ErrorText>
              <Button
                variant="text"
                label={t("tryAgain")}
                onPress={() => void load()}
              />
            </>
          ) : null}
          {responses?.next_cursor && !responseError ? (
            <Button
              variant="text"
              label={words.more}
              busy={loadingResponses}
              disabled={disabled}
              onPress={() => void loadMore()}
            />
          ) : null}
          {isOpen ? (
            <Button
              variant="text"
              label={live.cancelRequest}
              labelStyle={label}
              disabled={disabled}
              onPress={() =>
                confirmAction(
                  live.cancelRequest,
                  live.cancelDetail,
                  live.cancelRequest,
                  () => requestsApi.cancel(id),
                )
              }
            />
          ) : null}
        </View>
      ) : null}

      {!loading && !working && !error ? (
        <Button
          variant="text"
          label={live.refresh}
          labelStyle={label}
          onPress={() => void load()}
        />
      ) : null}
      {form ? (
        <RequestResponseForm
          kind={form}
          locale={locale}
          busy={working}
          error={actionError}
          close={() => {
            if (!mutating.current) setForm(undefined);
          }}
          send={(response) =>
            void apply(() => requestsApi.respond(id, response))
          }
        />
      ) : null}
      {confirmation ? (
        <AssistantSheet
          title={confirmation.title}
          locale={locale}
          close={() => {
            if (!mutating.current) setConfirmation(undefined);
          }}
          footer={
            <View style={styles.actions}>
              <Button
                label={confirmation.label}
                labelStyle={label}
                busy={working}
                onPress={() => void apply(confirmation.action)}
              />
              <Button
                variant="secondary"
                label={live.cancel}
                labelStyle={label}
                disabled={working}
                onPress={() => setConfirmation(undefined)}
              />
            </View>
          }
        >
          <Text style={[body, styles.ink]}>{confirmation.message}</Text>
          {actionError ? <ErrorText>{actionError}</ErrorText> : null}
        </AssistantSheet>
      ) : null}
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: controls.radius,
    padding: spacing["card-inset"],
    gap: 8,
  },
  actions: { gap: spacing["related-gap"] },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
  green: { color: colors.action },
});
