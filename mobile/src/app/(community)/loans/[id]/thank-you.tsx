import { router, useLocalSearchParams, usePreventRemove } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ActivityStatus, ActivityText } from "@/components/activity-ui";
import { CommunityScreen } from "@/components/community-screen";
import {
  NeighbourConfirmation,
  NeighbourNotice,
  SelectionCopy,
} from "@/components/neighbour-ui";
import { Button, ErrorText, Field } from "@/components/ui";
import { activityCopy } from "@/lib/activity-copy";
import { ApiError } from "@/lib/api";
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
import { colors, spacing } from "@/theme/tokens.json";

export default function LoanThankYouScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile } = useSession();
  const member = profile.status === "ready" ? profile.profile : null;
  return (
    <LoanThankYou
      key={`${session?.user.id}:${id}`}
      id={id}
      authUserId={session?.user.id ?? ""}
      profileId={member?.id ?? ""}
      culturePack={member?.region === "bd" ? "bangladesh" : "japan"}
    />
  );
}

function LoanThankYou({
  id,
  authUserId,
  profileId,
  culturePack,
}: {
  id: string;
  authUserId: string;
  profileId: string;
  culturePack: "japan" | "bangladesh";
}) {
  const localizedType = useLocalizedType();
  const { locale } = useOnboardingText();
  const copy = neighbourCopy[locale];
  const api = useMemo(() => neighbourApi(authUserId), [authUserId]);
  const data = useLiveResource(
    useCallback(async () => {
      if (!authUserId || !profileId || !isUuid(id))
        return { status: "unavailable" } as const;
      try {
        const exchange = await api.exchange(id);
        const partnerId = partnerFor(exchange, profileId);
        if (exchange.mode !== "loan" || !partnerId)
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
          borrower: exchange.requester_user_id === profileId,
        } as const;
      } catch (error) {
        if (isUnavailable(error)) return { status: "unavailable" } as const;
        throw error;
      }
    }, [api, authUserId, id, profileId]),
  );
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
  const exchangeName = context?.title ?? copy.loan;
  const showLoan = () =>
    router.navigate({ pathname: "/loans/[id]", params: { id } });
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
      showLoan();
      return;
    }
    setConfirmation({
      kind: "discard",
      proceed: () => {
        setNote("");
        allowLeave();
        showLoan();
      },
    });
  }

  async function suggest() {
    if (!context || lock.current) return;
    lock.current = true;
    setBusy("draft");
    setError(null);
    try {
      const helpedWith = context.borrower
        ? `Lent me: ${exchangeName}`
        : `Borrowed and returned: ${exchangeName}`;
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
      setConfirmed(await api.sendThankYou(id, note.trim(), locale, suggested));
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
      subtitle={context?.title ? copy.forLoan(context.title) : undefined}
    >
      <ActivityStatus
        loading={data.loading}
        error={data.error}
        retry={data.reload}
      />
      {data.data?.status === "incomplete" ? (
        <ActivityText>{copy.incomplete}</ActivityText>
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
            </NeighbourNotice>
            <Button
              label={copy.viewExchange}
              labelStyle={localizedType("button", locale)}
              onPress={showLoan}
            />
          </>
        ) : (
          <>
            {review ? (
              <NeighbourNotice>
                <ActivityText strong>{copy.privateTo(name)}</ActivityText>
                <ActivityText>{note.trim()}</ActivityText>
              </NeighbourNotice>
            ) : (
              <>
                <View accessibilityRole="radiogroup" style={styles.options}>
                  <View
                    accessible
                    accessibilityRole="radio"
                    aria-checked
                    accessibilityState={{ checked: true }}
                    accessibilityLabel={`${copy.sendNote}. ${copy.privateTo(name)}`}
                  >
                    <SelectionCopy
                      title={copy.sendNote}
                      detail={copy.privateTo(name)}
                      selected
                    />
                  </View>
                  {[
                    [copy.smallGift, copy.giftUnavailable],
                    [copy.smallOrei, copy.paymentUnavailable],
                  ].map(([title, detail]) => (
                    <View
                      key={title}
                      accessible
                      accessibilityRole="radio"
                      aria-checked={false}
                      aria-disabled
                      accessibilityState={{ checked: false, disabled: true }}
                      accessibilityLabel={`${title}. ${detail}`}
                    >
                      <SelectionCopy
                        title={title}
                        detail={detail}
                        selected={false}
                        unavailable
                      />
                    </View>
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
                label={review ? copy.send : copy.review}
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
