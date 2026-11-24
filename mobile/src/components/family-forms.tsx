import { Image } from "expo-image";
import type { PropsWithChildren } from "react";
import { Modal, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui";
import type { Language } from "@/lib/api";
import { localizedType } from "@/lib/onboarding-i18n";
import { colors, controls, spacing } from "@/theme/tokens.json";

const markerOn = require("../../assets/images/community/ask-choice-empty.svg");
const markerOff = require("../../assets/images/community/ask-choice-selected.svg");

export function SelectionCard({
  title,
  detail,
  selected,
  onPress,
  disabled = false,
  locale,
}: {
  title: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  locale: Language;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.selection,
        selected ? styles.selectionOn : styles.selectionOff,
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      <Image
        source={selected ? markerOn : markerOff}
        style={styles.marker}
        accessible={false}
      />
      <View style={styles.copy}>
        <Text style={[localizedType("field-label", locale), styles.ink]}>
          {title}
        </Text>
        {detail ? (
          <Text style={[localizedType("supporting", locale), styles.secondary]}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function ScopeToggleRow({
  title,
  detail,
  value,
  onChange,
  disabled = false,
  locale,
}: {
  title: string;
  detail: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  locale: Language;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.copy}>
        <Text style={[localizedType("field-label", locale), styles.ink]}>
          {title}
        </Text>
        <Text style={[localizedType("supporting", locale), styles.secondary]}>
          {detail}
        </Text>
      </View>
      <Switch
        accessibilityLabel={title}
        accessibilityHint={detail}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: colors.control, true: colors.action }}
        thumbColor={colors.canvas}
        ios_backgroundColor={colors.control}
      />
    </View>
  );
}

export function ActingBanner({
  title,
  detail,
  locale,
}: {
  title: string;
  detail: string;
  locale: Language;
}) {
  return (
    <View style={styles.bannerWrap}>
      <View
        accessible
        accessibilityRole="summary"
        accessibilityLabel={`${title}. ${detail}`}
        style={styles.banner}
      >
        <Text style={[localizedType("field-label", locale), styles.ink]}>
          {title}
        </Text>
        <Text style={[localizedType("supporting", locale), styles.secondary]}>
          {detail}
        </Text>
      </View>
    </View>
  );
}

export function ConfirmSheet({
  visible,
  title,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy = false,
  disabled = false,
  secondaryLabel,
  onSecondary,
  locale,
  children,
}: PropsWithChildren<{
  visible: boolean;
  title: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  disabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  locale: Language;
}>) {
  const label = localizedType("field-label", locale);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={busy ? undefined : onCancel}
    >
      <SafeAreaView style={styles.scrim}>
        <View accessibilityViewIsModal style={styles.sheet}>
          <Text
            accessibilityRole="header"
            style={[localizedType("section-heading", locale), styles.ink]}
          >
            {title}
          </Text>
          {children}
          <Button
            label={confirmLabel}
            labelStyle={localizedType("button", locale)}
            busy={busy}
            disabled={disabled}
            onPress={onConfirm}
          />
          {secondaryLabel && onSecondary ? (
            <Button
              label={secondaryLabel}
              labelStyle={label}
              variant="outline"
              disabled={busy}
              onPress={onSecondary}
            />
          ) : null}
          <Button
            label={cancelLabel}
            labelStyle={label}
            variant="text"
            disabled={busy}
            onPress={onCancel}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export function SheetLine({
  children,
  locale,
}: PropsWithChildren<{ locale: Language }>) {
  return (
    <Text style={[localizedType("body", locale), styles.secondary]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  selection: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["control-gap"],
    minHeight: controls["touch-target"],
    paddingHorizontal: spacing["control-gap"],
    paddingVertical: 7,
    borderWidth: 1,
    borderRadius: controls.radius,
  },
  selectionOn: { borderColor: colors.action, backgroundColor: colors.wash },
  selectionOff: { borderColor: colors.control, backgroundColor: colors.canvas },
  dimmed: { opacity: 0.6 },
  marker: { width: 22, height: 22 },
  copy: { flex: 1, gap: 2 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["control-gap"],
    minHeight: controls["touch-target"],
  },
  bannerWrap: {
    paddingTop: spacing["related-gap"],
    paddingHorizontal: spacing["screen-gutter"],
    width: "100%",
    maxWidth: 540,
    alignSelf: "center",
  },
  banner: {
    gap: 2,
    paddingHorizontal: spacing["control-gap"],
    paddingVertical: 9,
    borderRadius: controls.radius,
    backgroundColor: colors.paper,
  },
  scrim: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(48,54,48,0.28)",
  },
  sheet: {
    alignSelf: "center",
    maxWidth: 500,
    width: "100%",
    backgroundColor: colors.canvas,
    padding: spacing["screen-gutter"],
    gap: spacing["card-inset"],
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
});
