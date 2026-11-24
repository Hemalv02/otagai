import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import {
  LinkReviewSheet,
  type ReviewedLink,
} from "@/components/family-link-sheet";
import {
  AccountList,
  AccountSkeleton,
  FamilyNotice,
  FamilyRequestRow,
  RequestSkeleton,
} from "@/components/family-ui";
import { Button, ErrorText } from "@/components/ui";
import type { Language } from "@/lib/api";
import { familyConsentCopy } from "@/lib/family-consent-copy";
import { familyCopy } from "@/lib/family-copy";
import { type FamilyAccount, statusLinks } from "@/lib/family-state";
import { useMemberships } from "@/lib/memberships";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { type FamilyState, useFamily } from "@/lib/use-family";
import { colors, spacing } from "@/theme/tokens.json";

type ReadyFamily = Extract<FamilyState, { status: "ready" }>;

export default function FamilyScreen() {
  const { locale } = useOnboardingText();
  const copy = familyCopy[locale];
  const params = useLocalSearchParams<{ account?: string; at?: string }>();
  const family = useFamily(params.account === "self" ? params.at : undefined);
  const { state } = family;
  const { session } = useSession();
  const [reviewing, setReviewing] = useState<ReviewedLink | null>(null);
  const memberships = useMemberships();
  const circle =
    memberships.state.status === "ready"
      ? memberships.state.items.find((item) => item.status === "approved")
          ?.circle
      : undefined;
  const translatedName = circle?.name_translations[locale];
  const circleName =
    typeof translatedName === "string"
      ? translatedName
      : (circle?.name ?? null);

  return (
    <CommunityScreen
      title={copy.title}
      subtitle={copy.subtitle}
      back
      refreshControl={
        <RefreshControl
          refreshing={family.refreshing}
          onRefresh={() => void family.refresh()}
          tintColor={colors.action}
          colors={[colors.action]}
        />
      }
    >
      {state.status === "loading" ? (
        <>
          <AccountSkeleton />
          <RequestSkeleton locale={locale} />
        </>
      ) : state.status === "error" ? (
        <FamilyNotice
          tone="alert"
          title={copy.loadError}
          actionLabel={copy.retry}
          onAction={() => void family.refresh()}
          locale={locale}
        />
      ) : (
        <ReadyContent
          state={state}
          locale={locale}
          circleName={circleName}
          lostAccess={family.lostAccess}
          onSelect={family.select}
          onReviewLink={(link) =>
            setReviewing({ id: link.id, name: link.name })
          }
          onRefresh={() => void family.refresh()}
          onRetryRequests={family.retryRequests}
        />
      )}
      <LinkReviewSheet
        link={reviewing}
        authUserId={session?.user.id ?? null}
        onClose={() => setReviewing(null)}
        onChanged={() => void family.refresh()}
        locale={locale}
      />
    </CommunityScreen>
  );
}

function ReadyContent({
  state,
  locale,
  circleName,
  lostAccess,
  onSelect,
  onReviewLink,
  onRefresh,
  onRetryRequests,
}: {
  state: ReadyFamily;
  locale: Language;
  circleName: string | null;
  lostAccess: string | null;
  onSelect: (accountId: string) => void;
  onReviewLink: (link: { id: string; name: string }) => void;
  onRefresh: () => void;
  onRetryRequests: () => void;
}) {
  const localizedType = useLocalizedType();
  const copy = familyCopy[locale];
  const consent = familyConsentCopy[locale];
  const label = localizedType("field-label", locale);
  const selected = state.selected;
  const hasFamily = state.accounts.length > 1 || state.links.length > 0;

  return (
    <>
      {state.refreshFailed ? (
        <View style={styles.inlineError}>
          <ErrorText>{copy.loadError}</ErrorText>
          <Button
            label={copy.retry}
            labelStyle={localizedType("field-label", locale)}
            variant="text"
            onPress={onRefresh}
          />
        </View>
      ) : null}
      <AccountList
        accounts={state.accounts}
        links={statusLinks(state.links)}
        selectedId={state.selected.id}
        circleName={circleName}
        onSelect={onSelect}
        onReviewLink={onReviewLink}
        locale={locale}
      />
      {hasFamily ? null : (
        <FamilyNotice
          title={copy.noFamilyTitle}
          body={copy.noFamilyBody}
          locale={locale}
        />
      )}
      {lostAccess ? (
        <FamilyNotice
          tone="alert"
          title={copy.lostAccess(lostAccess)}
          locale={locale}
        />
      ) : null}
      <View style={styles.section}>
        <Text
          accessibilityRole="header"
          style={[localizedType("section-heading", locale), styles.ink]}
        >
          {state.selected.isSelf
            ? copy.yourRequests
            : copy.theirRequests(state.selected.name)}
        </Text>
        {!selected.isSelf && selected.canPostRequests ? (
          <Button
            label={consent.home.askFor(selected.name)}
            labelStyle={label}
            variant="outline"
            onPress={() =>
              router.push({
                pathname: "/family/ask/[memberId]",
                params: { memberId: selected.id },
              })
            }
          />
        ) : null}
        <RequestsBody
          account={state.selected}
          requests={state.requests}
          locale={locale}
          onRefresh={onRefresh}
          onRetry={onRetryRequests}
        />
      </View>
      <Button
        label={consent.home.permissions}
        labelStyle={label}
        variant="text"
        onPress={() => router.push("/family/permissions")}
      />
      <Button
        label={consent.home.addMember}
        labelStyle={localizedType("button", locale)}
        onPress={() => router.push("/family/add")}
      />
    </>
  );
}

function RequestsBody({
  account,
  requests,
  locale,
  onRefresh,
  onRetry,
}: {
  account: FamilyAccount;
  requests: ReadyFamily["requests"];
  locale: Language;
  onRefresh: () => void;
  onRetry: () => void;
}) {
  const localizedType = useLocalizedType();
  const copy = familyCopy[locale];

  switch (requests.status) {
    case "loading":
      return <RequestSkeleton locale={locale} />;
    case "no-permission":
      return (
        <FamilyNotice
          title={copy.noPermissionTitle(account.name)}
          body={copy.noPermissionBody}
          locale={locale}
        />
      );
    case "denied":
      return (
        <FamilyNotice
          tone="alert"
          title={copy.lostAccess(account.name)}
          actionLabel={copy.retry}
          onAction={onRetry}
          locale={locale}
        />
      );
    case "error":
      return (
        <FamilyNotice
          tone="alert"
          title={copy.requestsError}
          actionLabel={copy.retry}
          onAction={onRetry}
          locale={locale}
        />
      );
    case "ready":
      return (
        <>
          {requests.refreshFailed ? (
            <View style={styles.inlineError}>
              <ErrorText>{copy.refreshFailed}</ErrorText>
              <Button
                label={copy.retry}
                labelStyle={localizedType("field-label", locale)}
                variant="text"
                onPress={onRetry}
              />
            </View>
          ) : null}
          {requests.items.length === 0 ? (
            <FamilyNotice
              title={
                account.isSelf
                  ? copy.noRequestsSelf
                  : copy.noRequestsOther(account.name)
              }
              body={copy.checkLater}
              actionLabel={copy.refresh}
              onAction={onRefresh}
              locale={locale}
            />
          ) : (
            <View style={styles.list}>
              {requests.items.map((request) => (
                <FamilyRequestRow
                  key={request.id}
                  request={request}
                  locale={locale}
                />
              ))}
            </View>
          )}
        </>
      );
  }
}

const styles = StyleSheet.create({
  section: { gap: spacing["card-inset"] },
  list: { gap: spacing["card-inset"] },
  inlineError: { gap: 4 },
  ink: { color: colors.ink },
});
