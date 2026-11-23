import { useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { CommunityScreen } from "@/components/community-screen";
import {
  ActivityStatus,
  ActivityText,
  activityStyles as styles,
} from "@/components/activity-ui";
import { Button, ErrorText, Field } from "@/components/ui";
import { ApiError, api, type Exchange, type LoanExtension } from "@/lib/api";
import {
  activityCopy,
  extensionDate,
  formatActivityDate,
  localDateInput,
} from "@/lib/activity-copy";
import { useCurrentTime, useLiveResource } from "@/lib/live-resource";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";

async function loadLoan(id: string) {
  const exchange = await api.getExchange(id);
  if (exchange.mode !== "loan") throw new ApiError(404, "Loan unavailable.");
  const history: LoanExtension[] = [];
  let cursor: string | null = null;
  do {
    const page = await api.listExtensions(id, cursor);
    history.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor);
  let title: string | null = null;
  if (exchange.listing_id) {
    try {
      title = (await api.getListing(exchange.listing_id)).title;
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error;
    }
  }
  return { exchange, history, title };
}

export default function LoanDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { locale } = useOnboardingText();
  const { profile } = useSession();
  const copy = activityCopy[locale];
  const loan = useLiveResource(useCallback(() => loadLoan(id), [id]));
  const now = useCurrentTime();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { exchange, history = [], title } = loan.data ?? {};
  const borrower =
    profile.status === "ready" &&
    profile.profile.id === exchange?.requester_user_id;
  const lender =
    profile.status === "ready" &&
    profile.profile.id === exchange?.helper_user_id;
  const pending = history.find((item) => item.status === "pending");

  async function act(
    decision?: "accept" | "decline",
    request?: { new_due_at: string; message?: string },
  ) {
    if (!exchange || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (decision && pending) await api.decideExtension(pending.id, decision);
      else if (request) await api.requestExtension(exchange.id, request);
      await loan.reload();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        const latest = await loan.reload();
        if (latest) setNotice(copy.conflict);
      } else setError(copy.actionError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <CommunityScreen live back keyboard title={title || copy.loan}>
      <ActivityStatus
        loading={loan.loading}
        error={loan.error}
        retry={loan.reload}
      />
      {loan.error && !loan.data ? (
        <ActivityText>{copy.unavailable}</ActivityText>
      ) : null}
      {exchange ? (
        <>
          <ActivityText>{borrower ? copy.borrowed : copy.lent}</ActivityText>
          <View style={styles.dueCard}>
            <ActivityText>{copy.due}</ActivityText>
            <Text
              style={[localizedType("section-heading", locale), styles.ink]}
            >
              {formatActivityDate(exchange.due_at, locale)}
            </Text>
            {exchange.status === "active" &&
            exchange.due_at &&
            new Date(exchange.due_at).getTime() < now ? (
              <ActivityText>
                {borrower ? copy.overdue : copy.lenderOverdue}
              </ActivityText>
            ) : null}
          </View>
          <View style={styles.section}>
            <ActivityText strong>{copy.pickup}</ActivityText>
            <ActivityText>
              {formatActivityDate(
                exchange.handed_over_at ?? exchange.scheduled_at,
                locale,
              )}
            </ActivityText>
            <ActivityText strong>{copy.place}</ActivityText>
            <ActivityText>
              {exchange.meet_place_note || copy.noDate}
            </ActivityText>
          </View>
          {exchange.status !== "active" ? (
            <ActivityText>{copy.noLongerActive}</ActivityText>
          ) : null}
          {borrower && !pending && exchange.status === "active" ? (
            <ExtensionDraft
              key={`${exchange.id}:${exchange.due_at}:${locale}`}
              exchange={exchange}
              now={now}
              busy={busy}
              disabled={loan.loading || loan.error}
              onSend={(request) => act(undefined, request)}
            />
          ) : null}
          {notice ? <ActivityText>{notice}</ActivityText> : null}
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Text
            accessibilityRole="header"
            style={[localizedType("section-heading", locale), styles.ink]}
          >
            {copy.history}
          </Text>
          {!history.length ? (
            <ActivityText>{copy.noHistory}</ActivityText>
          ) : null}
          {history.map((item) => (
            <View key={item.id} style={styles.card}>
              <ActivityText strong>{copy[item.status]}</ActivityText>
              <ActivityText>
                {copy.due}: {formatActivityDate(item.new_due_at, locale)}
              </ActivityText>
              {item.message ? (
                <ActivityText>{item.message}</ActivityText>
              ) : null}
              <ActivityText>
                {formatActivityDate(item.decided_at ?? item.created_at, locale)}
              </ActivityText>
              {item.status === "pending" &&
              lender &&
              exchange.status === "active" ? (
                <>
                  <Button
                    label={copy.accept}
                    busy={busy}
                    disabled={loan.loading || loan.error}
                    onPress={() => act("accept")}
                  />
                  <Button
                    label={copy.decline}
                    variant="secondary"
                    disabled={busy || loan.loading || loan.error}
                    onPress={() => act("decline")}
                  />
                </>
              ) : null}
            </View>
          ))}
          <Button
            variant="text"
            label={copy.refresh}
            disabled={busy || loan.loading}
            onPress={loan.reload}
          />
        </>
      ) : null}
    </CommunityScreen>
  );
}

function ExtensionDraft({
  exchange,
  now,
  busy,
  disabled,
  onSend,
}: {
  exchange: Exchange;
  now: number;
  busy: boolean;
  disabled: boolean;
  onSend: (request: { new_due_at: string; message?: string }) => void;
}) {
  const { locale } = useOnboardingText();
  const copy = activityCopy[locale];
  const [date, setDate] = useState(() => {
    const next = new Date(
      Math.max(now, exchange.due_at ? new Date(exchange.due_at).getTime() : 0),
    );
    next.setDate(next.getDate() + 1);
    return localDateInput(next);
  });
  const [editedMessage, setEditedMessage] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const reference = new Date(exchange.due_at ?? now);
  const selected = extensionDate(date, reference);
  const draft = selected
    ? copy.draft(
        exchange.due_at ? formatActivityDate(exchange.due_at, locale) : "",
        formatActivityDate(selected.toISOString(), locale),
      )
    : "";
  const message = editedMessage ?? draft;
  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        style={[localizedType("section-heading", locale), styles.ink]}
      >
        {copy.extend}
      </Text>
      <Field
        label={copy.newDate}
        value={date}
        onChangeText={(value) => {
          setDate(value);
          setInvalid(false);
        }}
        placeholder="YYYY-MM-DD"
        maxLength={10}
        autoCapitalize="none"
        editable={!busy}
      />
      <ActivityText>{copy.dateHelp}</ActivityText>
      {selected ? (
        <ActivityText>
          {formatActivityDate(selected.toISOString(), locale)}
        </ActivityText>
      ) : null}
      <Button
        label={copy.nextDay}
        variant="text"
        disabled={busy}
        onPress={() => {
          const next = selected ?? new Date(Math.max(now, reference.getTime()));
          next.setDate(next.getDate() + 1);
          setDate(localDateInput(next));
          setInvalid(false);
        }}
      />
      <Field
        label={copy.message}
        value={message}
        onChangeText={setEditedMessage}
        multiline
        maxLength={1000}
        editable={!busy}
        style={localizedType("body", locale)}
      />
      {invalid ? <ErrorText>{copy.invalidDate}</ErrorText> : null}
      <Button
        label={copy.send}
        busy={busy}
        disabled={disabled}
        onPress={() => {
          if (
            !selected ||
            selected.getTime() <= Math.max(Date.now(), reference.getTime())
          ) {
            setInvalid(true);
            return;
          }
          onSend({
            new_due_at: selected.toISOString(),
            ...(message.trim() ? { message: message.trim() } : {}),
          });
        }}
      />
    </View>
  );
}
