import { router } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { ScopeToggleRow, SelectionCard } from "@/components/family-forms";
import { initial, ListRow, Thumbnail } from "@/components/family-ui";
import { Button, Choice, ErrorText, Field } from "@/components/ui";
import { ApiError, type ContentLanguage, type Region } from "@/lib/api";
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
import { managedCircleCopy } from "@/lib/managed-circle-copy";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, spacing } from "@/theme/tokens.json";

const NAME_LIMIT = 80;
const languageOptions = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
  { value: "bn", label: "বাংলা" },
  { value: "vi", label: "Tiếng Việt" },
] as const;

type Step = "details" | "review";
type CaretakerRole = "family" | "welfare_volunteer";

const caretakerCopy = {
  en: {
    role: "Your role",
    family: "Family member",
    welfare_volunteer: "Welfare volunteer",
    attestation: "I received their consent",
    detail:
      "I explained these permissions and the person agreed to let me help.",
  },
  ja: {
    role: "あなたの立場",
    family: "家族",
    welfare_volunteer: "福祉ボランティア",
    attestation: "ご本人の同意を得ました",
    detail: "この権限について説明し、支援することにご本人の同意を得ました。",
  },
  bn: {
    role: "আপনার ভূমিকা",
    family: "পরিবারের সদস্য",
    welfare_volunteer: "সমাজকল্যাণ স্বেচ্ছাসেবক",
    attestation: "আমি তাঁর সম্মতি পেয়েছি",
    detail: "আমি এই অনুমতিগুলো বুঝিয়ে বলেছি এবং তিনি আমার সহায়তায় সম্মতি দিয়েছেন।",
  },
};

export default function AddFamilyMemberScreen() {
  const { locale } = useOnboardingText();
  const localizedType = useLocalizedType();
  const copy = familyConsentCopy[locale];
  const roles = caretakerCopy[locale];
  const { session, profile } = useSession();
  const [step, setStep] = useState<Step>("details");
  const [createdMember, setCreatedMember] = useState<{
    id: string;
    display_name: string;
  } | null>(null);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<ContentLanguage>(locale);
  const [region, setRegion] = useState<Region>(
    profile.status === "ready" ? profile.profile.region : "jp",
  );
  const [role, setRole] = useState<CaretakerRole>("family");
  const [attested, setAttested] = useState(false);
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
    if (
      !authUserId ||
      submitting.current ||
      failure === "unsure" ||
      (role === "welfare_volunteer" && !attested)
    )
      return;
    submitting.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const { user } = await familyApi.createManagedMember(
        {
          display_name: trimmed,
          preferred_language: language,
          region,
          grant: {
            caretaker_role: role,
            consent_method: consent,
            scopes: explicitScopes(scopes),
          },
        },
        { authUserId },
      );
      setCreatedMember(user);
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

  if (createdMember) {
    return (
      <CommunityScreen
        title={copy.add.doneTitle(createdMember.display_name)}
        subtitle={copy.add.doneBody(createdMember.display_name)}
      >
        <Button
          label={managedCircleCopy[locale].joinFor(createdMember.display_name)}
          labelStyle={button}
          onPress={() =>
            router.replace({
              pathname: "/family/circles/[memberId]",
              params: { memberId: createdMember.id },
            })
          }
        />
        <Button
          label={copy.backToFamily}
          labelStyle={label}
          variant="outline"
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
          detail={`${roles[role]} · ${copy.consent[consent].title}`}
          status=""
          locale={locale}
        />
        <View style={styles.list}>
          {role === "welfare_volunteer" ? (
            <ScopeToggleRow
              title={roles.attestation}
              detail={roles.detail}
              value={attested}
              onChange={setAttested}
              disabled={busy || failure === "unsure"}
              locale={locale}
            />
          ) : null}
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
      <Text style={[label, styles.ink]}>{roles.role}</Text>
      <Choice
        options={[
          { value: "family", label: roles.family },
          { value: "welfare_volunteer", label: roles.welfare_volunteer },
        ]}
        value={role}
        onChange={(value) => {
          setRole(value);
          setAttested(false);
        }}
      />
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
