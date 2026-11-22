import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Choice, ErrorText, Field } from "@/components/ui";
import { ApiError, api, type Language, type Region } from "@/lib/api";
import { useSession } from "@/lib/session";

const languages = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
  { value: "bn", label: "বাংলা" },
] as const;

const regions = [
  { value: "jp", label: "Japan" },
  { value: "bd", label: "Bangladesh" },
] as const;

export default function ProfileSetup() {
  const { setProfile, reloadProfile, signOut } = useSession();
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<Language>("ja");
  const [region, setRegion] = useState<Region>("jp");
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
        <Text className="type-screen-title text-ink">About you</Text>
        <Text className="type-body text-secondary">
          Your neighbours will see this name.
        </Text>
        <Field
          label="Name"
          value={name}
          onChangeText={setName}
          maxLength={80}
          autoComplete="name"
          placeholder="Tanaka Hanako"
        />
        <View className="gap-related-gap">
          <Text className="type-body text-secondary">Language</Text>
          <Choice options={languages} value={language} onChange={setLanguage} />
        </View>
        <View className="gap-related-gap">
          <Text className="type-body text-secondary">Where you live</Text>
          <Choice options={regions} value={region} onChange={setRegion} />
        </View>
        <Field
          label="Happy to help with (optional)"
          value={helpWith}
          onChangeText={setHelpWith}
          maxLength={500}
          multiline
          placeholder="Gardening, carrying shopping, Japanese forms"
        />
        <ErrorText>{error}</ErrorText>
        <Button
          label="Continue"
          onPress={save}
          busy={busy}
          disabled={name.trim().length === 0}
        />
        <Button label="Sign out" variant="secondary" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}
