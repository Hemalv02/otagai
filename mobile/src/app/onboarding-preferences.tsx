import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  OnboardingBack,
  OnboardingScreen,
} from "@/components/onboarding-screen";
import { Button, Choice, ErrorText } from "@/components/ui";
import { useOnboarding } from "@/lib/onboarding";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { colors, spacing } from "@/theme/tokens.json";

const languages = [
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "bn", label: "বাংলা" },
] as const;

export default function OnboardingPreferences() {
  const { state, saving, savePreferences } = useOnboarding();
  const [language, setLanguage] = useState(state.language);
  const [region, setRegion] = useState(state.region);
  const [failed, setFailed] = useState(false);
  const { t, locale } = useOnboardingText(language);
  const regions = [
    { value: "jp", label: t("japan") },
    { value: "bd", label: t("bangladesh") },
  ] as const;

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace(state.completed ? "/sign-in" : "/welcome");
  }

  async function save() {
    setFailed(false);
    try {
      await savePreferences({ language, region });
      goBack();
    } catch {
      setFailed(true);
    }
  }

  return (
    <OnboardingScreen
      action={<OnboardingBack language={language} onPress={goBack} />}
      footer={
        <>
          {failed ? <ErrorText>{t("saveError")}</ErrorText> : null}
          <Button
            label={t("save")}
            labelStyle={localizedType("button", locale)}
            onPress={save}
            busy={saving}
          />
        </>
      }
    >
      <View style={styles.group}>
        <Text
          accessibilityRole="header"
          style={[localizedType("screen-title", locale), styles.ink]}
        >
          {t("preferences")}
        </Text>
        <Text style={[localizedType("body", locale), styles.secondary]}>
          {t("preferencesBody")}
        </Text>
      </View>
      <View style={styles.group}>
        <Text style={[localizedType("card-title", locale), styles.ink]}>
          {t("appLanguage")}
        </Text>
        <Choice
          options={languages}
          value={language}
          onChange={setLanguage}
          labelStyle={(value) => localizedType("button", value)}
        />
      </View>
      <View style={styles.group}>
        <Text style={[localizedType("card-title", locale), styles.ink]}>
          {t("region")}
        </Text>
        <Choice
          options={regions}
          value={region}
          onChange={setRegion}
          labelStyle={() => localizedType("body", locale)}
          stacked
        />
      </View>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing["related-gap"] },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
});
