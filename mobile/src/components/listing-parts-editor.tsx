import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AssistantSheet } from "@/components/assistant-widgets";
import { Button, ErrorText, Field } from "@/components/ui";
import type { Language } from "@/lib/api";
import { type DraftPart, encodeParts, parseParts } from "@/lib/listing-draft";
import { draftCopy } from "@/lib/listing-draft-copy";
import { useLocalizedType } from "@/lib/onboarding-i18n";
import { colors, spacing } from "@/theme/tokens.json";

export function ListingPartsEditor({
  value,
  disabled,
  locale,
  onChange,
}: {
  value: string;
  disabled: boolean;
  locale: Language;
  onChange: (value: string) => void;
}) {
  const localizedType = useLocalizedType();
  const copy = draftCopy[locale];
  const parts = parseParts(value);
  const labelStyle = localizedType("field-label", locale);
  const supporting = localizedType("supporting", locale);
  const [editing, setEditing] = useState<number | "new" | null>(null);

  function finish(next: DraftPart[]) {
    onChange(encodeParts(next));
    setEditing(null);
  }

  return (
    <View style={styles.editor}>
      <Text accessibilityRole="header" style={[labelStyle, styles.ink]}>
        {copy.includedParts}
      </Text>
      {parts.map((part, index) => (
        <View key={part.label} style={styles.row}>
          <View style={styles.name}>
            <Text style={[labelStyle, styles.ink]}>{part.label}</Text>
            <Text style={[supporting, styles.secondary]}>
              {part.quantity === null
                ? copy.checkQuantity
                : `${copy.quantity} · ${part.quantity}`}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${copy.editPart} · ${part.label}`}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => setEditing(index)}
            style={styles.edit}
          >
            <Text style={[labelStyle, styles.action]}>{copy.editPart}</Text>
          </Pressable>
        </View>
      ))}
      {parts.length < 30 ? (
        <Button
          label={copy.addPart}
          variant="text"
          labelStyle={labelStyle}
          disabled={disabled}
          onPress={() => setEditing("new")}
        />
      ) : null}
      {editing !== null ? (
        <PartSheet
          locale={locale}
          initial={editing === "new" ? undefined : parts[editing]}
          otherLabels={parts
            .filter((_, index) => index !== editing)
            .map(({ label }) => label.toLowerCase())}
          close={() => setEditing(null)}
          save={(part) =>
            finish(
              editing === "new"
                ? [...parts, part]
                : parts.map((row, index) => (index === editing ? part : row)),
            )
          }
          remove={
            editing === "new"
              ? undefined
              : () => finish(parts.filter((_, index) => index !== editing))
          }
        />
      ) : null}
    </View>
  );
}

function PartSheet({
  locale,
  initial,
  otherLabels,
  close,
  save,
  remove,
}: {
  locale: Language;
  initial?: DraftPart;
  otherLabels: string[];
  close: () => void;
  save: (part: DraftPart) => void;
  remove?: () => void;
}) {
  const localizedType = useLocalizedType();
  const copy = draftCopy[locale];
  const [label, setLabel] = useState(initial?.label ?? "");
  const [quantity, setQuantity] = useState(
    initial ? String(initial.quantity ?? "") : "1",
  );
  const duplicate = otherLabels.includes(label.trim().toLowerCase());
  const valid =
    label.trim() !== "" && !duplicate && /^[1-9]\d{0,2}$/.test(quantity);
  const labelStyle = localizedType("field-label", locale);
  const bodyStyle = localizedType("body", locale);

  return (
    <AssistantSheet
      title={initial ? copy.editPart : copy.addPart}
      locale={locale}
      close={close}
      footer={
        <Button
          label={copy.savePart}
          labelStyle={labelStyle}
          disabled={!valid}
          onPress={() =>
            save({ label: label.trim(), quantity: Number(quantity) })
          }
        />
      }
    >
      <Field
        label={copy.partName}
        labelStyle={labelStyle}
        style={bodyStyle}
        maxLength={120}
        value={label}
        onChangeText={setLabel}
      />
      <Field
        label={copy.quantity}
        labelStyle={labelStyle}
        style={bodyStyle}
        keyboardType="number-pad"
        maxLength={3}
        value={quantity}
        onChangeText={setQuantity}
      />
      {duplicate ? <ErrorText>{copy.duplicatePart}</ErrorText> : null}
      {remove ? (
        <Button
          label={copy.dismiss}
          variant="text"
          labelStyle={labelStyle}
          onPress={remove}
        />
      ) : null}
    </AssistantSheet>
  );
}

const styles = StyleSheet.create({
  editor: { gap: spacing["related-gap"] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["related-gap"],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
    paddingVertical: 4,
  },
  name: { flex: 1, minWidth: 0 },
  edit: { minHeight: 44, minWidth: 44, justifyContent: "center" },
  action: { color: colors.action },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
});
