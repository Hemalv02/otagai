import { Image } from "expo-image";
import {
  Platform,
  Pressable,
  StyleSheet,
  type PressableProps,
} from "react-native";
import { controls } from "@/theme/tokens.json";

export function ActivityToggle({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  const keyboardProps: Pick<PressableProps, "onKeyDown"> =
    Platform.OS === "web"
      ? {
          onKeyDown: (event) => {
            if (event.nativeEvent.key === " " && !disabled) {
              event.preventDefault();
              if (!event.nativeEvent.repeat) onChange(!value);
            }
          },
        }
      : {};
  return (
    <Pressable
      {...keyboardProps}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      aria-checked={value}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={styles.touch}
    >
      <Image
        source={
          value
            ? require("../../assets/images/activity/toggle-on.svg")
            : require("../../assets/images/activity/toggle-off.svg")
        }
        style={[styles.image, disabled && styles.disabled]}
        accessible={false}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touch: {
    minWidth: controls["touch-target"],
    minHeight: controls["touch-target"],
    alignItems: "flex-end",
    justifyContent: "center",
  },
  image: { width: 38, height: 22 },
  disabled: { opacity: 0.5 },
});
