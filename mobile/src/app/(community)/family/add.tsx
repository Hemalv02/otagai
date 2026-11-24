import { router } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { ScopeToggleRow, SelectionCard } from "@/components/family-forms";
import { initial, ListRow, Thumbnail } from "@/components/family-ui";
import { Button, Choice, ErrorText, Field } from "@/components/ui";
import { ApiError, type Language, type Region } from "@/lib/api";
import { familyApi } from "@/lib/family-api";
import {
  CONSENT_METHODS,
  type ConsentMethod,
  DEFAULT_SCOPES,
  explicitScopes,
  GRANT_SCOPES,
  isUnconfirmedWrite,
  type ScopeChoice,
} from "@/lib/family-consent";
import { familyConsentCopy } from "@/lib/family-consent-copy";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, spacing } from "@/theme/tokens.json";

const NAME_LIMIT = 80;
const languageOptions = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
  { value: "bn", label: "বাংলা" },
] as const;

type Step = "details" | "review" | "done";

export default function AddFamilyMemberScreen() {
  const { locale } = useOnboardingText();
  const localizedType = useLocalizedType();
  const copy = familyConsentCopy[locale];
  const { session, profile } = useSession();
  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<Language>(locale);
  const [region, setRegion] = useState<Region>(
    profile.status === "ready" ? profile.profile.region : "jp",
  );
  const [consent, setConsent] = useState<ConsentMethod>("in_person");
  const [scopes, setScopes] = useState<ScopeChoice>(DEFAULT_SCOPES);
  const [nameMissing, setNameMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [failure, setFailure] = useState<"failed" | "unsure" | null>(null);
  const trimmed = name.trim();
  const label = localizedType("field-label", locale);
  const button = localizedType("button", locale);

  function review() {
    if (!trimmed) {
      setNameMissing(true);
      return;
    }
    setNameMissing(false);
    setStep("review");
  }

  async function create() {
    const authUserId = session?.user.id;
    if (!authUserId || submitting.current || failure === "unsure") return;
    submitting.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await familyApi.createManagedMember(
        {
          display_name: trimmed,
          preferred_language: language,
          region,
          grant: {
            caretaker_role: "family",
            consent_method: consent,
            scopes: explicitScopes(scopes),
          },
        },
        { authUserId },
      );
      setStep("done");
    } catch (caught) {
      setFailure(
        isUnconfirmedWrite(caught instanceof ApiError ? caught.status : 0)
          ? "unsure"
          : "failed",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (step === "done") {
    return (
      <CommunityScreen
        title={copy.add.doneTitle(trimmed)}
        subtitle={copy.add.doneBody(trimmed)}
      >
        <Button
          label={copy.backToFamily}
          labelStyle={button}
          onPress={() => router.dismissTo("/family")}
        />
      </CommunityScreen>
    );
  }

  if (step === "review") {
    return (
      <CommunityScreen
        title={copy.add.reviewTitle(trimmed)}
        subtitle={copy.add.reviewSubtitle(trimmed)}
        footer={
          <>
            {failure ? <ErrorText>{copy.add[failure]}</ErrorText> : null}
            {failure === "unsure" ? (
              <Button
                label={copy.backToFamily}
                labelStyle={button}
                onPress={() => router.dismissTo("/family")}
              />
            ) : (
              <>
                <Button
                  label={copy.add.create}
                  labelStyle={button}
                  busy={busy}
                  onPress={() => void create()}
                />
                <Button
                  label={copy.add.editDetails}
                  labelStyle={label}
                  variant="outline"
                  disabled={busy}
                  onPress={() => setStep("details")}
                />
              </>
            )}
          </>
        }
      >
        <ListRow
          thumbnail={
            <Thumbnail
              letter={initial(trimmed, locale)}
              shape="round"
              locale={locale}
            />
          }
          title={trimmed}
          detail={`${copy.add.consentGiven}: ${copy.consent[consent].title}`}
          status=""
          locale={locale}
        />
        <View style={styles.list}>
          {GRANT_SCOPES.map((scope) => (
            <ScopeToggleRow
              key={scope}
              title={copy.scopes[scope].title}
              detail={copy.scopes[scope].detail(trimmed)}
              value={scopes[scope]}
              onChange={(value) =>
                setScopes((current) => ({ ...current, [scope]: value }))
              }
              disabled={busy || failure === "unsure"}
              locale={locale}
            />
          ))}
        </View>
      </CommunityScreen>
    );
  }

  return (
    <CommunityScreen
      back
      keyboard
      title={copy.add.title}
      subtitle={copy.add.subtitle}
      footer={
        <Button
          label={copy.add.reviewPermissions}
          labelStyle={button}
          onPress={review}
        />
      }
    >
      <View style={styles.field}>
        <Field
          label={copy.add.fullName}
          labelStyle={label}
          style={localizedType("body", locale)}
          value={name}
          onChangeText={(value) => {
            setName(value);
            if (value.trim()) setNameMissing(false);
          }}
          maxLength={NAME_LIMIT}
          autoComplete="off"
        />
        {nameMissing ? <ErrorText>{copy.add.nameRequired}</ErrorText> : null}
      </View>
      <Text style={[label, styles.ink]}>{copy.add.language}</Text>
      <Choice
        options={languageOptions}
        value={language}
        onChange={setLanguage}
      />
      <Text style={[label, styles.ink]}>{copy.add.region}</Text>
      <Choice
        options={[
          { value: "jp", label: copy.regions.jp },
          { value: "bd", label: copy.regions.bd },
        ]}
        value={region}
        onChange={setRegion}
      />
      <Text
        accessibilityRole="header"
        style={[localizedType("section-heading", locale), styles.ink]}
      >
        {copy.add.consentHeading}
      </Text>
      <View accessibilityRole="radiogroup" style={styles.list}>
        {CONSENT_METHODS.map((method) => (
          <SelectionCard
            key={method}
            title={copy.consent[method].title}
            detail={copy.consent[method].detail}
            selected={consent === method}
            onPress={() => setConsent(method)}
            locale={locale}
          />
        ))}
      </View>
      <Button
        label={copy.add.linkExisting}
        labelStyle={label}
        variant="text"
        onPress={() => router.push("/family/link")}
      />
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  field: { gap: 4 },
  list: { gap: spacing["related-gap"] },
  ink: { color: colors.ink },
});
