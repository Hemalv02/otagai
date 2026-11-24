import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { AssistantSheet } from "@/components/assistant-widgets";
import { Button, ErrorText, Field } from "@/components/ui";
import type { Language } from "@/lib/api";
import { liveRequestCopy } from "@/lib/live-request-copy";
import { useLocalizedType } from "@/lib/onboarding-i18n";
import {
  buildTimingUpdate,
  buildWordingUpdate,
  localTimeInput,
  timingFields,
  type RequestTimeInput,
  type RequestTimingDraft,
} from "@/lib/request-edit";
import type { RequestDetail, UpdateRequest } from "@/lib/requests-api";
import { colors, controls, spacing } from "@/theme/tokens.json";

export type RequestEditKind = "wording" | "timing";

export function RequestEditForm({
  kind,
  locale,
  detail,
  busy,
  error,
  close,
  save,
}: {
  kind: RequestEditKind;
  locale: Language;
  detail: RequestDetail;
  busy: boolean;
  error?: string;
  close: () => void;
  save: (changes: UpdateRequest) => void;
}) {
  const localizedType = useLocalizedType();
  const copy = liveRequestCopy[locale];
  const label = localizedType("field-label", locale);
  const [original] = useState(detail);
  const [wording, setWording] = useState(original.polite_text);
  const [timing, setTiming] = useState<RequestTimingDraft>({});
  const [checkedAt, setCheckedAt] = useState(() => Date.now());

  const wordingUpdate = buildWordingUpdate(original.polite_text, wording);
  const timingUpdate = buildTimingUpdate(original, timing, checkedAt);
  const wordingError = wording.trim() ? undefined : copy.wordingRequired;
  const timingError =
    "error" in timingUpdate ? copy[timingUpdate.error] : undefined;
  const validation = kind === "wording" ? wordingError : timingError;
  const timingChanged =
    "changes" in timingUpdate && Object.keys(timingUpdate.changes).length > 0;
  const changed = kind === "wording" ? wordingUpdate !== null : timingChanged;

  function submit() {
    if (kind === "wording") {
      if (wordingUpdate) save(wordingUpdate);
      return;
    }
    const now = Date.now();
    setCheckedAt(now);
    const result = buildTimingUpdate(original, timing, now);
    if ("changes" in result && Object.keys(result.changes).length > 0) {
      save(result.changes);
    }
  }

  return (
    <AssistantSheet
      title={kind === "wording" ? copy.editWording : copy.editTiming}
      locale={locale}
      close={close}
      footer={
        <Button
          label={copy.saveChanges}
          labelStyle={label}
          busy={busy}
          disabled={!changed}
          onPress={submit}
        />
      }
    >
      {kind === "wording" ? (
        <Field
          label={copy.wording}
          labelStyle={label}
          style={localizedType("body", locale)}
          value={wording}
          onChangeText={setWording}
          multiline
          numberOfLines={4}
          maxLength={2000}
          editable={!busy}
        />
      ) : (
        timingFields.map((field) => {
          const saved = original[field];
          const savedInput = saved ? localTimeInput(new Date(saved)) : null;
          const value = timing[field] === undefined ? savedInput : timing[field];
          return (
            <OptionalTimeFields
              key={field}
              title={copy[field]}
              locale={locale}
              value={value}
              busy={busy}
              change={(next) => {
                setCheckedAt(Date.now());
                setTiming((current) => ({ ...current, [field]: next }));
              }}
            />
          );
        })
      )}
      {validation || error ? <ErrorText>{validation || error}</ErrorText> : null}
    </AssistantSheet>
  );
}

const modes = ["date", "time"] as const;
type PickerMode = (typeof modes)[number];
const inputKey = { date: "day", time: "time" } as const;

function OptionalTimeFields({
  title,
  value,
  locale,
  busy,
  change,
}: {
  title: string;
  value: RequestTimeInput | null;
  locale: Language;
  busy: boolean;
  change: (value: RequestTimeInput | null) => void;
}) {
  const localizedType = useLocalizedType();
  const copy = liveRequestCopy[locale];
  const label = localizedType("field-label", locale);
  const [dialog, setDialog] = useState<PickerMode | null>(null);
  const date = value ? new Date(`${value.day}T${value.time}`) : null;
  const toggleLabel = value ? copy.clearTime : copy.addTime;

  function pick(mode: PickerMode, selected: Date) {
    setDialog(null);
    if (!value) return;
    const key = inputKey[mode];
    change({ ...value, [key]: localTimeInput(selected)[key] });
  }

  return (
    <View style={styles.fields}>
      <Text accessibilityRole="header" style={[label, styles.ink]}>
        {title}
      </Text>
      {value && date ? (
        <>
          {modes.map((mode) => {
            const key = inputKey[mode];
            const fieldLabel = copy[key];
            const accessibilityLabel = `${title} · ${fieldLabel}`;
            const formatted = Platform.OS === "android"
              ? new Intl.DateTimeFormat(
                  locale,
                  mode === "date"
                    ? { dateStyle: "medium" }
                    : { timeStyle: "short" },
                ).format(date)
              : undefined;
            return (
              <View key={mode} style={styles.field}>
                <Text style={[label, styles.ink]}>{fieldLabel}</Text>
                {Platform.OS === "web" ? (
                  <input
                    type={mode}
                    aria-label={accessibilityLabel}
                    value={value[key]}
                    disabled={busy}
                    style={webPickerStyle}
                    onChange={(event) =>
                      change({ ...value, [key]: event.currentTarget.value })
                    }
                  />
                ) : formatted ? (
                  <Button
                    variant="secondary"
                    accessibilityLabel={`${accessibilityLabel} · ${formatted}`}
                    labelStyle={label}
                    disabled={busy}
                    label={formatted}
                    onPress={() => setDialog(mode)}
                  />
                ) : (
                  <DateTimePicker
                    mode={mode}
                    display="compact"
                    locale={locale}
                    value={date}
                    accentColor={colors.action}
                    disabled={busy}
                    onValueChange={(_, selected) => pick(mode, selected)}
                  />
                )}
              </View>
            );
          })}
          {dialog ? (
            <DateTimePicker
              mode={dialog}
              presentation="dialog"
              value={date}
              accentColor={colors.action}
              onDismiss={() => setDialog(null)}
              onValueChange={(_, selected) => pick(dialog, selected)}
            />
          ) : null}
        </>
      ) : null}
      <Button
        variant="text"
        labelStyle={label}
        label={toggleLabel}
        accessibilityLabel={`${title} · ${toggleLabel}`}
        disabled={busy}
        onPress={() => {
          if (value) {
            setDialog(null);
            change(null);
          } else {
            const next = new Date();
            next.setHours(next.getHours() + 2, 0, 0, 0);
            change(localTimeInput(next));
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { gap: spacing["related-gap"] },
  field: { gap: 6 },
  ink: { color: colors.ink },
});

const webPickerStyle = {
  minHeight: 44,
  border: `1px solid ${colors.rule}`,
  borderRadius: controls.radius,
  paddingInline: 12,
  color: colors.ink,
  backgroundColor: colors.canvas,
  font: "inherit",
};
