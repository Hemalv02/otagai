import { Host, Picker } from "@expo/ui";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button, ErrorText } from "@/components/ui";
import type { ContentLanguage, Language } from "@/lib/api";
import { assistantCopy } from "@/lib/assistant-copy";
import { useLocalizedType } from "@/lib/onboarding-i18n";
import { draftLanguageNames, draftLanguages } from "@/lib/request-wording-copy";
import { colors, spacing } from "@/theme/tokens.json";

const copy = {
  en: {
    translated: "Translation",
    choose: "Translate to",
    hide: "Hide translation",
    error: "Could not translate. Try again.",
  },
  ja: {
    translated: "翻訳",
    choose: "翻訳先の言語",
    hide: "翻訳を閉じる",
    error: "翻訳できませんでした。もう一度お試しください。",
  },
  bn: {
    translated: "অনুবাদ",
    choose: "অনুবাদের ভাষা",
    hide: "অনুবাদ লুকান",
    error: "অনুবাদ করা যায়নি। আবার চেষ্টা করুন।",
  },
};

export function TranslationOption({
  locale,
  source,
  original,
  load,
  chooseLanguage = false,
}: {
  locale: Language;
  source: ContentLanguage | null;
  original: string;
  load: (target: ContentLanguage) => Promise<{ translated: string }>;
  chooseLanguage?: boolean;
}) {
  const style = useLocalizedType();
  const [result, setResult] = useState<{
    text: string;
    language: ContentLanguage;
  }>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const running = useRef(false);
  const words = assistantCopy[locale];
  const labels = copy[locale];
  if (!original.trim() || (!chooseLanguage && source === locale)) return null;

  async function translate(language: ContentLanguage) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const value = await load(language);
      setResult({ text: value.translated, language });
    } catch {
      setFailed(true);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <View style={styles.translation}>
      {result !== undefined ? (
        <>
          <Text style={[style("supporting", locale), styles.label]}>
            {labels.translated} · {draftLanguageNames[result.language]}
          </Text>
          <Text
            selectable
            style={[style("body", result.language), styles.text]}
          >
            {result.text}
          </Text>
        </>
      ) : null}
      {failed ? <ErrorText>{labels.error}</ErrorText> : null}
      {chooseLanguage && !result && !busy ? (
        <Host matchContents seedColor={colors.action}>
          <Picker<ContentLanguage | "">
            appearance="menu"
            accessibilityLabel={labels.choose}
            selectedValue=""
            onValueChange={(language) => {
              if (language) void translate(language);
            }}
          >
            <Picker.Item value="" label={words.translate} />
            {draftLanguages
              .filter((language) => language !== source)
              .map((language) => (
                <Picker.Item
                  key={language}
                  value={language}
                  label={draftLanguageNames[language]}
                />
              ))}
          </Picker>
        </Host>
      ) : (
        <Button
          variant="text"
          label={result ? labels.hide : words.translate}
          labelStyle={style("field-label", locale)}
          busy={busy}
          onPress={() => {
            if (result) setResult(undefined);
            else void translate(locale);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  translation: { gap: spacing["related-gap"], alignItems: "flex-start" },
  label: { color: colors.secondary },
  text: { color: colors.ink },
});
