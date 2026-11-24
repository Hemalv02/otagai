import { Image } from "expo-image";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import {
  OnboardingFinish,
  OnboardingLink,
  OnboardingScreen,
} from "@/components/onboarding-screen";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { colors, controls, spacing } from "@/theme/tokens.json";

export default function OnboardingFeatures() {
  const localizedType = useLocalizedType();
  const { t, locale } = useOnboardingText();
  const features = [
    {
      title: t("askForHelp"),
      description: t("askForHelpBody"),
      image: require("../../assets/images/onboarding-nagasaki.jpg"),
    },
    {
      title: t("lendATool"),
      description: t("lendAToolBody"),
      image: require("../../assets/images/onboarding-drill.jpg"),
    },
  ];

  return (
    <OnboardingScreen
      action={
        <OnboardingLink
          label={t("language")}
          onPress={() => router.push("/onboarding-preferences")}
        />
      }
      footer={
        <>
          <OnboardingFinish />
          <OnboardingLink
            label={t("backToWelcome")}
            onPress={() => router.dismissTo("/welcome")}
          />
        </>
      }
    >
      <View style={styles.copy}>
        <Text
          accessibilityRole="header"
          style={[localizedType("screen-title", locale), styles.ink]}
        >
          {t("featuresTitle")}
        </Text>
        <Text style={[localizedType("body", locale), styles.secondary]}>
          {t("featuresBody")}
        </Text>
      </View>
      <View style={styles.features}>
        {features.map(({ title, description, image }) => (
          <View key={title} style={styles.card}>
            <Image
              source={image}
              contentFit="cover"
              style={styles.image}
              accessible={false}
            />
            <Text style={[localizedType("card-title", locale), styles.ink]}>
              {title}
            </Text>
            <Text
              style={[localizedType("supporting", locale), styles.secondary]}
            >
              {description}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.notice}>
        <Text style={[localizedType("field-label", locale), styles.ink]}>
          {t("joinWithInvite")}
        </Text>
        <Text style={[localizedType("supporting", locale), styles.secondary]}>
          {t("joinWithInviteBody")}
        </Text>
      </View>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  copy: { gap: spacing["related-gap"] },
  features: { flexDirection: "row", gap: spacing["control-gap"] },
  card: { flex: 1, minWidth: 0, gap: spacing["related-gap"] },
  image: {
    width: "100%",
    aspectRatio: 168 / 142,
    borderRadius: controls.radius,
    backgroundColor: colors.wash,
  },
  notice: {
    backgroundColor: colors.paper,
    borderRadius: controls.radius,
    padding: spacing["control-gap"],
  },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
});
