import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button, Choice, ErrorText } from "@/components/ui";
import type { ContentLanguage, Language } from "@/lib/api";
import { useLocalizedType } from "@/lib/onboarding-i18n";
import {
  draftLanguageNames,
  draftLanguages,
  wordingCopy,
} from "@/lib/request-wording-copy";
import {
  draftRelationships,
  type DraftRelationship,
  type RequestWording,
  type WordingInput,
  type WordingSource,
} from "@/lib/request-wording";
import { colors, controls, spacing } from "@/theme/tokens.json";

type LanguageChoice = ContentLanguage | "member";

export function RequestWordingReview({
  locale,
  defaultLanguage,
  source,
  generate,
  onApply,
  initialRelationship = "neighbor",
  disabled = false,
}: {
  locale: Language;
  defaultLanguage: LanguageChoice;
  source: WordingSource;
  generate: (
    input: WordingInput,
    signal: AbortSignal,
  ) => Promise<RequestWording>;
  onApply: (wording: RequestWording) => void;
  initialRelationship?: DraftRelationship;
  disabled?: boolean;
}) {
  const copy = wordingCopy[locale];
  const localizedType = useLocalizedType();
  const label = localizedType("field-label", locale);
  const [open, setOpen] = useState(false);
  const [relationship, setRelationship] = useState(initialRelationship);
  const [language, setLanguage] = useState(defaultLanguage);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState<{
    input: string;
    wording: RequestWording;
  } | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [],
  );
  const input: WordingInput = {
    ...source,
    relationship,
    ...(language === "member" ? {} : { language }),
  };
  const sourceKey = JSON.stringify(input);
  const result = preview?.input === sourceKey ? preview.wording : null;
  const languages = draftLanguages.map<{
    value: LanguageChoice;
    label: string;
  }>((value) => ({
    value,
    label: draftLanguageNames[value],
  }));
  if (defaultLanguage === "member") {
    languages.unshift({ value: "member", label: copy.memberLanguage });
  }

  async function makePreview() {
    if (request.current || disabled || !source.text.trim()) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setFailed(false);
    setPreview(null);
    const timeout = setTimeout(() => {
      if (request.current === controller) {
        request.current = null;
        controller.abort();
        setFailed(true);
        setBusy(false);
      }
    }, 45_000);
    try {
      const wording = await generate(input, controller.signal);
      if (!controller.signal.aborted) {
        setPreview({ input: sourceKey, wording });
      }
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }

  function close() {
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setFailed(false);
    setPreview(null);
    setOpen(false);
  }

  if (!open) {
    return (
      <Button
        label={copy.rewrite}
        labelStyle={label}
        variant="outline"
        disabled={disabled || !source.text.trim()}
        onPress={() => {
          setRelationship(initialRelationship);
          setLanguage(defaultLanguage);
          setOpen(true);
        }}
      />
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={[label, styles.ink]}>{copy.relationship}</Text>
      <Choice
        options={draftRelationships.map((value) => ({
          value,
          label: copy.relationships[value],
        }))}
        value={relationship}
        disabled={disabled || busy}
        labelStyle={() => label}
        onChange={setRelationship}
      />
      <Text style={[label, styles.ink]}>{copy.language}</Text>
      <Choice
        options={languages}
        value={language}
        disabled={disabled || busy}
        labelStyle={(value) =>
          value === "member" ? label : localizedType("field-label", value)
        }
        onChange={setLanguage}
      />
      <Button
        label={copy.generate}
        labelStyle={label}
        variant="outline"
        disabled={disabled || !source.text.trim()}
        busy={busy}
        onPress={() => void makePreview()}
      />
      {result ? (
        <View style={styles.panel}>
          {source.title ? (
            <Text
              style={[localizedType("card-title", result.language), styles.ink]}
            >
              {result.title}
            </Text>
          ) : null}
          <Text
            selectable
            style={[localizedType("body", result.language), styles.ink]}
          >
            {result.message}
            {result.when_text ? `\n\n${result.when_text}` : ""}
          </Text>
          <Button
            label={copy.use}
            labelStyle={label}
            variant="secondary"
            disabled={disabled}
            onPress={() => {
              onApply(result);
              close();
            }}
          />
        </View>
      ) : null}
      {failed ? <ErrorText>{copy.failed}</ErrorText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing["related-gap"],
    padding: spacing["card-inset"],
    borderRadius: controls.radius,
    backgroundColor: colors.paper,
  },
  ink: { color: colors.ink },
});
