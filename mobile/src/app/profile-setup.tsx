import { useRef, useState } from "react";
import { Text, View } from "react-native";

import { ActivityToggle } from "@/components/activity-toggle";
import {
  OnboardingLink,
  OnboardingScreen,
} from "@/components/onboarding-screen";
import { Button, Choice, ErrorText, Field } from "@/components/ui";
import { ApiError, api, type ContentLanguage, type Region } from "@/lib/api";
import { useOnboarding } from "@/lib/onboarding";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { draftLanguageNames, draftLanguages } from "@/lib/request-wording-copy";
import { settingsCopy } from "@/lib/settings-copy";
import { useSession } from "@/lib/session";

const languages = draftLanguages.map((value) => ({
  value,
  label: draftLanguageNames[value],
}));

export default function ProfileSetup() {
  const localizedType = useLocalizedType();
  const { state } = useOnboarding();
  const { t, locale } = useOnboardingText();
  const { setProfile, reloadProfile, signOut } = useSession();
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<ContentLanguage>(state.language);
  const [region, setRegion] = useState<Region>(state.region);
  const [helpWith, setHelpWith] = useState("");
  const [intro, setIntro] = useState("");
  const [shareProfile, setShareProfile] = useState(false);
  const visibility = settingsCopy[locale];
  const [suggested, setSuggested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftFailed, setDraftFailed] = useState(false);
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const drafter = useRef(false);
  const body = localizedType("body", locale);
  const fieldLabel = localizedType("field-label", locale);
  const skills = helpWith.trim();

  async function suggestIntro() {
    if (!skills || drafter.current) return;
    drafter.current = true;
    setDrafting(true);
    setDraftFailed(false);
    try {
      const result = await api.draftIntroCard({ skills, language });
      if (result.intro.trim()) {
        setIntro(result.intro.trim().slice(0, 1000));
        setSuggested(true);
      } else {
        setDraftFailed(true);
      }
    } catch {
      setDraftFailed(true);
    } finally {
      drafter.current = false;
      setDrafting(false);
    }
  }

  async function save() {
    if (!name.trim() || submitting.current || drafter.current) return;
    submitting.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const profile = await api.createProfile({
        display_name: name.trim(),
        preferred_language: language,
        region,
        happy_to_help_with: skills || undefined,
        intro: intro.trim() || undefined,
        profile_details_visible: shareProfile,
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
          disabled={!name.trim() || drafting}
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
          disabled={busy || drafting}
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
        editable={!busy && !drafting}
        placeholder={t("helpWithExample")}
      />
      <View className="gap-related-gap">
        <Field
          label={t("introLabel")}
          style={body}
          labelStyle={fieldLabel}
          value={intro}
          onChangeText={setIntro}
          maxLength={1000}
          multiline
          editable={!busy && !drafting}
          placeholder={t("introPlaceholder")}
        />
        <Text
          className="text-secondary"
          style={localizedType("supporting", locale)}
        >
          {skills ? t("introHint") : t("addSkillsFirst")}
        </Text>
        <Button
          label={suggested ? t("suggestAnotherIntro") : t("suggestIntro")}
          variant="text"
          labelStyle={fieldLabel}
          busy={drafting}
          disabled={!skills || busy}
          onPress={suggestIntro}
        />
        {draftFailed ? <ErrorText>{t("introDraftError")}</ErrorText> : null}
      </View>
      <View className="flex-row items-center gap-related-gap">
        <View className="flex-1">
          <Text style={fieldLabel}>{visibility.visibility}</Text>
          <Text
            className="text-secondary"
            style={localizedType("supporting", locale)}
          >
            {visibility.visibilityDetail}
          </Text>
        </View>
        <ActivityToggle
          label={visibility.visibility}
          hint={visibility.visibilityDetail}
          value={shareProfile}
          disabled={busy || drafting}
          onChange={setShareProfile}
        />
      </View>
      {failed ? <ErrorText>{t("saveError")}</ErrorText> : null}
    </OnboardingScreen>
  );
}
