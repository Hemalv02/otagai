import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { AssistantSheet } from "@/components/assistant-widgets";
import { RequestNotice } from "@/components/request-notice";
import { Button, ErrorText, Field } from "@/components/ui";
import { ApiError, type Exchange, type Language, request } from "@/lib/api";
import { helpExchangeCopy } from "@/lib/help-exchange-copy";
import {
  helpExchangeStage,
  helpSchedulePatch,
} from "@/lib/help-exchange-state";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, controls, spacing } from "@/theme/tokens.json";

type Action = "save" | "start" | "confirm" | "refresh";
type SchedulePatch = NonNullable<ReturnType<typeof helpSchedulePatch>>;
type PickerMode = "date" | "time";

export function HelpExchangeActions({
  exchange,
  viewerId,
  onReload,
}: {
  exchange: Exchange;
  viewerId: string;
  onReload: () => Promise<unknown>;
}) {
  const localizedType = useLocalizedType();
  const { locale } = useOnboardingText();
  const { session } = useSession();
  const authUserId = session?.user.id;
  const copy = helpExchangeCopy[locale];
  const label = localizedType("field-label", locale);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<Action>();
  const [feedback, setFeedback] = useState<string>();
  const inFlight = useRef(false);
  const stage = helpExchangeStage(exchange, viewerId);
  const otherConfirmed =
    viewerId === exchange.requester_user_id
      ? exchange.helper_confirmed_at
      : exchange.requester_confirmed_at;
  const path = `/exchanges/${encodeURIComponent(exchange.id)}`;
  const canEdit =
    stage === "scheduled" || stage === "confirm" || stage === "waiting";
  const disabled = !authUserId || pending !== undefined;

  async function apply(action: Action, changes?: SchedulePatch) {
    if (inFlight.current || !authUserId) return;
    inFlight.current = true;
    setPending(action);
    setFeedback(undefined);
    try {
      try {
        if (action === "save") {
          await request<Exchange>(path, {
            method: "PATCH",
            body: JSON.stringify(changes),
            authUserId,
          });
          setEditing(false);
        } else if (action === "start" || action === "confirm") {
          const endpoint = action === "start" ? "hand-over" : "confirm";
          await request<Exchange>(`${path}/${endpoint}`, {
            method: "POST",
            authUserId,
          });
        }
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409) {
          setFeedback(copy.actionFailed);
          return;
        }
        setFeedback(copy.changed);
      }
      await onReload();
    } catch {
      setFeedback(copy.refreshFailed);
    } finally {
      inFlight.current = false;
      setPending(undefined);
    }
  }

  return (
    <View style={styles.actions}>
      {canEdit ? (
        <Button
          label={copy.editSchedule}
          labelStyle={label}
          variant="secondary"
          disabled={disabled}
          onPress={() => {
            setFeedback(undefined);
            setEditing(true);
          }}
        />
      ) : null}
      {stage === "scheduled" ? (
        <Button
          label={copy.start}
          labelStyle={label}
          disabled={disabled}
          busy={pending === "start"}
          onPress={() => void apply("start")}
        />
      ) : null}
      {stage === "confirm" ? (
        <>
          {otherConfirmed ? (
            <Text
              style={[localizedType("supporting", locale), styles.secondary]}
            >
              {copy.otherConfirmed}
            </Text>
          ) : null}
          <Button
            label={copy.confirm}
            labelStyle={label}
            disabled={disabled}
            busy={pending === "confirm"}
            onPress={() => void apply("confirm")}
          />
        </>
      ) : null}
      {stage === "waiting" ? (
        <RequestNotice
          title={copy.waiting}
          detail={copy.waitingDetail}
          locale={locale}
        />
      ) : null}
      {stage === "completed" ? (
        <RequestNotice
          title={copy.complete}
          detail={copy.completeDetail}
          locale={locale}
        />
      ) : null}
      {feedback && (!editing || !canEdit) ? (
        <ErrorText>{feedback}</ErrorText>
      ) : null}
      {stage === "waiting" || (feedback && (!editing || !canEdit)) ? (
        <Button
          label={copy.refresh}
          labelStyle={label}
          variant="text"
          disabled={disabled}
          busy={pending === "refresh"}
          onPress={() => void apply("refresh")}
        />
      ) : null}
      {editing && canEdit ? (
        <ScheduleSheet
          key={`${exchange.id}:${viewerId}`}
          exchange={exchange}
          locale={locale}
          busy={disabled}
          feedback={feedback}
          close={() => {
            if (inFlight.current) return;
            setFeedback(undefined);
            setEditing(false);
          }}
          save={(changes) => void apply("save", changes)}
        />
      ) : null}
    </View>
  );
}

const pickerModes = ["date", "time"] as const;
const pad = (value: number) => String(value).padStart(2, "0");
const calendarDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const clockTime = (date: Date) =>
  `${pad(date.getHours())}:${pad(date.getMinutes())}`;

function ScheduleSheet({
  exchange,
  locale,
  busy,
  feedback,
  close,
  save,
}: {
  exchange: Exchange;
  locale: Language;
  busy: boolean;
  feedback?: string;
  close: () => void;
  save: (changes: SchedulePatch) => void;
}) {
  const localizedType = useLocalizedType();
  const copy = helpExchangeCopy[locale];
  const label = localizedType("field-label", locale);
  const [initial] = useState(() => ({
    scheduled_at: exchange.scheduled_at,
    meet_place_note: exchange.meet_place_note,
  }));
  const [place, setPlace] = useState(initial.meet_place_note ?? "");
  const [withTime, setWithTime] = useState(Boolean(initial.scheduled_at));
  const [date, setDate] = useState(() => {
    if (initial.scheduled_at) return new Date(initial.scheduled_at);
    const next = new Date();
    next.setHours(next.getHours() + 1, 0, 0, 0);
    return next;
  });
  const [webDate, setWebDate] = useState(() => calendarDate(date));
  const [webTime, setWebTime] = useState(() => clockTime(date));
  const [changedWebTime, setChangedWebTime] = useState(false);
  const [dialog, setDialog] = useState<PickerMode | null>(null);
  const [checkedAt, setCheckedAt] = useState(() => Date.now());

  const editedOnWeb = Platform.OS === "web" && changedWebTime;
  const parsed = editedOnWeb ? new Date(`${webDate}T${webTime}`) : date;
  const matchesWebInput =
    !editedOnWeb ||
    (calendarDate(parsed) === webDate && clockTime(parsed) === webTime);
  const proposedTime = withTime ? parsed : null;
  const changes = matchesWebInput
    ? helpSchedulePatch(initial, proposedTime, place, checkedAt)
    : null;

  function pick(mode: PickerMode, selected: Date) {
    setDate((current) => {
      const next = new Date(current);
      if (mode === "date") {
        next.setFullYear(
          selected.getFullYear(),
          selected.getMonth(),
          selected.getDate(),
        );
      } else {
        next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      }
      return next;
    });
    setDialog(null);
  }

  function onSave() {
    const now = Date.now();
    const updated = matchesWebInput
      ? helpSchedulePatch(initial, proposedTime, place, now)
      : null;
    if (updated && Object.keys(updated).length) save(updated);
    else setCheckedAt(now);
  }

  return (
    <AssistantSheet
      title={copy.editSchedule}
      locale={locale}
      close={close}
      footer={
        <Button
          label={copy.saveSchedule}
          labelStyle={label}
          busy={busy}
          disabled={!changes || !Object.keys(changes).length}
          onPress={onSave}
        />
      }
    >
      {withTime ? (
        <View style={styles.actions}>
          {pickerModes.map((mode) => (
            <View key={mode} style={styles.timeRow}>
              <Text style={[label, styles.ink]}>{copy[mode]}</Text>
              {Platform.OS === "web" ? (
                <input
                  type={mode}
                  aria-label={copy[mode]}
                  value={mode === "date" ? webDate : webTime}
                  disabled={busy}
                  style={webPickerStyle}
                  onChange={(event) => {
                    if (mode === "date") setWebDate(event.currentTarget.value);
                    else setWebTime(event.currentTarget.value);
                    setChangedWebTime(true);
                    setCheckedAt(Date.now());
                  }}
                />
              ) : Platform.OS === "android" ? (
                <Button
                  variant="secondary"
                  labelStyle={label}
                  disabled={busy}
                  label={new Intl.DateTimeFormat(
                    locale,
                    mode === "date"
                      ? { dateStyle: "medium" }
                      : { timeStyle: "short" },
                  ).format(date)}
                  onPress={() => setDialog(mode)}
                />
              ) : (
                <DateTimePicker
                  value={date}
                  mode={mode}
                  locale={locale}
                  display="compact"
                  accentColor={colors.action}
                  disabled={busy}
                  onValueChange={(_, selected) => pick(mode, selected)}
                />
              )}
            </View>
          ))}
          {dialog ? (
            <DateTimePicker
              mode={dialog}
              value={date}
              presentation="dialog"
              onDismiss={() => setDialog(null)}
              onValueChange={(_, selected) => pick(dialog, selected)}
            />
          ) : null}
        </View>
      ) : (
        <Button
          label={copy.setTime}
          labelStyle={label}
          variant="text"
          disabled={busy}
          onPress={() => setWithTime(true)}
        />
      )}
      <Field
        label={copy.place}
        labelStyle={label}
        style={localizedType("body", locale)}
        value={place}
        onChangeText={setPlace}
        maxLength={200}
        editable={!busy}
      />
      {!changes || feedback ? (
        <ErrorText>{changes ? feedback : copy.invalidTime}</ErrorText>
      ) : null}
    </AssistantSheet>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing["related-gap"] },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing["control-gap"],
    flexWrap: "wrap",
  },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
});

const webPickerStyle = {
  minHeight: controls["touch-target"],
  border: `1px solid ${colors.rule}`,
  borderRadius: controls.radius,
  paddingInline: spacing["control-gap"],
  color: colors.ink,
  backgroundColor: colors.canvas,
  font: "inherit",
};
