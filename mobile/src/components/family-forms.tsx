import { type PropsWithChildren, useCallback } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ActivityToggle } from "@/components/activity-toggle";
import { Button } from "@/components/ui";
import { api, type Language } from "@/lib/api";
import { familyAskCopy } from "@/lib/family-ask-copy";
import { useLiveResource } from "@/lib/live-resource";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { colors, controls, spacing } from "@/theme/tokens.json";

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
  const localizedType = useLocalizedType();
  return (
    <Pressable
      accessibilityRole="radio"
      aria-checked={selected}
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      disabled={disabled}
      onPress={onPress}
      className="active:opacity-60"
      style={[
        styles.selection,
        selected ? styles.selectionOn : styles.selectionOff,
        disabled && styles.dimmed,
      ]}
    >
      <View style={[styles.marker, selected && styles.markerOn]}>
        {selected ? <View style={styles.markerDot} /> : null}
      </View>
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
  const localizedType = useLocalizedType();
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
      <ActivityToggle
        label={title}
        hint={detail}
        value={value}
        onChange={onChange}
        disabled={disabled}
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
  detail?: string;
  locale: Language;
}) {
  const localizedType = useLocalizedType();
  return (
    <View style={styles.bannerWrap}>
      <View
        accessible
        accessibilityRole="summary"
        accessibilityLabel={detail ? `${title}. ${detail}` : title}
        style={styles.banner}
      >
        <Text style={[localizedType("field-label", locale), styles.ink]}>
          {title}
        </Text>
        {detail ? (
          <Text style={[localizedType("supporting", locale), styles.secondary]}>
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function ScopedActingBanner({ memberId }: { memberId: string }) {
  const { locale } = useOnboardingText();
  const copy = familyAskCopy[locale];
  const { data: name } = useLiveResource(
    useCallback(async () => {
      const grants = await api.listCaretakerGrants();
      return grants.find((grant) => grant.member_user_id === memberId)?.other
        ?.display_name;
    }, [memberId]),
  );
  return (
    <ActingBanner
      title={name ? copy.bannerTitle(name) : copy.bannerFallback}
      locale={locale}
    />
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
  const { bottom } = useSafeAreaInsets();
  const localizedType = useLocalizedType();
  const label = localizedType("field-label", locale);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onCancel();
      }}
    >
      <View style={styles.scrim}>
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { paddingBottom: bottom }]}
        >
          <ScrollView bounces={false} contentContainerStyle={styles.sheetContent}>
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
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function SheetLine({
  children,
  locale,
}: PropsWithChildren<{ locale: Language }>) {
  const localizedType = useLocalizedType();
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
  marker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.control,
    alignItems: "center",
    justifyContent: "center",
  },
  markerOn: { borderColor: colors.action },
  markerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.action,
  },
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
    flexShrink: 1,
    backgroundColor: colors.canvas,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  sheetContent: {
    padding: spacing["screen-gutter"],
    gap: spacing["card-inset"],
  },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
});
