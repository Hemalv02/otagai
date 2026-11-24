import { useCallback, useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { ActivityStatus, ActivityText } from "@/components/activity-ui";
import { CommunityScreen } from "@/components/community-screen";
import { formatActivityDate } from "@/lib/activity-copy";
import { circleApi } from "@/lib/circle-api";
import { circleCopy } from "@/lib/circle-copy";
import { useLiveResource } from "@/lib/live-resource";
import type { ReportReason } from "@/lib/neighbour-api";
import { neighbourCopy } from "@/lib/neighbour-copy";
import { useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, controls, spacing } from "@/theme/tokens.json";

export default function MyReportsScreen() {
  const { session } = useSession();
  return <MyReports key={session?.user.id} authUserId={session?.user.id ?? ""} />;
}

function MyReports({ authUserId }: { authUserId: string }) {
  const { locale } = useOnboardingText();
  const copy = circleCopy[locale];
  const nb = neighbourCopy[locale];
  const api = useMemo(() => circleApi(authUserId), [authUserId]);
  const data = useLiveResource(
    useCallback(async () => {
      if (!authUserId) return [];
      return (await api.myReports()).items;
    }, [api, authUserId]),
  );
  const reasonLabels: Record<ReportReason, string> = {
    harassment: nb.unwanted,
    spam: nb.spam,
    unsafe: nb.unsafe,
    scam: nb.scam,
    other: nb.other,
  };

  return (
    <CommunityScreen
      showDemoPreview={false}
      design
      back
      title={copy.myReports}
      subtitle={copy.myReportsBody}
    >
      <ActivityStatus
        loading={data.loading}
        error={data.error}
        retry={data.reload}
      />
      {data.data?.length === 0 && !data.loading ? (
        <ActivityText>{copy.myReportsEmpty}</ActivityText>
      ) : null}
      {data.data?.map((report) => (
        <View key={report.id} style={styles.card}>
          <ActivityText strong>
            {copy.reportAbout(copy.targets[report.target_type])}
          </ActivityText>
          <ActivityText>
            {copy.reportReason} · {reasonLabels[report.reason]}
          </ActivityText>
          {report.details ? (
            <ActivityText>{report.details}</ActivityText>
          ) : null}
          <ActivityText>
            {copy.statuses[report.status]} ·{" "}
            {copy.reportedOn(formatActivityDate(report.created_at, locale))}
          </ActivityText>
        </View>
      ))}
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing["related-gap"],
    padding: spacing["card-inset"],
    borderRadius: controls.radius,
    backgroundColor: colors.paper,
  },
});
