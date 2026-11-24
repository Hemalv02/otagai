import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import {
  ConfirmSheet,
  ScopeToggleRow,
  SheetLine,
} from "@/components/family-forms";
import {
  AccountSkeleton,
  FamilyNotice,
  initial,
  ListRow,
  Thumbnail,
} from "@/components/family-ui";
import { Button, ErrorText } from "@/components/ui";
import { ApiError, type ProxyGrant } from "@/lib/api";
import { familyApi } from "@/lib/family-api";
import {
  GRANT_SCOPES,
  type ScopeChoice,
  scopeChanges,
  scopesOf,
} from "@/lib/family-consent";
import { familyConsentCopy } from "@/lib/family-consent-copy";
import { familyCopy } from "@/lib/family-copy";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useFamilyPermissions } from "@/lib/use-family-permissions";
import { colors, spacing } from "@/theme/tokens.json";

type Sheet =
  | { kind: "save"; changes: ReturnType<typeof scopeChanges> }
  | { kind: "end" }
  | null;

function findGrant(
  grantId: string,
  asMember: ProxyGrant[],
  asCaretaker: ProxyGrant[],
): { grant: ProxyGrant; viewerIsMember: boolean } | null {
  const mine = asMember.find((grant) => grant.id === grantId);
  if (mine) return { grant: mine, viewerIsMember: true };
  const helping = asCaretaker.find((grant) => grant.id === grantId);
  return helping ? { grant: helping, viewerIsMember: false } : null;
}

export default function GrantPermissionsScreen() {
  const { grantId } = useLocalSearchParams<{ grantId: string }>();
  const { locale } = useOnboardingText();
  const localizedType = useLocalizedType();
  const copy = familyConsentCopy[locale];
  const { sources, refresh, authUserId, selfName } = useFamilyPermissions();
  const [draft, setDraft] = useState<Partial<ScopeChoice>>({});
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [noChanges, setNoChanges] = useState(false);
  const label = localizedType("field-label", locale);

  if (sources.status === "loading") {
    return (
      <CommunityScreen back>
        <AccountSkeleton />
      </CommunityScreen>
    );
  }
  if (sources.status === "error") {
    return (
      <CommunityScreen back>
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
  const found = findGrant(grantId, sources.asMember, sources.asCaretaker);
  if (!found || !found.grant.other) {
    return (
      <CommunityScreen back>
        <FamilyNotice title={copy.grant.gone} locale={locale} />
        <Button
          label={copy.backToFamily}
          labelStyle={label}
          variant="outline"
          onPress={() => router.dismissTo("/family")}
        />
      </CommunityScreen>
    );
  }

  const { grant, viewerIsMember } = found;
  const other = grant.other ?? { id: "", display_name: "" };
  const me = selfName ?? "";
  const caretakerName = viewerIsMember ? other.display_name : me;
  const memberName = viewerIsMember ? me : other.display_name;
  const managed = !viewerIsMember && other.kind === "managed";
  const canEdit = viewerIsMember || grant.can_change_scopes === true;
  const saved = scopesOf(grant);
  const current = { ...saved, ...draft };

  async function save() {
    if (!authUserId || !canEdit || sheet?.kind !== "save" || submitting.current)
      return;
    submitting.current = true;
    setBusy(true);
    setProblem(null);
    try {
      await familyApi.updateScopes(
        grant.id,
        Object.fromEntries(
          sheet.changes.map((change) => [change.scope, change.enabled]),
        ),
        { authUserId },
      );
      setSheet(null);
      setDraft({});
      router.dismissTo("/family/permissions");
    } catch (caught) {
      const status = caught instanceof ApiError ? caught.status : 0;
      setProblem(
        status === 403
          ? copy.grant.notAllowed(memberName)
          : status === 404
            ? copy.grant.gone
            : copy.grant.saveFailed,
      );
      if (status === 403 || status === 404) void refresh();
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function endAccess() {
    if (!authUserId || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setProblem(null);
    try {
      await familyApi.endAccess(grant.id, { authUserId });
      setSheet(null);
      router.dismissTo("/family/permissions");
    } catch {
      setProblem(copy.actionFailed);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  function confirm() {
    const changes = scopeChanges(saved, draft);
    if (changes.length === 0) {
      setNoChanges(true);
      return;
    }
    setProblem(null);
    setSheet({ kind: "save", changes });
  }

  return (
    <CommunityScreen
      back
      title={
        viewerIsMember
          ? copy.grant.memberTitle(caretakerName)
          : copy.grant.caretakerTitle(memberName)
      }
      subtitle={
        viewerIsMember
          ? copy.grant.memberSubtitle(caretakerName)
          : managed
            ? canEdit
              ? copy.grant.managedSubtitle(memberName)
              : copy.grant.delegatedSubtitle(memberName)
            : copy.grant.caretakerSubtitle(memberName)
      }
      footer={
        canEdit ? (
          <Button
            label={copy.grant.confirm}
            labelStyle={localizedType("button", locale)}
            onPress={confirm}
          />
        ) : undefined
      }
    >
      <ListRow
        thumbnail={
          <Thumbnail
            letter={initial(memberName, locale)}
            shape="round"
            locale={locale}
          />
        }
        title={memberName}
        detail={
          viewerIsMember
            ? copy.grant.yourAccount
            : managed
              ? copy.grant.managedAccount
              : copy.grant.ownAccount
        }
        status=""
        locale={locale}
      />
      <View style={styles.list}>
        {GRANT_SCOPES.map((scope) => (
          <ScopeToggleRow
            key={scope}
            title={copy.scopes[scope].title}
            detail={copy.scopes[scope].detail(memberName)}
            value={current[scope]}
            onChange={(value) => {
              setNoChanges(false);
              setDraft((previous) => {
                const next = { ...previous };
                if (value === saved[scope]) delete next[scope];
                else next[scope] = value;
                return next;
              });
            }}
            disabled={!canEdit || busy}
            locale={locale}
          />
        ))}
      </View>
      {canEdit ? null : (
        <Text style={[localizedType("supporting", locale), styles.secondary]}>
          {managed
            ? copy.grant.readOnlyManaged(memberName)
            : copy.grant.readOnly(memberName)}
        </Text>
      )}
      {noChanges ? (
        <Text style={[localizedType("supporting", locale), styles.secondary]}>
          {copy.grant.noChanges}
        </Text>
      ) : null}
      {problem && sheet === null ? <ErrorText>{problem}</ErrorText> : null}
      <Button
        label={copy.grant.endAccess}
        labelStyle={label}
        variant="text"
        onPress={() => {
          setProblem(null);
          setSheet({ kind: "end" });
        }}
      />
      <ConfirmSheet
        visible={sheet?.kind === "save"}
        title={copy.grant.confirmTitle}
        confirmLabel={copy.grant.save}
        cancelLabel={copy.cancel}
        onConfirm={() => void save()}
        onCancel={() => setSheet(null)}
        busy={busy}
        disabled={!canEdit}
        locale={locale}
      >
        <SheetLine locale={locale}>
          {`${memberName} → ${caretakerName}`}
        </SheetLine>
        {sheet?.kind === "save"
          ? sheet.changes.map((change) => (
              <SheetLine key={change.scope} locale={locale}>
                {`• ${copy.effects[change.scope](caretakerName, memberName, change.enabled)}`}
              </SheetLine>
            ))
          : null}
        {problem ? <ErrorText>{problem}</ErrorText> : null}
      </ConfirmSheet>
      <ConfirmSheet
        visible={sheet?.kind === "end"}
        title={
          viewerIsMember
            ? copy.grant.endMemberTitle(caretakerName)
            : copy.grant.endCaretakerTitle(memberName)
        }
        confirmLabel={copy.grant.endAccess}
        cancelLabel={copy.cancel}
        onConfirm={() => void endAccess()}
        onCancel={() => setSheet(null)}
        busy={busy}
        locale={locale}
      >
        <SheetLine locale={locale}>
          {viewerIsMember
            ? copy.grant.endMemberBody(caretakerName)
            : copy.grant.endCaretakerBody(memberName)}
        </SheetLine>
        {problem ? <ErrorText>{problem}</ErrorText> : null}
      </ConfirmSheet>
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing["card-inset"] },
  secondary: { color: colors.secondary },
});
