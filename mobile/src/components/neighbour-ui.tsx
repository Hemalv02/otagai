import { Image } from "expo-image";
import type { PropsWithChildren } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";

import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { colors, controls, spacing } from "@/theme/tokens.json";
import { Button } from "@/components/ui";

export function NeighbourHeading({ children }: PropsWithChildren) {
  const { locale } = useOnboardingText();
  return (
    <Text
      accessibilityRole="header"
      style={[localizedType("section-heading", locale), styles.ink]}
    >
      {children}
    </Text>
  );
}

export function SelectionCopy({
  title,
  detail,
  selected,
  unavailable = false,
}: {
  title: string;
  detail: string;
  selected: boolean;
  unavailable?: boolean;
}) {
  const { locale } = useOnboardingText();
  return (
    <View
      style={[
        styles.selection,
        selected && styles.selected,
        unavailable && styles.unavailable,
      ]}
    >
      <Image
        accessible={false}
        source={
          selected
            ? require("../../assets/images/exchange-selection-on.svg")
            : require("../../assets/images/exchange-selection-off.svg")
        }
        style={styles.marker}
      />
      <View style={styles.copy}>
        <Text
          style={[
            localizedType("field-label", locale),
            unavailable ? styles.secondary : styles.ink,
          ]}
        >
          {title}
        </Text>
        <Text style={[localizedType("supporting", locale), styles.secondary]}>
          {detail}
        </Text>
      </View>
    </View>
  );
}

export function NeighbourNotice({ children }: PropsWithChildren) {
  return <View style={styles.notice}>{children}</View>;
}

export function NeighbourConfirmation({
  title,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: PropsWithChildren<{
  title: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}>) {
  const { locale } = useOnboardingText();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.scrim}>
        <View accessibilityViewIsModal style={styles.sheet}>
          <NeighbourHeading>{title}</NeighbourHeading>
          <ScrollView
            style={styles.confirmationBody}
            contentContainerStyle={styles.confirmationContent}
          >
            {children}
          </ScrollView>
          <Button
            label={confirmLabel}
            labelStyle={localizedType("button", locale)}
            onPress={onConfirm}
          />
          <Button
            label={cancelLabel}
            labelStyle={localizedType("button", locale)}
            variant="outline"
            onPress={onCancel}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  selection: {
    minHeight: controls["touch-target"],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["control-gap"],
    paddingHorizontal: spacing["control-gap"],
    paddingVertical: 7,
    borderRadius: controls.radius,
    borderWidth: 1,
    borderColor: colors.control,
  },
  selected: { backgroundColor: colors.wash, borderColor: colors.action },
  unavailable: { borderColor: colors.rule, backgroundColor: colors.paper },
  marker: { width: 22, height: 22 },
  copy: { flex: 1, gap: 2 },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
  notice: {
    backgroundColor: colors.paper,
    borderRadius: controls.radius,
    paddingHorizontal: spacing["control-gap"],
    paddingVertical: 9,
    gap: 2,
  },
  scrim: {
    flex: 1,
    backgroundColor: "rgba(48, 54, 48, 0.45)",
    justifyContent: "center",
    padding: spacing["screen-gutter"],
  },
  sheet: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "85%",
    alignSelf: "center",
    backgroundColor: colors.canvas,
    borderRadius: controls.radius,
    padding: spacing["card-inset"],
    gap: spacing["control-gap"],
  },
  confirmationBody: { flexGrow: 0, flexShrink: 1 },
  confirmationContent: { gap: spacing["control-gap"] },
});
