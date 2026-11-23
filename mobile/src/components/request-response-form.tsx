import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { AssistantSheet } from "@/components/assistant-widgets";
import { Button, ErrorText, Field } from "@/components/ui";
import type { Language } from "@/lib/api";
import { liveRequestCopy } from "@/lib/live-request-copy";
import { localizedType } from "@/lib/onboarding-i18n";
import type { ResponseKind, SendResponse } from "@/lib/requests-api";
import { colors } from "@/theme/tokens.json";

const modes = ["date", "time"] as const;
const dateLabels = { date: "day", time: "time" } as const;
const pad = (part: number) => String(part).padStart(2, "0");
const calendarDate = (value: Date) =>
  `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
const clockTime = (value: Date) =>
  `${pad(value.getHours())}:${pad(value.getMinutes())}`;

export function RequestResponseForm({
  locale,
  kind,
  close,
  send,
  busy,
  error,
}: {
  locale: Language;
  kind: ResponseKind;
  close: () => void;
  send: (response: SendResponse) => void;
  busy: boolean;
  error?: string;
}) {
  const live = liveRequestCopy[locale];
  const label = localizedType("field-label", locale);
  const [note, setNote] = useState("");
  const [minimumDate] = useState(() => new Date());
  const [timeExpired, setTimeExpired] = useState(false);
  const [date, setDate] = useState(() => {
    const next = new Date();
    next.setHours(next.getHours() + 2, 0, 0, 0);
    return next;
  });
  const [dialog, setDialog] = useState<(typeof modes)[number] | null>(null);
  const [webDate, setWebDate] = useState(() => calendarDate(date));
  const [webTime, setWebTime] = useState(() => clockTime(date));
  const counter = kind === "counter_time";
  const proposed =
    Platform.OS === "web" ? new Date(`${webDate}T${webTime}`) : date;
  const invalid = counter && (!(proposed > minimumDate) || timeExpired);

  function pick(mode: (typeof modes)[number], selected: Date) {
    setTimeExpired(false);
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

  return (
    <AssistantSheet
      title={live[kind]}
      locale={locale}
      close={close}
      footer={
        <Button
          label={live.send}
          labelStyle={label}
          busy={busy}
          disabled={invalid || (kind === "question" && !note.trim())}
          onPress={() => {
            if (counter && !(proposed.getTime() > Date.now())) {
              setTimeExpired(true);
              return;
            }
            send({
              kind,
              lang: locale,
              ...(note.trim() ? { message: note.trim() } : {}),
              ...(counter ? { proposed_start: proposed.toISOString() } : {}),
            });
          }}
        />
      }
    >
      {counter ? (
        <View style={styles.pickers}>
          {modes.map((mode) => (
            <View key={mode} style={styles.picker}>
              <Text style={[label, styles.ink]}>{live[dateLabels[mode]]}</Text>
              {Platform.OS === "web" ? (
                <input
                  type={mode}
                  aria-label={live[dateLabels[mode]]}
                  min={mode === "date" ? calendarDate(minimumDate) : undefined}
                  value={mode === "date" ? webDate : webTime}
                  disabled={busy}
                  style={webPickerStyle}
                  onChange={(event) => {
                    setTimeExpired(false);
                    if (mode === "date") setWebDate(event.currentTarget.value);
                    else setWebTime(event.currentTarget.value);
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
                  mode={mode}
                  display="compact"
                  value={date}
                  locale={locale}
                  accentColor={colors.action}
                  disabled={busy}
                  minimumDate={mode === "date" ? minimumDate : undefined}
                  onValueChange={(_, selected) => pick(mode, selected)}
                />
              )}
            </View>
          ))}
          {dialog ? (
            <DateTimePicker
              mode={dialog}
              value={date}
              accentColor={colors.action}
              minimumDate={dialog === "date" ? minimumDate : undefined}
              onDismiss={() => setDialog(null)}
              onValueChange={(_, selected) => pick(dialog, selected)}
            />
          ) : null}
        </View>
      ) : null}
      <Field
        label={kind === "question" ? live.note : live.optionalNote}
        labelStyle={label}
        style={localizedType("body", locale)}
        value={note}
        onChangeText={setNote}
        multiline
        numberOfLines={3}
        maxLength={2000}
        editable={!busy}
      />
      {invalid || error ? (
        <ErrorText>{invalid ? live.invalidTime : error}</ErrorText>
      ) : null}
    </AssistantSheet>
  );
}

const styles = StyleSheet.create({
  pickers: { gap: 10 },
  picker: { gap: 6 },
  ink: { color: colors.ink },
});

const webPickerStyle = {
  minHeight: 44,
  border: `1px solid ${colors.rule}`,
  borderRadius: 8,
  paddingInline: 12,
  color: colors.ink,
  backgroundColor: colors.canvas,
  font: "inherit",
};
