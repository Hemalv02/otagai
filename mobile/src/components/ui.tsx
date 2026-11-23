import type { PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
  View,
} from "react-native";

import { colors, fonts, spacing, typography } from "@/theme/tokens.json";

type ButtonProps = {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "text";
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

const buttonVariants = {
  primary: {
    container: "min-h-primary-control items-center bg-action px-card-inset",
    label: "text-center text-on-action",
  },
  secondary: {
    container:
      "min-h-primary-control items-center border border-rule bg-canvas px-card-inset",
    label: "text-center text-ink",
  },
  text: {
    container: "min-h-touch-target items-start self-start",
    label: "text-action",
  },
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
  const appearance = buttonVariants[variant];
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={style}
      className={`justify-center rounded-control ${appearance.container} ${inactive ? "opacity-50" : ""}`}
    >
      {busy ? (
        <ActivityIndicator
          color={variant === "primary" ? colors["on-action"] : colors.ink}
        />
      ) : (
        <Text style={labelStyle} className={`type-button ${appearance.label}`}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  labelStyle,
  multiline,
  style,
  ...props
}: TextInputProps & {
  label: string;
  labelStyle?: StyleProp<TextStyle>;
}) {
  const { lineHeight, ...inputType } = StyleSheet.flatten(style) ?? {};

  return (
    <View className="gap-related-gap">
      <Text className="type-body text-secondary" style={labelStyle}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.control}
        className="min-h-touch-target rounded-control border border-control bg-canvas px-control-gap text-ink"
        multiline={multiline}
        style={[
          fieldStyles.text,
          multiline
            ? [
                fieldStyles.multiline,
                { lineHeight: lineHeight ?? typography.body.lineHeight.en },
              ]
            : fieldStyles.singleLine,
          inputType,
        ]}
        {...props}
      />
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  text: {
    fontFamily: fonts.en.regular,
    fontSize: typography.body.size,
    includeFontPadding: false,
  },
  singleLine: {
    // Use UIKit’s natural line height and balance its lower text baseline.
    lineHeight: Platform.OS === "ios" ? 0 : undefined,
    paddingVertical: 0,
    paddingBottom: Platform.OS === "ios" ? 4 : 0,
    textAlignVertical: "center",
  },
  multiline: {
    paddingVertical: spacing["related-gap"],
    textAlignVertical: "top",
  },
});

type ChoiceProps<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  labelStyle?: (value: T) => StyleProp<TextStyle>;
  stacked?: boolean;
  disabled?: boolean;
};

export function Choice<T extends string>({
  options,
  value,
  onChange,
  labelStyle,
  stacked = false,
  disabled = false,
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
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
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
