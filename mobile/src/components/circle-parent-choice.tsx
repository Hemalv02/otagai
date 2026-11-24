import { Text, View } from "react-native";

import { Choice } from "@/components/ui";
import type { Region } from "@/lib/api";
import { circleCopy } from "@/lib/circle-copy";
import { useMemberships } from "@/lib/memberships";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";

const parentTypes: Partial<Record<string, readonly string[]>> = {
  association: ["city"],
  moholla: ["city"],
  han: ["association"],
  para: ["moholla"],
  building: ["association", "moholla"],
};

export function CircleParentChoice({
  circleId,
  unitType,
  region,
  currentParent,
  value,
  onChange,
  disabled,
}: {
  circleId?: string;
  unitType: string;
  region: Region;
  currentParent?: string;
  value: string;
  onChange: (parentId: string) => void;
  disabled: boolean;
}) {
  const { locale } = useOnboardingText();
  const localizedType = useLocalizedType();
  const { state } = useMemberships();
  const copy = circleCopy[locale];
  const types = parentTypes[unitType];
  if (!types) return null;

  const memberships = state.status === "ready" ? state.items : [];
  const choices = memberships.flatMap(({ role, status, circle }) =>
    circle &&
    circle.region === region &&
    circle.id !== circleId &&
    circle.status !== "archived" &&
    types.includes(circle.unit_type) &&
    role === "leader" &&
    status === "approved"
      ? [{ value: circle.id, label: circle.name }]
      : [],
  );
  if (currentParent && !choices.some(({ value }) => value === currentParent)) {
    const parent = memberships.find(({ circle_id }) => circle_id === currentParent);
    choices.push({
      value: currentParent,
      label: parent?.circle?.name ?? copy.currentParentCircle,
    });
  }
  if (!choices.length && (!circleId || state.status !== "ready")) return null;

  return (
    <View className="gap-related-gap">
      <Text className="text-ink" style={localizedType("field-label", locale)}>
        {copy.parentCircle}
      </Text>
      {choices.length ? (
        <Choice
          options={[{ value: "", label: copy.noParentCircle }, ...choices]}
          value={value}
          onChange={onChange}
          disabled={disabled}
          stacked
        />
      ) : (
        <Text className="text-secondary" style={localizedType("body", locale)}>
          {copy.parentCircleHint}
        </Text>
      )}
    </View>
  );
}
