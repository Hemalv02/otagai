import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button, Choice, ErrorText } from "@/components/ui";
import type { ContentLanguage, Language } from "@/lib/api";
import { assistantCopy } from "@/lib/assistant-copy";
import { useLocalizedType } from "@/lib/onboarding-i18n";
import { draftLanguageNames, draftLanguages } from "@/lib/request-wording-copy";
import { colors, spacing } from "@/theme/tokens.json";

const copy = {
  en: {
    translated: "Translation",
    choose: "Translate to",
    error: "Could not translate. Try again.",
  },
  ja: {
    translated: "翻訳",
    choose: "翻訳先の言語",
    error: "翻訳できませんでした。もう一度お試しください。",
  },
  bn: {
    translated: "অনুবাদ",
    choose: "অনুবাদের ভাষা",
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
  const [choosing, setChoosing] = useState(false);
  const [target, setTarget] = useState<ContentLanguage>(
    locale === source ? "en" : locale,
  );
  const [result, setResult] = useState<string>();
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
      setResult(value.translated);
      setChoosing(false);
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
            {labels.translated}
          </Text>
          <Text selectable style={[style("body", locale), styles.text]}>
            {result}
          </Text>
        </>
      ) : null}
      {choosing && result === undefined ? (
        <>
          <Text style={[style("field-label", locale), styles.label]}>
            {labels.choose}
          </Text>
          <Choice
            options={draftLanguages
              .filter((value) => value !== source)
              .map((value) => ({ value, label: draftLanguageNames[value] }))}
            value={target}
            onChange={setTarget}
          />
        </>
      ) : null}
      {failed ? <ErrorText>{labels.error}</ErrorText> : null}
      <Button
        variant="text"
        label={result !== undefined ? words.original : words.translate}
        labelStyle={style("field-label", locale)}
        busy={busy}
        onPress={() => {
          if (result !== undefined) setResult(undefined);
          else if (chooseLanguage && !choosing) {
            setTarget(
              source === locale ? (source === "en" ? "ja" : "en") : locale,
            );
            setChoosing(true);
          } else void translate(chooseLanguage ? target : locale);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  translation: { gap: spacing["related-gap"], alignItems: "flex-start" },
  label: { color: colors.secondary },
  text: { color: colors.ink },
});
