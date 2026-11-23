import { RefreshControl, StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import {
  AccountSkeleton,
  AccountSwitcher,
  FamilyNotice,
  FamilyRequestCard,
  LinkedFamily,
  RequestSkeleton,
} from "@/components/family-ui";
import { Button, ErrorText } from "@/components/ui";
import type { Language } from "@/lib/api";
import { familyCopy } from "@/lib/family-copy";
import type { FamilyAccount } from "@/lib/family-state";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { type FamilyState, useFamily } from "@/lib/use-family";
import { colors, spacing } from "@/theme/tokens.json";

type ReadyFamily = Extract<FamilyState, { status: "ready" }>;

export default function FamilyScreen() {
  const { locale } = useOnboardingText();
  const copy = familyCopy[locale];
  const family = useFamily();
  const { state } = family;

  return (
    <CommunityScreen
      title={copy.title}
      subtitle={copy.subtitle}
      live
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
          lostAccess={family.lostAccess}
          onSelect={family.select}
          onRefresh={() => void family.refresh()}
          onRetryRequests={family.retryRequests}
        />
      )}
    </CommunityScreen>
  );
}

function ReadyContent({
  state,
  locale,
  lostAccess,
  onSelect,
  onRefresh,
  onRetryRequests,
}: {
  state: ReadyFamily;
  locale: Language;
  lostAccess: string | null;
  onSelect: (accountId: string) => void;
  onRefresh: () => void;
  onRetryRequests: () => void;
}) {
  const copy = familyCopy[locale];
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
      <AccountSwitcher
        accounts={state.accounts}
        selectedId={state.selected.id}
        onSelect={onSelect}
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
        <RequestsBody
          account={state.selected}
          requests={state.requests}
          locale={locale}
          onRefresh={onRefresh}
          onRetry={onRetryRequests}
        />
      </View>
      {state.links.length > 0 ? (
        <LinkedFamily links={state.links} locale={locale} />
      ) : null}
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
            requests.items.map((request) => (
              <FamilyRequestCard
                key={request.id}
                request={request}
                locale={locale}
              />
            ))
          )}
        </>
      );
  }
}

const styles = StyleSheet.create({
  section: { gap: spacing["related-gap"] },
  inlineError: { gap: 4 },
  ink: { color: colors.ink },
});
