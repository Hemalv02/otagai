import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { type ReactNode, useCallback, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { CommunityScreen } from "@/components/community-screen";
import { ActivityStatus, ActivityText } from "@/components/activity-ui";
import { Button, ErrorText, Field } from "@/components/ui";
import { ApiError, api, type Exchange, type LoanExtension } from "@/lib/api";
import {
  activityCopy,
  extensionDate,
  formatActivityDate,
  localDateInput,
} from "@/lib/activity-copy";
import {
  activityDay,
  activityAppointment,
  activityScreenCopy,
  activityTime,
} from "@/lib/activity-screen-copy";
import { useCurrentTime, useLiveResource } from "@/lib/live-resource";
import { partnerFor } from "@/lib/neighbour-api";
import { neighbourCopy } from "@/lib/neighbour-copy";
import { exchangeMessageCopy } from "@/lib/exchange-message-copy";
import { loanStage } from "@/lib/loan-state";
import { livePickupCopy } from "@/lib/live-pickup";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, controls, spacing } from "@/theme/tokens.json";

async function visible<T>(load: Promise<T>): Promise<T | null> {
  try {
    return await load;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

async function loadLoan(id: string, profileId: string | null) {
  const exchange = await api.getExchange(id);
  if (exchange.mode !== "loan") throw new ApiError(404, "Loan unavailable.");
  const other =
    exchange.requester_user_id === profileId
      ? exchange.helper_user_id
      : exchange.requester_user_id;
  const [listing, partner] = await Promise.all([
    exchange.listing_id ? visible(api.getListing(exchange.listing_id)) : null,
    visible(api.getPublicProfile(other)),
  ]);
  const history: LoanExtension[] = [];
  let cursor: string | null = null;
  do {
    const page = await api.listExtensions(id, cursor);
    history.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor);
  return {
    exchange,
    history,
    title: listing?.title ?? null,
    photo:
      listing?.photos[0]?.thumb_url ?? listing?.photos[0]?.display_url ?? null,
    partnerName:
      partner?.display_name ??
      (exchange.requester_user_id === profileId
        ? listing?.owner?.display_name
        : null) ??
      null,
  };
}

type ExtensionRequest = { new_due_at: string; message?: string };
type ExchangeAction = Parameters<typeof api.advanceLoan>[1];
type LoanAction =
  | { decision: "accept" | "decline" }
  | { request: ExtensionRequest }
  | { advance: ExchangeAction };

export default function LoanDetailsScreen() {
  const localizedType = useLocalizedType();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { locale } = useOnboardingText();
  const { profile } = useSession();
  const profileId = profile.status === "ready" ? profile.profile.id : null;
  const copy = activityCopy[locale];
  const screen = activityScreenCopy[locale];
  const loan = useLiveResource(
    useCallback(() => loadLoan(id, profileId), [id, profileId]),
  );
  const now = useCurrentTime();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { exchange, history = [], title, photo, partnerName } = loan.data ?? {};
  const borrower = profileId === exchange?.requester_user_id;
  const lender = profileId === exchange?.helper_user_id;
  const pending = history.find((item) => item.status === "pending");
  const overdue = exchange?.due_at && new Date(exchange.due_at).getTime() < now;
  const stage = exchange && loanStage(exchange, profileId);
  const partnerId =
    exchange && profileId ? partnerFor(exchange, profileId) : null;
  const neighbour = neighbourCopy[locale];
  const active = stage === "return";
  const progression = {
    return: { label: screen.recordReturn, advance: "return" },
    confirm: { label: screen.confirmReturn, advance: "confirm" },
  } as const;
  const next =
    stage === "return" || stage === "confirm" ? progression[stage] : null;
  const itemName = title || copy.unnamedLoan;
  const messageAction = (
    <Button
      label={exchangeMessageCopy[locale].messagePartner(
        partnerName || exchangeMessageCopy[locale].neighbour,
      )}
      variant="text"
      labelStyle={localizedType("field-label", locale)}
      disabled={busy || loan.loading || loan.error}
      onPress={() =>
        router.push({ pathname: "/loans/[id]/messages", params: { id } })
      }
    />
  );
  const heading =
    stage === "completed"
      ? screen.completed
      : stage === "pickup"
        ? screen.pickupPlanned
        : exchange?.returned_at
          ? screen.returned
          : active && exchange?.due_at
            ? borrower
              ? screen.returnTitle(
                  itemName,
                  activityDay(exchange.due_at, locale, true),
                )
              : screen.lenderTitle(activityDay(exchange.due_at, locale, true))
            : copy.loan;
  const relationship = partnerName
    ? borrower
      ? screen.borrowedFrom(partnerName)
      : screen.lentTo(partnerName)
    : borrower
      ? copy.borrowed
      : copy.lent;

  async function act(action: LoanAction) {
    if (!exchange || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if ("decision" in action && pending)
        await api.decideExtension(pending.id, action.decision);
      else if ("request" in action)
        await api.requestExtension(exchange.id, action.request);
      else if ("advance" in action)
        await api.advanceLoan(exchange.id, action.advance);
      await loan.reload();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        const latest = await loan.reload();
        if (latest) {
          setNotice(copy.conflict);
        }
      } else setError(copy.actionError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <CommunityScreen
      design
      back
      keyboard
      title={heading}
      subtitle={exchange ? `${itemName} · ${relationship}` : undefined}
    >
      <ActivityStatus
        loading={loan.loading}
        error={loan.error}
        retry={loan.reload}
      />
      {loan.error && !exchange ? (
        <ActivityText>{copy.unavailable}</ActivityText>
      ) : null}
      {exchange ? (
        <>
          <View style={styles.returnRow}>
            <LoanThumbnail key={photo ?? "none"} photo={photo ?? null} />
            <View style={[styles.rowCopy, styles.returnCopy]}>
              <ActivityText strong>
                {stage === "pickup"
                  ? copy.pickup
                  : exchange.returned_at
                    ? screen.returned
                    : exchange.due_at
                      ? screen.returnBy(
                          activityTime(new Date(exchange.due_at), locale),
                        )
                      : copy.due}
              </ActivityText>
              <ActivityText>
                {[
                  formatActivityDate(
                    exchange.returned_at ??
                      (stage === "pickup"
                        ? exchange.scheduled_at
                        : exchange.due_at),
                    locale,
                  ),
                  exchange.meet_place_note,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </ActivityText>
            </View>
            <Text style={[localizedType("supporting", locale), styles.status]}>
              {stage === "pickup"
                ? screen.pickupPlanned
                : stage === "completed"
                  ? screen.completed
                  : exchange.returned_at
                    ? screen.returned
                    : overdue
                      ? screen.overdue
                      : screen.due}
            </Text>
          </View>
          {notice ? <ActivityText>{notice}</ActivityText> : null}
          {error ? <ErrorText>{error}</ErrorText> : null}
          {stage === "pickup" || exchange.handed_over_at ? (
            <Button
              label={livePickupCopy[locale].title}
              variant={stage === "pickup" ? "primary" : "secondary"}
              labelStyle={localizedType("button", locale)}
              disabled={loan.loading || loan.error}
              onPress={() =>
                router.push({ pathname: "/loans/[id]/pickup", params: { id } })
              }
            />
          ) : null}
          {next ? (
            <Button
              label={next.label}
              labelStyle={localizedType("button", locale)}
              busy={busy}
              disabled={loan.loading || loan.error}
              onPress={() => act({ advance: next.advance })}
            />
          ) : stage === "waiting" || stage === "closed" ? (
            <ActivityText>
              {stage === "waiting"
                ? screen.waitingForReturn
                : copy.noLongerActive}
            </ActivityText>
          ) : null}
          <View style={styles.progress}>
            <ProgressStep
              filled={Boolean(exchange.handed_over_at)}
              title={
                exchange.handed_over_at ? screen.pickedUp : screen.pickupPlanned
              }
              detail={formatActivityDate(
                exchange.handed_over_at ?? exchange.scheduled_at,
                locale,
              )}
            />
            <ProgressStep
              filled={Boolean(exchange.returned_at ?? exchange.due_at)}
              title={
                exchange.returned_at ? screen.returned : screen.returnPlanned
              }
              detail={formatActivityDate(
                exchange.returned_at ?? exchange.due_at,
                locale,
              )}
            />
          </View>
          {active && overdue ? (
            <ActivityText>
              {borrower ? copy.overdue : copy.lenderOverdue}
            </ActivityText>
          ) : null}
          {borrower && !pending && active ? (
            <ExtensionDraft
              key={`${exchange.id}:${exchange.due_at}:${locale}`}
              exchange={exchange}
              itemName={itemName}
              partnerName={partnerName ?? null}
              now={now}
              busy={busy}
              disabled={loan.loading || loan.error}
              onSend={(request) => act({ request })}
              messageAction={messageAction}
            />
          ) : (
            messageAction
          )}
          {history.length ? (
            <View style={styles.history}>
              <Text
                accessibilityRole="header"
                style={[localizedType("section-heading", locale), styles.ink]}
              >
                {copy.history}
              </Text>
              {history.map((item) => (
                <View key={item.id} style={styles.historyRow}>
                  <ActivityText strong>
                    {item.status === "pending" && !active
                      ? screen.extensionClosed
                      : copy[item.status]}
                  </ActivityText>
                  <ActivityText>
                    {copy.due}: {formatActivityDate(item.new_due_at, locale)}
                  </ActivityText>
                  {item.message ? (
                    <ActivityText>{item.message}</ActivityText>
                  ) : null}
                  <ActivityText>
                    {formatActivityDate(
                      item.decided_at ?? item.created_at,
                      locale,
                    )}
                  </ActivityText>
                  {item.status === "pending" && lender && active ? (
                    <>
                      {new Date(item.new_due_at).getTime() <=
                      Math.max(
                        now,
                        exchange.due_at
                          ? new Date(exchange.due_at).getTime()
                          : 0,
                      ) ? (
                        <ActivityText>{screen.extensionOutdated}</ActivityText>
                      ) : (
                        <Button
                          label={copy.accept}
                          labelStyle={localizedType("button", locale)}
                          busy={busy}
                          disabled={loan.loading || loan.error}
                          onPress={() => act({ decision: "accept" })}
                        />
                      )}
                      <Button
                        label={copy.decline}
                        labelStyle={localizedType("button", locale)}
                        variant="secondary"
                        disabled={busy || loan.loading || loan.error}
                        onPress={() => act({ decision: "decline" })}
                      />
                    </>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
          {stage === "waiting" || history.length ? (
            <Button
              variant="text"
              label={copy.refresh}
              labelStyle={localizedType("field-label", locale)}
              disabled={busy || loan.loading}
              onPress={loan.reload}
            />
          ) : null}
          {stage === "completed" ? (
            <Button
              label={neighbour.sayThanks}
              labelStyle={localizedType("button", locale)}
              onPress={() =>
                router.push({
                  pathname: "/loans/[id]/thank-you",
                  params: { id },
                })
              }
            />
          ) : null}
          {partnerId ? (
            <Button
              label={neighbour.reportOrBlock}
              variant="text"
              labelStyle={localizedType("field-label", locale)}
              onPress={() =>
                router.push({
                  pathname: "/report-or-block",
                  params: {
                    targetType: "user",
                    targetId: partnerId,
                    loanId: id,
                  },
                })
              }
            />
          ) : null}
        </>
      ) : null}
    </CommunityScreen>
  );
}

function LoanThumbnail({ photo }: { photo: string | null }) {
  const [failed, setFailed] = useState(false);
  return photo && !failed ? (
    <Image
      source={photo}
      style={styles.thumbnail}
      contentFit="cover"
      accessible={false}
      onError={() => setFailed(true)}
    />
  ) : (
    <View style={[styles.thumbnail, styles.placeholder]} accessible={false}>
      <Text style={styles.placeholderText}>—</Text>
    </View>
  );
}

function ProgressStep({
  title,
  detail,
  filled,
}: {
  title: string;
  detail: string;
  filled: boolean;
}) {
  return (
    <View style={styles.step}>
      {filled ? (
        <Image
          source={require("../../../../assets/images/activity/progress-dot.svg")}
          style={styles.dot}
          accessible={false}
        />
      ) : (
        <View style={styles.dotOutline} />
      )}
      <View style={styles.rowCopy}>
        <ActivityText strong>{title}</ActivityText>
        <ActivityText>{detail}</ActivityText>
      </View>
    </View>
  );
}

function ExtensionDraft({
  exchange,
  itemName,
  partnerName,
  now,
  busy,
  disabled,
  onSend,
  messageAction,
}: {
  exchange: Exchange;
  itemName: string;
  partnerName: string | null;
  now: number;
  busy: boolean;
  disabled: boolean;
  onSend: (request: ExtensionRequest) => void;
  messageAction: ReactNode;
}) {
  const localizedType = useLocalizedType();
  const { locale } = useOnboardingText();
  const copy = activityCopy[locale];
  const screen = activityScreenCopy[locale];
  const [date, setDate] = useState(() => {
    const next = new Date(
      Math.max(now, exchange.due_at ? new Date(exchange.due_at).getTime() : 0),
    );
    next.setDate(next.getDate() + 1);
    return localDateInput(next);
  });
  const [expanded, setExpanded] = useState(false);
  const [editedMessage, setEditedMessage] = useState<string | null>(null);
  const [messageHeight, setMessageHeight] = useState(112);
  const [invalid, setInvalid] = useState(false);
  const reference = new Date(exchange.due_at ?? now);
  const selected = extensionDate(date, reference);
  const draft = selected
    ? screen.draft(
        partnerName,
        itemName,
        activityAppointment(selected.toISOString(), locale),
        exchange.due_at ? activityDay(exchange.due_at, locale, true) : null,
      )
    : "";
  const message = editedMessage ?? draft;
  return (
    <View style={styles.extension}>
      <Text
        accessibilityRole="header"
        style={[localizedType("section-heading", locale), styles.ink]}
      >
        {screen.needTime}
      </Text>
      <View style={styles.draft}>
        <Text style={[localizedType("field-label", locale), styles.ink]}>
          {screen.suggested}
        </Text>
        <TextInput
          accessibilityLabel={copy.message}
          value={message}
          onChangeText={setEditedMessage}
          multiline
          maxLength={1000}
          editable={!busy}
          underlineColorAndroid="transparent"
          scrollEnabled={false}
          onContentSizeChange={(event) =>
            setMessageHeight(Math.max(84, event.nativeEvent.contentSize.height))
          }
          style={[
            localizedType("body", locale),
            styles.draftInput,
            { height: messageHeight },
          ]}
        />
      </View>
      {expanded ? (
        <View style={styles.extension}>
          <Field
            label={copy.newDate}
            labelStyle={localizedType("field-label", locale)}
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
          {invalid ? <ErrorText>{copy.invalidDate}</ErrorText> : null}
          <Button
            label={copy.send}
            labelStyle={localizedType("button", locale)}
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
          <Button
            label={screen.closeDate}
            variant="text"
            labelStyle={localizedType("field-label", locale)}
            disabled={busy}
            onPress={() => setExpanded(false)}
          />
        </View>
      ) : (
        <View>
          <Button
            label={screen.askOneDay}
            variant="text"
            labelStyle={localizedType("field-label", locale)}
            disabled={busy || disabled}
            onPress={() => setExpanded(true)}
          />
          {messageAction}
        </View>
      )}
      {expanded ? messageAction : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ink: { color: colors.ink },
  returnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["control-gap"],
    minHeight: 54,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: controls.radius,
    backgroundColor: colors.paper,
  },
  placeholder: { justifyContent: "center", alignItems: "center" },
  placeholderText: { color: colors.control, fontSize: 20 },
  rowCopy: { flex: 1, gap: 1 },
  returnCopy: { gap: 0, paddingTop: 4, paddingBottom: 5 },
  status: {
    color: colors.action,
    textAlign: "right",
    width: 92,
    flexShrink: 1,
  },
  progress: { gap: spacing["related-gap"] },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["control-gap"],
  },
  dot: { width: 12, height: 12 },
  dotOutline: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.action,
  },
  extension: { gap: spacing["card-inset"] },
  draft: {
    borderLeftWidth: 2,
    borderLeftColor: colors.clay,
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: 2,
    gap: 4,
  },
  draftInput: {
    color: colors.ink,
    minHeight: 112,
    padding: 0,
    textAlignVertical: "top",
  },
  history: { gap: spacing["related-gap"] },
  historyRow: {
    borderTopWidth: 1,
    borderTopColor: colors.rule,
    paddingTop: spacing["card-inset"],
    gap: spacing["related-gap"],
  },
});
