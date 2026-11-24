import { Pressable, StyleSheet, Text, View } from "react-native";
import { lendingCopy } from "@/lib/lending-copy";
import type { KindFilter } from "@/lib/listing-workflow";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { colors, controls } from "@/theme/tokens.json";

const kinds = ["all", "tool", "skill"] as const;

export function ListingKindFilter({
  value,
  disabled = false,
  onChange,
}: {
  value: KindFilter;
  disabled?: boolean;
  onChange: (value: KindFilter) => void;
}) {
  const localizedType = useLocalizedType();
  const { locale } = useOnboardingText();
  const copy = lendingCopy[locale];
  const label = localizedType("field-label", locale);
  return (
    <View accessibilityRole="radiogroup" style={styles.segments}>
      {kinds.map((kind) => {
        const selected = value === kind;
        return (
          <Pressable
            key={kind}
            accessibilityRole="radio"
            aria-checked={selected}
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            style={[styles.segment, selected && styles.selectedSegment]}
            onPress={() => onChange(kind)}
          >
            <Text
              style={[label, styles.label, selected && styles.selectedLabel]}
            >
              {copy[kind]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segments: {
    flexDirection: "row",
    backgroundColor: colors.paper,
    borderRadius: controls.radius + 2,
    gap: 4,
    padding: 4,
  },
  segment: {
    flex: 1,
    minWidth: 0,
    minHeight: controls["touch-target"],
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: controls.radius,
  },
  selectedSegment: { backgroundColor: colors.wash },
  label: { color: colors.secondary, textAlign: "center" },
  selectedLabel: { color: colors.action },
});
