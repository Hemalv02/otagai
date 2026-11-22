import type { PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";

import { colors } from "@/theme/tokens.json";

type ButtonProps = {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary";
};

export function Button({
  label,
  onPress,
  busy = false,
  disabled = false,
  variant = "primary",
}: ButtonProps) {
  const primary = variant === "primary";
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      className={`min-h-primary-control items-center justify-center rounded-control px-card-inset ${
        primary ? "bg-action" : "border border-rule bg-canvas"
      } ${inactive ? "opacity-50" : ""}`}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors["on-action"] : colors.ink} />
      ) : (
        <Text
          className={`type-button ${primary ? "text-on-action" : "text-ink"}`}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View className="gap-related-gap">
      <Text className="type-body text-secondary">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.control}
        className="type-body min-h-touch-target rounded-control border border-control bg-canvas px-control-gap text-ink"
        {...props}
      />
    </View>
  );
}

type ChoiceProps<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

export function Choice<T extends string>({
  options,
  value,
  onChange,
}: ChoiceProps<T>) {
  return (
    <View className="flex-row flex-wrap gap-related-gap">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            className={`min-h-touch-target justify-center rounded-control border px-card-inset ${
              selected ? "border-action bg-wash" : "border-rule bg-canvas"
            }`}
          >
            <Text className="type-body text-ink">{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ErrorText({ children }: PropsWithChildren) {
  if (!children) {
    return null;
  }
  return (
    <Text accessibilityRole="alert" className="type-body text-clay">
      {children}
    </Text>
  );
}
