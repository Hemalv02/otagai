import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Choice, ErrorText, Field } from "@/components/ui";
import { ApiError, api, type Language, type Region } from "@/lib/api";
import { useOnboarding } from "@/lib/onboarding";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";

const languages = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
  { value: "bn", label: "বাংলা" },
] as const;

export default function ProfileSetup() {
  const { state } = useOnboarding();
  const { t, locale } = useOnboardingText();
  const bodyStyle = localizedType("body", locale);
  const buttonStyle = localizedType("button", locale);
  const regions = [
    { value: "jp", label: t("japanCountry") },
    { value: "bd", label: t("bangladeshCountry") },
  ] as const;
  const { setProfile, reloadProfile, signOut } = useSession();
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<Language>(state.language);
  const [region, setRegion] = useState<Region>(state.region);
  const [helpWith, setHelpWith] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const profile = await api.createProfile({
        display_name: name.trim(),
        preferred_language: language,
        region,
        happy_to_help_with: helpWith.trim() || undefined,
      });
      setProfile(profile);
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.status === 409) {
        await reloadProfile();
        return;
      }
      setError(
        saveError instanceof Error ? saveError.message : "Could not save.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <ScrollView
        contentContainerClassName="gap-card-inset px-screen-gutter py-card-inset"
        keyboardShouldPersistTaps="handled"
      >
        <Text
          className="type-screen-title text-ink"
          accessibilityRole="header"
          style={localizedType("screen-title", locale)}
        >
          {t("aboutYou")}
        </Text>
        <Text className="type-body text-secondary" style={bodyStyle}>
          {t("profileBody")}
        </Text>
        <Field
          label={t("name")}
          style={bodyStyle}
          labelStyle={bodyStyle}
          value={name}
          onChangeText={setName}
          maxLength={80}
          autoComplete="name"
          placeholder={t("nameExample")}
        />
        <View className="gap-related-gap">
          <Text className="type-body text-secondary" style={bodyStyle}>
            {t("language")}
          </Text>
          <Choice
            options={languages}
            labelStyle={(value) => localizedType("body", value)}
            value={language}
            onChange={setLanguage}
          />
        </View>
        <View className="gap-related-gap">
          <Text className="type-body text-secondary" style={bodyStyle}>
            {t("whereYouLive")}
          </Text>
          <Choice
            options={regions}
            labelStyle={() => bodyStyle}
            value={region}
            onChange={setRegion}
          />
        </View>
        <Field
          label={t("helpWith")}
          style={bodyStyle}
          labelStyle={bodyStyle}
          value={helpWith}
          onChangeText={setHelpWith}
          maxLength={500}
          multiline
          placeholder={t("helpWithExample")}
        />
        <ErrorText>{error}</ErrorText>
        <Button
          label={t("continue")}
          labelStyle={buttonStyle}
          onPress={save}
          busy={busy}
          disabled={name.trim().length === 0}
        />
        <Button
          label={t("signOut")}
          labelStyle={buttonStyle}
          variant="secondary"
          onPress={signOut}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
