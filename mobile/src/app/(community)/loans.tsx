import { router } from "expo-router";
import { FlatList, Pressable, Text, View } from "react-native";
import { CommunityScreen } from "@/components/community-screen";
import {
  ActivityStatus,
  ActivityText,
  activityStyles as styles,
} from "@/components/activity-ui";
import { Button } from "@/components/ui";
import { ApiError, api, type Exchange, type Page } from "@/lib/api";
import { activityCopy, formatActivityDate } from "@/lib/activity-copy";
import { useCurrentTime, usePagedResource } from "@/lib/live-resource";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";

type LoanRow = Exchange & { title: string | null };

async function loadLoans(cursor?: string | null): Promise<Page<LoanRow>> {
  const page = await api.listActiveExchanges(cursor);
  const items = await Promise.all(
    page.items
      .filter((item) => item.mode === "loan")
      .map(async (item) => {
        let title: string | null = null;
        if (item.listing_id) {
          try {
            title = (await api.getListing(item.listing_id)).title;
          } catch (error) {
            if (!(error instanceof ApiError && error.status === 404))
              throw error;
          }
        }
        return { ...item, title };
      }),
  );
  return { items, next_cursor: page.next_cursor };
}

export default function LoansScreen() {
  const { locale } = useOnboardingText();
  const { profile } = useSession();
  const copy = activityCopy[locale];
  const loans = usePagedResource(loadLoans);
  const now = useCurrentTime();
  const me = profile.status === "ready" ? profile.profile.id : null;
  return (
    <CommunityScreen live scroll={false} back title={copy.loans}>
      <FlatList
        data={loans.items}
        keyExtractor={(item) => item.id}
        refreshing={loans.loading}
        onRefresh={loans.reload}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            style={styles.card}
            onPress={() =>
              router.push({ pathname: "/loans/[id]", params: { id: item.id } })
            }
          >
            <Text style={[localizedType("card-title", locale), styles.ink]}>
              {item.title || copy.unnamedLoan}
            </Text>
            <ActivityText>
              {me === item.requester_user_id ? copy.borrowed : copy.lent}
            </ActivityText>
            <ActivityText strong>
              {copy.due}: {formatActivityDate(item.due_at, locale)}
            </ActivityText>
            <ActivityText>
              {copy.pickup}:{" "}
              {formatActivityDate(
                item.handed_over_at ?? item.scheduled_at,
                locale,
              )}
            </ActivityText>
            {item.due_at && new Date(item.due_at).getTime() < now ? (
              <ActivityText>
                {me === item.requester_user_id
                  ? copy.overdue
                  : copy.lenderOverdue}
              </ActivityText>
            ) : null}
          </Pressable>
        )}
        ListEmptyComponent={
          !loans.loading && !loans.error && !loans.cursor ? (
            <ActivityText>{copy.noLoans}</ActivityText>
          ) : undefined
        }
        ListFooterComponent={
          <View style={styles.section}>
            <ActivityStatus
              loading={loans.loading}
              error={loans.error}
              retry={loans.retry}
            />
            {loans.cursor && !loans.error ? (
              <Button
                variant="secondary"
                label={copy.loadMore}
                disabled={loans.loading}
                onPress={loans.loadMore}
              />
            ) : null}
          </View>
        }
      />
    </CommunityScreen>
  );
}
