import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import {
  ConfirmSheet,
  ScopeToggleRow,
  SelectionCard,
  SheetLine,
} from "@/components/family-forms";
import { AccountSkeleton, FamilyNotice } from "@/components/family-ui";
import { Button, ErrorText } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { familyApi } from "@/lib/family-api";
import {
  CONSENT_METHODS,
  type ConsentMethod,
  DEFAULT_SCOPES,
  explicitScopes,
  GRANT_SCOPES,
  grantCandidates,
  type ScopeChoice,
} from "@/lib/family-consent";
import { familyConsentCopy } from "@/lib/family-consent-copy";
import { familyCopy } from "@/lib/family-copy";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useFamilyPermissions } from "@/lib/use-family-permissions";
import { colors, spacing } from "@/theme/tokens.json";

export default function GiveAccessScreen() {
  const { locale } = useOnboardingText();
  const copy = familyConsentCopy[locale];
  const { sources, refresh, authUserId, selfId, selfName } =
    useFamilyPermissions();
  const [personId, setPersonId] = useState<string | null>(null);
  const [consent, setConsent] = useState<ConsentMethod>("in_person");
  const [scopes, setScopes] = useState<ScopeChoice>(DEFAULT_SCOPES);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const heading = [localizedType("section-heading", locale), styles.ink];

  if (sources.status === "loading" || !selfId) {
    return (
      <CommunityScreen back showDemoPreview={false}>
        <AccountSkeleton />
      </CommunityScreen>
    );
  }
  if (sources.status === "error") {
    return (
      <CommunityScreen back showDemoPreview={false}>
        <FamilyNotice
          tone="alert"
          title={copy.actionFailed}
          actionLabel={familyCopy[locale].retry}
          onAction={() => void refresh()}
          locale={locale}
        />
      </CommunityScreen>
    );
  }

  const candidates = grantCandidates(sources.links, sources.asMember);
  const person = candidates.find((item) => item.id === personId) ?? null;
  const enabled = GRANT_SCOPES.filter((scope) => scopes[scope]);
  const me = selfName ?? "";

  async function give() {
    if (!person || !authUserId || !selfId) return;
    setBusy(true);
    setProblem(null);
    try {
      await familyApi.giveAccess(
        selfId,
        person.id,
        consent,
        explicitScopes(scopes),
        { authUserId },
      );
      setConfirming(false);
      router.back();
    } catch (caught) {
      const status = caught instanceof ApiError ? caught.status : 0;
      setProblem(status === 409 ? copy.give.exists : copy.actionFailed);
      if (status === 409) void refresh();
    } finally {
      setBusy(false);
    }
  }

  if (candidates.length === 0) {
    return (
      <CommunityScreen
        back
        title={copy.give.title}
        subtitle={copy.give.subtitle}
        showDemoPreview={false}
      >
        <FamilyNotice title={copy.give.noCandidates} locale={locale} />
      </CommunityScreen>
    );
  }

  return (
    <CommunityScreen
      back
      title={person ? copy.give.reviewTitle(person.name) : copy.give.title}
      subtitle={
        person ? copy.give.reviewSubtitle(person.name) : copy.give.subtitle
      }
      showDemoPreview={false}
      footer={
        <>
          {person && enabled.length === 0 ? (
            <Text
              style={[localizedType("supporting", locale), styles.secondary]}
            >
              {copy.give.noneSelected}
            </Text>
          ) : null}
          <Button
            label={copy.give.give}
            labelStyle={localizedType("button", locale)}
            disabled={!person || enabled.length === 0}
            onPress={() => {
              setProblem(null);
              setConfirming(true);
            }}
          />
        </>
      }
    >
      <Text accessibilityRole="header" style={heading}>
        {copy.give.chooseWho}
      </Text>
      <View accessibilityRole="radiogroup" style={styles.list}>
        {candidates.map((candidate) => (
          <SelectionCard
            key={candidate.id}
            title={candidate.name}
            selected={candidate.id === personId}
            onPress={() => setPersonId(candidate.id)}
            locale={locale}
          />
        ))}
      </View>
      <Text accessibilityRole="header" style={heading}>
        {copy.give.consentHeading}
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
      <View style={styles.scopes}>
        {GRANT_SCOPES.map((scope) => (
          <ScopeToggleRow
            key={scope}
            title={copy.scopes[scope].title}
            detail={copy.scopes[scope].detail(me)}
            value={scopes[scope]}
            onChange={(value) =>
              setScopes((previous) => ({ ...previous, [scope]: value }))
            }
            locale={locale}
          />
        ))}
      </View>
      {problem && !confirming ? <ErrorText>{problem}</ErrorText> : null}
      <ConfirmSheet
        visible={confirming && person !== null}
        title={person ? copy.give.confirmTitle(person.name) : ""}
        confirmLabel={copy.give.give}
        cancelLabel={copy.cancel}
        onConfirm={() => void give()}
        onCancel={() => setConfirming(false)}
        busy={busy}
        locale={locale}
      >
        <SheetLine locale={locale}>
          {`${copy.consent[consent].title} · ${me}`}
        </SheetLine>
        {enabled.map((scope) => (
          <SheetLine key={scope} locale={locale}>
            {`• ${copy.effects[scope](person?.name ?? "", me, true)}`}
          </SheetLine>
        ))}
        {problem ? <ErrorText>{problem}</ErrorText> : null}
      </ConfirmSheet>
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing["related-gap"] },
  scopes: { gap: spacing["card-inset"] },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
});
