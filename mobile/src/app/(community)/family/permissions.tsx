import { router } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { ConfirmSheet, SheetLine } from "@/components/family-forms";
import {
  type ReviewedLink,
  LinkReviewSheet,
} from "@/components/family-link-sheet";
import {
  AccountSkeleton,
  FamilyNotice,
  initial,
  ListRow,
  Thumbnail,
} from "@/components/family-ui";
import { Button, ErrorText } from "@/components/ui";
import type { FamilyLink, Language } from "@/lib/api";
import { familyApi } from "@/lib/family-api";
import {
  buildPermissions,
  GRANT_SCOPES,
  grantCandidates,
  type PermissionRow,
} from "@/lib/family-consent";
import { familyConsentCopy } from "@/lib/family-consent-copy";
import { familyCopy } from "@/lib/family-copy";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useFamilyPermissions } from "@/lib/use-family-permissions";
import { colors, spacing } from "@/theme/tokens.json";

export default function FamilyPermissionsScreen() {
  const { locale } = useOnboardingText();
  const localizedType = useLocalizedType();
  const copy = familyConsentCopy[locale];
  const { sources, refresh, authUserId, selfId } = useFamilyPermissions();
  const [refreshing, setRefreshing] = useState(false);
  const [reviewing, setReviewing] = useState<ReviewedLink | null>(null);
  const [ending, setEnding] = useState<ReviewedLink | null>(null);
  const [endBusy, setEndBusy] = useState(false);
  const [endFailed, setEndFailed] = useState(false);
  const ready = sources.status === "ready" && selfId ? sources : null;
  const permissions = ready
    ? buildPermissions(selfId ?? "", ready.asMember, ready.asCaretaker)
    : null;
  const candidates = ready ? grantCandidates(ready.links, ready.asMember) : [];

  async function pullRefresh() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  async function endLink() {
    if (!ending || !authUserId) return;
    setEndBusy(true);
    setEndFailed(false);
    try {
      await familyApi.endLink(ending.id, { authUserId });
      setEnding(null);
      void refresh();
    } catch {
      setEndFailed(true);
    } finally {
      setEndBusy(false);
    }
  }

  return (
    <CommunityScreen
      back
      title={copy.permissions.title}
      subtitle={copy.permissions.subtitle}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void pullRefresh()}
          tintColor={colors.action}
          colors={[colors.action]}
        />
      }
    >
      {sources.status === "error" ? (
        <FamilyNotice
          tone="alert"
          title={copy.actionFailed}
          actionLabel={familyCopy[locale].retry}
          onAction={() => void refresh()}
          locale={locale}
        />
      ) : !ready || !permissions ? (
        <AccountSkeleton />
      ) : (
        <>
          {ready.refreshFailed ? (
            <ErrorText>{copy.actionFailed}</ErrorText>
          ) : null}
          <GrantSection
            title={copy.permissions.actsForMe}
            empty={copy.permissions.actsForMeEmpty}
            rows={permissions.actsForMe}
            locale={locale}
          />
          <Button
            label={copy.permissions.giveAccess}
            labelStyle={localizedType("field-label", locale)}
            variant="outline"
            disabled={candidates.length === 0}
            onPress={() => router.push("/family/permissions/new")}
          />
          {candidates.length === 0 ? (
            <Text
              style={[localizedType("supporting", locale), styles.secondary]}
            >
              {copy.give.noCandidates}
            </Text>
          ) : null}
          <GrantSection
            title={copy.permissions.iHelp}
            empty={copy.permissions.iHelpEmpty}
            rows={permissions.iHelp}
            locale={locale}
          />
          <LinkSection
            links={ready.links}
            selfId={selfId ?? ""}
            onReview={setReviewing}
            onEnd={(link) => {
              setEndFailed(false);
              setEnding(link);
            }}
            locale={locale}
          />
        </>
      )}
      <LinkReviewSheet
        link={reviewing}
        authUserId={authUserId}
        onClose={() => setReviewing(null)}
        onChanged={() => void refresh()}
        locale={locale}
      />
      <ConfirmSheet
        visible={ending !== null}
        title={ending ? copy.permissions.endLinkTitle(ending.name) : ""}
        confirmLabel={copy.permissions.endLink}
        cancelLabel={copy.cancel}
        onConfirm={() => void endLink()}
        onCancel={() => setEnding(null)}
        busy={endBusy}
        locale={locale}
      >
        <SheetLine locale={locale}>{copy.permissions.endLinkBody}</SheetLine>
        {endFailed ? <ErrorText>{copy.actionFailed}</ErrorText> : null}
      </ConfirmSheet>
    </CommunityScreen>
  );
}

function GrantSection({
  title,
  empty,
  rows,
  locale,
}: {
  title: string;
  empty: string;
  rows: PermissionRow[];
  locale: Language;
}) {
  const localizedType = useLocalizedType();
  const copy = familyConsentCopy[locale];
  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        style={[localizedType("section-heading", locale), styles.ink]}
      >
        {title}
      </Text>
      {rows.length === 0 ? (
        <Text style={[localizedType("supporting", locale), styles.secondary]}>
          {empty}
        </Text>
      ) : (
        rows.map((row) => {
          const enabled = GRANT_SCOPES.filter((scope) => row.scopes[scope]);
          const summary = enabled.length
            ? enabled.map((scope) => copy.scopeShort[scope]).join(" · ")
            : copy.permissions.noScopes;
          const status = row.canEdit
            ? copy.permissions.edit
            : copy.permissions.view;
          return (
            <Pressable
              key={row.grantId}
              accessibilityRole="button"
              accessibilityLabel={`${row.name}, ${summary}, ${status}`}
              onPress={() =>
                router.push({
                  pathname: "/family/permissions/[grantId]",
                  params: { grantId: row.grantId },
                })
              }
              className="active:opacity-70"
            >
              <ListRow
                thumbnail={
                  <Thumbnail
                    letter={initial(row.name, locale)}
                    shape="round"
                    locale={locale}
                  />
                }
                title={row.name}
                detail={summary}
                status={status}
                locale={locale}
              />
            </Pressable>
          );
        })
      )}
    </View>
  );
}

function LinkSection({
  links,
  selfId,
  onReview,
  onEnd,
  locale,
}: {
  links: FamilyLink[];
  selfId: string;
  onReview: (link: ReviewedLink) => void;
  onEnd: (link: ReviewedLink) => void;
  locale: Language;
}) {
  const localizedType = useLocalizedType();
  const copy = familyConsentCopy[locale];
  const visible = links.filter(
    (link) => link.status !== "revoked" && link.other,
  );
  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        style={[localizedType("section-heading", locale), styles.ink]}
      >
        {copy.permissions.links}
      </Text>
      {visible.length === 0 ? (
        <Text style={[localizedType("supporting", locale), styles.secondary]}>
          {copy.permissions.linksEmpty}
        </Text>
      ) : (
        visible.map((link) => {
          const name = link.other?.display_name ?? "";
          const incoming =
            link.status === "pending" && link.relative_user_id === selfId;
          const state =
            link.status === "accepted"
              ? copy.permissions.linkState.accepted
              : incoming
                ? copy.permissions.linkState.pendingIn
                : copy.permissions.linkState.pendingOut;
          const status = incoming ? copy.home.review : copy.permissions.endLink;
          return (
            <Pressable
              key={link.id}
              accessibilityRole="button"
              accessibilityLabel={`${name}, ${state}, ${status}`}
              onPress={() =>
                incoming
                  ? onReview({ id: link.id, name })
                  : onEnd({ id: link.id, name })
              }
              className="active:opacity-70"
            >
              <ListRow
                thumbnail={
                  <Thumbnail
                    letter={initial(name, locale)}
                    shape="round"
                    locale={locale}
                  />
                }
                title={name}
                detail={state}
                status={status}
                statusTone={incoming ? "action" : "clay"}
                locale={locale}
              />
            </Pressable>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing["card-inset"] },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
});
