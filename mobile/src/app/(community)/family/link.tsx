import { router } from "expo-router";
import { useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { SelectionCard } from "@/components/family-forms";
import { Button, ErrorText, Field } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { familyApi } from "@/lib/family-api";
import {
  FAMILY_RELATIONS,
  type FamilyRelation,
  normalizeMemberId,
} from "@/lib/family-consent";
import { familyConsentCopy } from "@/lib/family-consent-copy";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, controls, spacing } from "@/theme/tokens.json";

type LinkError = "invalid" | "self" | "notFound" | "exists" | "failed";

export default function LinkFamilyAccountScreen() {
  const { locale } = useOnboardingText();
  const localizedType = useLocalizedType();
  const copy = familyConsentCopy[locale];
  const { session, profile } = useSession();
  const selfId = profile.status === "ready" ? profile.profile.id : null;
  const [theirId, setTheirId] = useState("");
  const [relation, setRelation] = useState<FamilyRelation>("parent");
  const [error, setError] = useState<LinkError | null>(null);
  const [shareFailed, setShareFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const label = localizedType("field-label", locale);
  const button = localizedType("button", locale);
  const errors: Record<LinkError, string> = {
    invalid: copy.link.invalidId,
    self: copy.link.self,
    notFound: copy.link.notFound,
    exists: copy.link.exists,
    failed: copy.actionFailed,
  };

  async function shareId() {
    if (!selfId) return;
    setShareFailed(false);
    try {
      await Share.share({ message: copy.link.shareMessage(selfId) });
    } catch {
      setShareFailed(true);
    }
  }

  async function send() {
    const memberId = normalizeMemberId(theirId);
    const authUserId = session?.user.id;
    if (!memberId) return setError("invalid");
    if (memberId === selfId) return setError("self");
    if (!authUserId) return;
    setBusy(true);
    setError(null);
    try {
      await familyApi.linkFamily(memberId, relation, { authUserId });
      setSent(true);
    } catch (caught) {
      const status = caught instanceof ApiError ? caught.status : 0;
      setError(
        status === 404
          ? "notFound"
          : status === 409
            ? "exists"
            : status === 400
              ? "self"
              : "failed",
      );
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <CommunityScreen
        title={copy.link.sentTitle}
        subtitle={copy.link.sentBody}
      >
        <Button
          label={copy.backToFamily}
          labelStyle={button}
          onPress={() => router.dismissTo("/family")}
        />
      </CommunityScreen>
    );
  }

  return (
    <CommunityScreen
      back
      keyboard
      title={copy.link.title}
      subtitle={copy.link.subtitle}
      footer={
        <Button
          label={copy.link.send}
          labelStyle={button}
          busy={busy}
          disabled={!theirId.trim()}
          onPress={() => void send()}
        />
      }
    >
      <View style={styles.idCard}>
        <Text style={[label, styles.ink]}>{copy.link.yourId}</Text>
        <Text
          selectable
          accessibilityLabel={`${copy.link.yourId}: ${selfId ?? ""}`}
          style={[localizedType("body", locale), styles.ink, styles.id]}
        >
          {selfId ?? ""}
        </Text>
        <Text style={[localizedType("supporting", locale), styles.secondary]}>
          {copy.link.yourIdHint}
        </Text>
        <Button
          label={copy.link.share}
          labelStyle={label}
          variant="outline"
          disabled={!selfId}
          onPress={() => void shareId()}
        />
        {shareFailed ? <ErrorText>{copy.link.shareFailed}</ErrorText> : null}
      </View>
      <View style={styles.field}>
        <Field
          label={copy.link.theirId}
          labelStyle={label}
          style={localizedType("body", locale)}
          value={theirId}
          onChangeText={(value) => {
            setTheirId(value);
            setError(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          maxLength={64}
        />
        <Text style={[localizedType("supporting", locale), styles.secondary]}>
          {copy.link.theirIdHint}
        </Text>
        {error ? <ErrorText>{errors[error]}</ErrorText> : null}
      </View>
      <Text
        accessibilityRole="header"
        style={[localizedType("section-heading", locale), styles.ink]}
      >
        {copy.link.relation}
      </Text>
      <View accessibilityRole="radiogroup" style={styles.list}>
        {FAMILY_RELATIONS.map((value) => (
          <SelectionCard
            key={value}
            title={copy.relations[value]}
            selected={relation === value}
            onPress={() => setRelation(value)}
            disabled={busy}
            locale={locale}
          />
        ))}
      </View>
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  idCard: {
    gap: spacing["related-gap"],
    padding: spacing["card-inset"],
    borderRadius: controls.radius,
    backgroundColor: colors.paper,
  },
  id: { fontVariant: ["tabular-nums"] },
  field: { gap: 4 },
  list: { gap: spacing["related-gap"] },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
});
