import type { PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
  View,
} from "react-native";

import { colors } from "@/theme/tokens.json";

type ButtonProps = {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

export function Button({
  label,
  onPress,
  busy = false,
  disabled = false,
  variant = "primary",
  style,
  labelStyle,
}: ButtonProps) {
  const primary = variant === "primary";
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={style}
      className={`min-h-primary-control items-center justify-center rounded-control px-card-inset ${
        primary ? "bg-action" : "border border-rule bg-canvas"
      } ${inactive ? "opacity-50" : ""}`}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors["on-action"] : colors.ink} />
      ) : (
        <Text
          style={labelStyle}
          className={`type-button text-center ${primary ? "text-on-action" : "text-ink"}`}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  labelStyle,
  ...props
}: TextInputProps & {
  label: string;
  labelStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View className="gap-related-gap">
      <Text className="type-body text-secondary" style={labelStyle}>
        {label}
      </Text>
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
  labelStyle?: (value: T) => StyleProp<TextStyle>;
  stacked?: boolean;
};

export function Choice<T extends string>({
  options,
  value,
  onChange,
  labelStyle,
  stacked = false,
}: ChoiceProps<T>) {
  return (
    <View
      className={
        stacked ? "gap-related-gap" : "flex-row flex-wrap gap-related-gap"
      }
    >
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
            <Text
              className="type-body text-ink"
              style={labelStyle?.(option.value)}
            >
              {option.label}
            </Text>
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
