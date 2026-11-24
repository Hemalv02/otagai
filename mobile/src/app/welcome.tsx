import { Image } from "expo-image";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import {
  OnboardingLink,
  OnboardingNext,
  OnboardingScreen,
} from "@/components/onboarding-screen";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { colors, spacing } from "@/theme/tokens.json";

export default function Welcome() {
  const localizedType = useLocalizedType();
  const { t, locale } = useOnboardingText();

  return (
    <OnboardingScreen
      paper
      action={
        <OnboardingLink
          label={t("preferences")}
          onPress={() => router.push("/onboarding-preferences")}
        />
      }
      footer={<OnboardingNext from={1} />}
    >
      <View style={styles.photo}>
        <Image
          source={require("../../assets/images/onboarding-nagasaki.jpg")}
          contentFit="cover"
          style={styles.image}
          accessibilityLabel={t("heroDescription")}
          accessible
        />
        <Text style={[localizedType("supporting", locale), styles.secondary]}>
          {t("location")}
        </Text>
      </View>
      <View style={styles.copy}>
        <Text
          accessibilityRole="header"
          style={[
            localizedType("screen-title", locale),
            styles.title,
            locale === "en" && styles.englishTitle,
          ]}
        >
          {t("welcomeTitle")}
        </Text>
        <Text style={[localizedType("body", locale), styles.secondary]}>
          {t("welcomeBody")}
        </Text>
      </View>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  photo: { gap: spacing["related-gap"] },
  image: {
    width: "100%",
    aspectRatio: 348 / 294,
    borderRadius: 16,
    backgroundColor: colors.wash,
  },
  copy: { gap: spacing["related-gap"] },
  title: { color: colors.ink },
  englishTitle: { fontSize: 36, lineHeight: 42 },
  secondary: { color: colors.secondary },
});
