import { useRef, useState } from "react";
import { Text, View } from "react-native";

import {
  OnboardingLink,
  OnboardingScreen,
} from "@/components/onboarding-screen";
import { Button, Choice, ErrorText, Field } from "@/components/ui";
import { ApiError, api, type Language, type Region } from "@/lib/api";
import { useOnboarding } from "@/lib/onboarding";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";

const languages = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
  { value: "bn", label: "বাংলা" },
] as const;

export default function ProfileSetup() {
  const localizedType = useLocalizedType();
  const { state } = useOnboarding();
  const { t, locale } = useOnboardingText();
  const { setProfile, reloadProfile, signOut } = useSession();
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<Language>(state.language);
  const [region, setRegion] = useState<Region>(state.region);
  const [helpWith, setHelpWith] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const body = localizedType("body", locale);
  const fieldLabel = localizedType("field-label", locale);

  async function save() {
    if (!name.trim() || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const profile = await api.createProfile({
        display_name: name.trim(),
        preferred_language: language,
        region,
        happy_to_help_with: helpWith.trim() || undefined,
      });
      setProfile(profile);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        await reloadProfile();
        return;
      }
      setFailed(true);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <OnboardingScreen
      keyboard
      action={
        <OnboardingLink
          label={t("signOut")}
          disabled={busy}
          onPress={signOut}
        />
      }
      footer={
        <Button
          label={t("continue")}
          labelStyle={localizedType("button", locale)}
          busy={busy}
          disabled={!name.trim()}
          onPress={save}
        />
      }
    >
      <View className="gap-related-gap">
        <Text
          accessibilityRole="header"
          className="text-ink"
          style={localizedType("screen-title", locale)}
        >
          {t("aboutYou")}
        </Text>
        <Text className="text-secondary" style={body}>
          {t("profileBody")}
        </Text>
      </View>
      <Field
        label={t("name")}
        style={body}
        labelStyle={fieldLabel}
        value={name}
        onChangeText={setName}
        maxLength={80}
        autoComplete="name"
        placeholder={t("nameExample")}
        editable={!busy}
      />
      <View className="gap-related-gap">
        <Text className="text-ink" style={fieldLabel}>
          {t("language")}
        </Text>
        <Choice
          options={languages}
          labelStyle={(selected) => localizedType("body", selected)}
          value={language}
          onChange={setLanguage}
          disabled={busy}
        />
      </View>
      <View className="gap-related-gap">
        <Text className="text-ink" style={fieldLabel}>
          {t("whereYouLive")}
        </Text>
        <Choice
          options={[
            { value: "jp", label: t("japanCountry") },
            { value: "bd", label: t("bangladeshCountry") },
          ]}
          labelStyle={() => body}
          value={region}
          onChange={setRegion}
          disabled={busy}
        />
      </View>
      <Field
        label={t("helpWith")}
        style={body}
        labelStyle={fieldLabel}
        value={helpWith}
        onChangeText={setHelpWith}
        maxLength={500}
        multiline
        editable={!busy}
        placeholder={t("helpWithExample")}
      />
      {failed ? <ErrorText>{t("saveError")}</ErrorText> : null}
    </OnboardingScreen>
  );
}
