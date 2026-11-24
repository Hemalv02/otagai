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

import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { colors, spacing } from "@/theme/tokens.json";

type ButtonProps = {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  variant?: "primary" | "secondary" | "outline" | "text";
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
  outline: {
    container:
      "min-h-touch-target items-center border border-control bg-canvas px-card-inset",
    label: "text-center text-action",
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
  accessibilityLabel,
  style,
  labelStyle,
}: ButtonProps) {
  const { locale } = useOnboardingText();
  const type = useLocalizedType();
  const appearance = buttonVariants[variant];
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
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
        <Text
          style={[type("button", locale), labelStyle]}
          className={appearance.label}
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
  multiline,
  style,
  ...props
}: TextInputProps & {
  label: string;
  labelStyle?: StyleProp<TextStyle>;
}) {
  const { locale } = useOnboardingText();
  const type = useLocalizedType();
  const { lineHeight: defaultLineHeight, ...body } = type("body", locale);
  const { lineHeight, ...inputType } = StyleSheet.flatten(style) ?? {};

  return (
    <View className="gap-related-gap">
      <Text
        className="text-secondary"
        style={[body, { lineHeight: defaultLineHeight }, labelStyle]}
      >
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.control}
        className="min-h-touch-target rounded-control border border-control bg-canvas px-control-gap text-ink"
        multiline={multiline}
        style={[
          fieldStyles.text,
          body,
          multiline
            ? [
                fieldStyles.multiline,
                { lineHeight: lineHeight ?? defaultLineHeight },
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
  const { locale } = useOnboardingText();
  const type = useLocalizedType();
  const body = type("body", locale);
  return (
    <View
      accessibilityRole="radiogroup"
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
            aria-checked={selected}
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            className={`min-h-touch-target max-w-full justify-center rounded-control border px-card-inset ${
              selected ? "border-action bg-wash" : "border-rule bg-canvas"
            }`}
          >
            <Text
              className="text-ink"
              style={[body, labelStyle?.(option.value)]}
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
  const { locale } = useOnboardingText();
  const type = useLocalizedType();
  if (!children) {
    return null;
  }
  return (
    <Text
      accessibilityRole="alert"
      className="text-clay"
      style={type("body", locale)}
    >
      {children}
    </Text>
  );
}
