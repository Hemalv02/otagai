import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";

import {
  OnboardingBack,
  OnboardingNext,
  OnboardingScreen,
} from "@/components/onboarding-screen";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { colors, controls, spacing } from "@/theme/tokens.json";

export default function OnboardingStory() {
  const { t, locale } = useOnboardingText();
  const { t: bengali } = useOnboardingText("bn");
  const messages = [
    {
      name: t("tanaka"),
      message: t("request"),
      portrait: require("../../assets/images/onboarding-tanaka.png"),
    },
    {
      name: t("rahim"),
      message: t("reply"),
      portrait: require("../../assets/images/onboarding-rahim.png"),
    },
  ];

  return (
    <OnboardingScreen
      action={<OnboardingBack />}
      footer={<OnboardingNext from={2} />}
    >
      <View style={styles.copy}>
        <Text
          accessibilityRole="header"
          style={[localizedType("screen-title", locale), styles.ink]}
        >
          {t("storyTitle")}
        </Text>
        <Text style={[localizedType("body", locale), styles.secondary]}>
          {t("storyBody")}
        </Text>
      </View>
      <View style={styles.story}>
        <Text style={[localizedType("card-title", locale), styles.ink]}>
          {t("storyPlace")}
        </Text>
        {messages.map(({ name, message, portrait }, i) => (
          <View key={name} style={[styles.message, i === 1 && styles.reply]}>
            <Image
              source={portrait}
              style={styles.portrait}
              accessible={false}
            />
            <View style={styles.messageCopy}>
              <Text style={[localizedType("field-label", locale), styles.ink]}>
                {name}
              </Text>
              <Text
                style={[localizedType("supporting", locale), styles.secondary]}
              >
                {message}
              </Text>
              {i === 0 && locale !== "bn" ? (
                <Text
                  accessibilityLanguage="bn"
                  style={[localizedType("supporting", "bn"), styles.secondary]}
                >
                  {bengali("request")}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  copy: { gap: spacing["related-gap"] },
  story: {
    backgroundColor: colors.paper,
    borderRadius: controls.radius,
    padding: spacing["card-inset"],
    gap: spacing["control-gap"],
  },
  message: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.canvas,
    borderRadius: controls.radius,
    padding: spacing["control-gap"],
    gap: spacing["control-gap"],
  },
  reply: { backgroundColor: colors.wash },
  portrait: { width: 52, height: 52, borderRadius: 26 },
  messageCopy: { flex: 1, gap: spacing["related-gap"] },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
});
