import { router, useLocalSearchParams, usePreventRemove } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ActivityStatus, ActivityText } from "@/components/activity-ui";
import { CommunityScreen } from "@/components/community-screen";
import {
  NeighbourConfirmation,
  NeighbourNotice,
  SelectionCopy,
} from "@/components/neighbour-ui";
import { Button, ErrorText, Field } from "@/components/ui";
import { activityCopy } from "@/lib/activity-copy";
import { ApiError, type Exchange } from "@/lib/api";
import { useLiveResource } from "@/lib/live-resource";
import {
  exchangeLabel,
  findSentNote,
  isUnavailable,
  isUuid,
  neighbourApi,
  optionalVisible,
  partnerFor,
  type ThankYou,
} from "@/lib/neighbour-api";
import { neighbourCopy } from "@/lib/neighbour-copy";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { THANK_YOU_POINTS, type ThankYouChoice } from "@/lib/thank-you";
import { thankYouCopy } from "@/lib/thank-you-copy";
import { colors, spacing } from "@/theme/tokens.json";

export function ThankYouComposer({ mode }: { mode: Exchange["mode"] }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile } = useSession();
  const member = profile.status === "ready" ? profile.profile : null;
  return (
    <ExchangeThankYou
      key={`${session?.user.id}:${mode}:${id}`}
      id={id}
      authUserId={session?.user.id ?? ""}
      profileId={member?.id ?? ""}
      mode={mode}
      region={member?.region === "bd" ? "bd" : "jp"}
    />
  );
}

function ExchangeThankYou({
  id,
  authUserId,
  profileId,
  mode,
  region,
}: {
  id: string;
  authUserId: string;
  profileId: string;
  mode: Exchange["mode"];
  region: "jp" | "bd";
}) {
  const localizedType = useLocalizedType();
  const { locale } = useOnboardingText();
  const copy = neighbourCopy[locale];
  const thanks = thankYouCopy[locale];
  const culturePack = region === "bd" ? "bangladesh" : "japan";
  const currency = region === "bd" ? "BDT" : "JPY";
  const demoProvider = region === "bd" ? "bKash" : "Stripe";
  const demoAmount = new Intl.NumberFormat(locale, { style: "currency", currency })
    .format(region === "bd" ? 50 : 500);
  const api = useMemo(() => neighbourApi(authUserId), [authUserId]);
  const data = useLiveResource(
    useCallback(async () => {
      if (!authUserId || !profileId || !isUuid(id))
        return { status: "unavailable" } as const;
      try {
        const exchange = await api.exchange(id);
        const partnerId = partnerFor(exchange, profileId);
        if (exchange.mode !== mode || !partnerId)
          return { status: "unavailable" } as const;
        if (exchange.status !== "completed")
          return { status: "incomplete" } as const;
        const [person, title, existing] = await Promise.all([
          optionalVisible(api.profile(partnerId)),
          exchangeLabel(api, exchange),
          findSentNote(api, id),
        ]);
        if (!person && !existing) return { status: "unavailable" } as const;
        return {
          status: "ready",
          name: person?.display_name,
          title,
          existing,
          requester: exchange.requester_user_id === profileId,
        } as const;
      } catch (error) {
        if (isUnavailable(error)) return { status: "unavailable" } as const;
        throw error;
      }
    }, [api, authUserId, id, mode, profileId]),
  );
  const [choice, setChoice] = useState<ThankYouChoice>("note");
  const [note, setNote] = useState("");
  const [orei, setOrei] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const [suggested, setSuggested] = useState(false);
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [error, setError] = useState<"draft" | "send" | null>(null);
  const [confirmed, setConfirmed] = useState<ThankYou | null>(null);
  const [confirmation, setConfirmation] = useState<{
    kind: "discard" | "replace";
    proceed: () => void;
  } | null>(null);
  const lock = useRef(false);
  const context = data.data?.status === "ready" ? data.data : null;
  const saved = confirmed ?? context?.existing;
  const name = context?.name ?? copy.neighbour;
  const showExchange = () =>
    router.navigate({
      pathname: mode === "loan" ? "/loans/[id]" : "/exchanges/[id]",
      params: { id },
    });
  const options = [
    { value: "note", title: copy.sendNote, detail: copy.privateTo(name) },
    { value: "points", title: thanks.points(THANK_YOU_POINTS), detail: thanks.pointsDetail },
    { value: "demo", title: thanks.demo, detail: thanks.demoDetail },
  ] as const;
  const unsent = Boolean(note.trim()) && !saved;
  const allowLeave = usePreventRemove(unsent, ({ repeat }) => {
    if (lock.current) return;
    setConfirmation({
      kind: "discard",
      proceed: () => {
        setNote("");
        repeat();
      },
    });
  });

  function maybeLater() {
    if (!unsent) {
      showExchange();
      return;
    }
    setConfirmation({
      kind: "discard",
      proceed: () => {
        setNote("");
        allowLeave();
        showExchange();
      },
    });
  }

  async function suggest() {
    if (!context || lock.current) return;
    lock.current = true;
    setBusy("draft");
    setError(null);
    try {
      const task = context.title;
      const describe = mode === "help"
        ? context.requester ? thanks.draftHelpReceived : thanks.draftHelpGiven
        : context.requester ? thanks.draftLoanReceived : thanks.draftLoanGiven;
      const helpedWith = task ? describe(task) : copy.completed;
      const result = await api.suggest(
        helpedWith.slice(0, 500),
        locale,
        culturePack,
      );
      if (!result.note.trim()) throw new Error("Empty suggestion.");
      setNote(result.note.trim().slice(0, 1000));
      setOrei(result.suggested_orei.trim().slice(0, 200) || null);
      setSuggested(true);
    } catch {
      setError("draft");
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }

  async function send() {
    if (!context || !review || !note.trim() || lock.current || saved) return;
    lock.current = true;
    setBusy("send");
    setError(null);
    try {
      setConfirmed(await api.sendThankYou(id, note, locale, suggested, choice));
    } catch (cause) {
      if (isUnavailable(cause)) {
        await data.reload();
      }
      if (
        cause instanceof ApiError &&
        [0, 408, 409, 500, 502, 503, 504].includes(cause.status)
      ) {
        try {
          const existing = await findSentNote(api, id);
          if (existing) {
            setConfirmed(existing);
            return;
          }
        } catch {
          setError("send");
        }
      }
      setError("send");
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }

  return (
    <CommunityScreen
      design
      back
      keyboard
      title={saved ? copy.sent : context ? copy.thank(name) : copy.sayThanks}
      subtitle={
        context?.title
          ? (mode === "loan" ? copy.forLoan : copy.forExchange)(context.title)
          : undefined
      }
    >
      <ActivityStatus
        loading={data.loading}
        error={data.error}
        retry={data.reload}
      />
      {data.data?.status === "incomplete" ? (
        <ActivityText>{mode === "loan" ? copy.incomplete : thanks.incomplete}</ActivityText>
      ) : null}
      {data.data?.status === "unavailable" ? (
        <ActivityText>{copy.unavailable}</ActivityText>
      ) : null}
      {context ? (
        saved ? (
          <>
            <NeighbourNotice>
              <ActivityText strong>{copy.to(name)}</ActivityText>
              {saved.note ? <ActivityText>{saved.note}</ActivityText> : null}
              {saved.gift_type === "points" ? (
                <ActivityText>{thanks.points(saved.points_amount ?? THANK_YOU_POINTS)}</ActivityText>
              ) : null}
              {confirmed && choice === "demo" ? <ActivityText>{thanks.demoDone}</ActivityText> : null}
            </NeighbourNotice>
            <Button
              label={copy.viewExchange}
              labelStyle={localizedType("button", locale)}
              onPress={showExchange}
            />
          </>
        ) : (
          <>
            {review ? (
              <NeighbourNotice>
                <ActivityText strong>{copy.privateTo(name)}</ActivityText>
                <ActivityText>{note.trim()}</ActivityText>
                {choice === "points" ? <ActivityText>{thanks.points(THANK_YOU_POINTS)}</ActivityText> : null}
                {choice === "demo" ? (
                  <>
                    <ActivityText strong>{thanks.demoMethod(demoAmount, demoProvider)}</ActivityText>
                    <ActivityText>{thanks.demoDetail}</ActivityText>
                  </>
                ) : null}
              </NeighbourNotice>
            ) : (
              <>
                <View accessibilityRole="radiogroup" style={styles.options}>
                  {options.map(({ value, title, detail }) => (
                    <Pressable
                      key={value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: choice === value, disabled: Boolean(busy) }}
                      accessibilityLabel={`${title}. ${detail}`}
                      disabled={Boolean(busy)}
                      onPress={() => setChoice(value)}
                    >
                      <SelectionCopy title={title} detail={detail} selected={choice === value} />
                    </Pressable>
                  ))}
                </View>
                <Field
                  label={suggested ? copy.suggestedNote : copy.note}
                  labelStyle={[
                    localizedType("field-label", locale),
                    styles.ink,
                  ]}
                  style={[localizedType("body", locale), styles.note]}
                  placeholder={copy.notePlaceholder}
                  multiline
                  maxLength={1000}
                  value={note}
                  onChangeText={setNote}
                  editable={!busy}
                />
                <Button
                  label={suggested ? copy.suggestAnother : copy.suggest}
                  variant="text"
                  labelStyle={localizedType("field-label", locale)}
                  busy={busy === "draft"}
                  onPress={() => {
                    if (!note.trim()) {
                      void suggest();
                      return;
                    }
                    setConfirmation({
                      kind: "replace",
                      proceed: () => void suggest(),
                    });
                  }}
                />
                {suggested && orei ? (
                  <NeighbourNotice>
                    <ActivityText strong>{copy.oreiIdea}</ActivityText>
                    <ActivityText>{orei}</ActivityText>
                  </NeighbourNotice>
                ) : null}
              </>
            )}
            {error ? (
              <ErrorText>
                {error === "draft"
                  ? copy.draftError
                  : activityCopy[locale].actionError}
              </ErrorText>
            ) : null}
            <View style={styles.actions}>
              <Button
                label={review ? (choice === "demo" ? thanks.demoSubmit : copy.send) : copy.review}
                labelStyle={localizedType("button", locale)}
                busy={busy === "send"}
                disabled={
                  busy === "draft" || data.loading || data.error || !note.trim()
                }
                onPress={
                  review
                    ? send
                    : () => {
                        setError(null);
                        setReview(true);
                      }
                }
              />
              <Button
                label={review ? copy.edit : copy.later}
                variant="outline"
                labelStyle={localizedType("button", locale)}
                disabled={Boolean(busy)}
                onPress={
                  review
                    ? () => {
                        setError(null);
                        setReview(false);
                      }
                    : maybeLater
                }
              />
            </View>
          </>
        )
      ) : null}
      {confirmation ? (
        <NeighbourConfirmation
          title={
            confirmation.kind === "discard"
              ? copy.discardDraft
              : copy.replaceDraft
          }
          confirmLabel={
            confirmation.kind === "discard" ? copy.discard : copy.replace
          }
          cancelLabel={copy.keepWriting}
          onConfirm={() => {
            setConfirmation(null);
            confirmation.proceed();
          }}
          onCancel={() => setConfirmation(null)}
        >
          <ActivityText>
            {confirmation.kind === "discard"
              ? copy.discardDetail
              : copy.replaceDetail}
          </ActivityText>
        </NeighbourConfirmation>
      ) : null}
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  note: { minHeight: 104 },
  options: { gap: spacing["card-inset"] },
  ink: { color: colors.ink },
  actions: { gap: spacing["related-gap"] },
});
