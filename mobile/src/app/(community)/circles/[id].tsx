import { useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  ActivityStatus,
  ActivityText,
  activityStyles,
} from "@/components/activity-ui";
import { ActivityToggle } from "@/components/activity-toggle";
import { CommunityScreen } from "@/components/community-screen";
import {
  NeighbourConfirmation,
  NeighbourHeading,
} from "@/components/neighbour-ui";
import { Button, ErrorText } from "@/components/ui";
import { formatActivityDate } from "@/lib/activity-copy";
import { ApiError } from "@/lib/api";
import {
  circleApi,
  type CircleInvite,
  type CircleReport,
  type Decision,
  type MembershipDetail,
  type RosterMembership,
} from "@/lib/circle-api";
import { circleCopy } from "@/lib/circle-copy";
import {
  useCurrentTime,
  useLiveResource,
  usePagedResource,
} from "@/lib/live-resource";
import { isUnavailable, isUuid, type ReportReason } from "@/lib/neighbour-api";
import { neighbourCopy } from "@/lib/neighbour-copy";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, controls, spacing } from "@/theme/tokens.json";

export default function CircleAdminScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  return (
    <CircleAdmin
      key={`${session?.user.id}:${id}`}
      id={id}
      authUserId={session?.user.id ?? ""}
    />
  );
}

function CircleAdmin({ id, authUserId }: { id: string; authUserId: string }) {
  const localizedType = useLocalizedType();
  const { locale } = useOnboardingText();
  const copy = circleCopy[locale];
  const nb = neighbourCopy[locale];
  const api = useMemo(() => circleApi(authUserId), [authUserId]);
  const now = useCurrentTime();
  const ready = Boolean(authUserId) && isUuid(id);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);
  const [autoApprove, setAutoApprove] = useState(true);
  const [removing, setRemoving] = useState<RosterMembership | null>(null);
  const actionLock = useRef(false);

  const reasonLabels: Record<ReportReason, string> = {
    harassment: nb.unwanted,
    spam: nb.spam,
    unsafe: nb.unsafe,
    scam: nb.scam,
    other: nb.other,
  };

  const reportTargetName = useCallback(
    async (report: CircleReport) => {
      try {
        if (report.target_type === "user") {
          return (await api.profile(report.target_id)).display_name;
        }
        if (report.target_type === "listing") {
          return (await api.listing(report.target_id)).title;
        }
      } catch {
        // A report stays available when its target can no longer be read.
      }
      return null;
    },
    [api],
  );

  const circle = useLiveResource(
    useCallback(async () => {
      if (!ready) return { status: "unavailable" } as const;
      try {
        const detail = await api.circle(id);
        if (detail.my_role !== "leader" || detail.my_status !== "approved")
          return { status: "forbidden" } as const;
        return { status: "ready", detail } as const;
      } catch (error) {
        if (isUnavailable(error)) return { status: "unavailable" } as const;
        throw error;
      }
    }, [api, id, ready]),
  );
  const isLeader = circle.data?.status === "ready" && !circle.error;

  const loadMembers = useCallback(
    async (status: "pending" | "approved", cursor?: string | null) => {
      if (!isLeader) return { items: [], next_cursor: null };
      const page = await api.members(id, status, cursor);
      const items = page.items.map((member) => ({
        ...member,
        id: member.user_id,
      }));
      return { ...page, items };
    },
    [api, id, isLeader],
  );
  const pending = usePagedResource(
    useCallback((cursor) => loadMembers("pending", cursor), [loadMembers]),
  );
  const members = usePagedResource(
    useCallback((cursor) => loadMembers("approved", cursor), [loadMembers]),
  );
  const invites = usePagedResource(
    useCallback(
      async (cursor) => {
        if (!isLeader) return { items: [], next_cursor: null };
        return api.invites(id, cursor);
      },
      [api, id, isLeader],
    ),
  );
  const reports = usePagedResource(
    useCallback(
      async (cursor) => {
        if (!isLeader) return { items: [], next_cursor: null };
        const page = await api.reports(id, ["open", "reviewing"], cursor);
        const items = await Promise.all(
          page.items.map(async (report) => ({
            ...report,
            name: await reportTargetName(report),
          })),
        );
        return { ...page, items };
      },
      [api, id, isLeader, reportTargetName],
    ),
  );

  async function run(key: string, action: () => Promise<unknown>) {
    if (!isLeader || actionLock.current) return;
    actionLock.current = true;
    setBusyKey(key);
    setActionError(false);
    try {
      await action();
    } catch (error) {
      setActionError(true);
      if (error instanceof ApiError && error.status === 403) {
        await circle.reload();
      }
    } finally {
      actionLock.current = false;
      setBusyKey(null);
    }
  }

  function decide(member: MembershipDetail, decision: Decision) {
    return run(`${decision}:${member.user_id}`, async () => {
      try {
        await api.decide(id, member.user_id, decision);
      } finally {
        setRemoving(null);
        await Promise.all([pending.reload(), members.reload()]);
      }
    });
  }

  function decideReport(reportId: string, dismiss: boolean) {
    return run(`${dismiss ? "dismiss" : "resolve"}:${reportId}`, async () => {
      try {
        await api.resolveReport(reportId, dismiss);
      } finally {
        await reports.reload();
      }
    });
  }

  const inviteState = (invite: CircleInvite) =>
    invite.revoked_at
      ? copy.revoked
      : invite.expires_at && new Date(invite.expires_at).getTime() < now
        ? copy.expired
        : null;

  return (
    <CommunityScreen
      design
      back
      title={copy.manageTitle}
      subtitle={
        circle.data?.status === "ready" ? circle.data.detail.name : undefined
      }
    >
      <ActivityStatus
        loading={circle.loading}
        error={circle.error}
        retry={circle.reload}
      />
      {circle.data?.status === "forbidden" ? (
        <ActivityText>{copy.notLeader}</ActivityText>
      ) : null}
      {circle.data?.status === "unavailable" ? (
        <ActivityText>{copy.circleUnavailable}</ActivityText>
      ) : null}
      {actionError ? <ErrorText>{copy.actionError}</ErrorText> : null}
      {isLeader ? (
        <>
          <NeighbourHeading>{copy.pendingHeading}</NeighbourHeading>
          <ActivityStatus
            loading={pending.loading}
            error={pending.error}
            retry={pending.retry}
          />
          {!pending.items.length && !pending.loading && !pending.error ? (
            <ActivityText>{copy.noPending}</ActivityText>
          ) : null}
          {pending.items.map((member) => (
            <View key={member.user_id} style={styles.row}>
              <View style={styles.text}>
                <ActivityText strong>
                  {member.display_name ?? copy.targets.user}
                </ActivityText>
                <ActivityText>
                  {formatActivityDate(member.created_at, locale)}
                </ActivityText>
              </View>
              <View style={styles.rowActions}>
                <Button
                  label={copy.approve}
                  labelStyle={localizedType("field-label", locale)}
                  busy={busyKey === `approve:${member.user_id}`}
                  disabled={Boolean(busyKey)}
                  onPress={() => decide(member, "approve")}
                />
                <Button
                  label={copy.reject}
                  variant="outline"
                  labelStyle={localizedType("field-label", locale)}
                  disabled={Boolean(busyKey)}
                  onPress={() => decide(member, "reject")}
                />
              </View>
            </View>
          ))}
          <LoadMore
            resource={pending}
            label={copy.loadMore}
            section={copy.pendingHeading}
          />

          <NeighbourHeading>{copy.membersHeading}</NeighbourHeading>
          <ActivityStatus
            loading={members.loading}
            error={members.error}
            retry={members.retry}
          />
          {!members.items.length && !members.loading && !members.error ? (
            <ActivityText>{copy.noMembers}</ActivityText>
          ) : null}
          {members.items.map((member) => (
            <View key={member.user_id} style={styles.row}>
              <View style={styles.text}>
                <ActivityText strong>
                  {member.display_name ?? copy.targets.user}
                </ActivityText>
                <ActivityText>{copy.roles[member.role]}</ActivityText>
              </View>
              {member.role === "leader" ? null : (
                <Button
                  label={copy.remove}
                  variant="text"
                  labelStyle={localizedType("field-label", locale)}
                  disabled={Boolean(busyKey)}
                  onPress={() => setRemoving(member)}
                />
              )}
            </View>
          ))}
          <LoadMore
            resource={members}
            label={copy.loadMore}
            section={copy.membersHeading}
          />

          <NeighbourHeading>{copy.invitesHeading}</NeighbourHeading>
          <ActivityStatus
            loading={invites.loading}
            error={invites.error}
            retry={invites.retry}
          />
          {!invites.items.length && !invites.loading && !invites.error ? (
            <ActivityText>{copy.noInvites}</ActivityText>
          ) : null}
          {invites.items.map((invite) => {
            const state = inviteState(invite);
            return (
              <View key={invite.id} style={styles.row}>
                <View style={styles.text}>
                  <Text
                    selectable
                    style={[
                      localizedType("field-label", locale),
                      activityStyles.ink,
                    ]}
                  >
                    {invite.code}
                  </Text>
                  <ActivityText>
                    {[
                      copy.inviteUses(invite.use_count, invite.max_uses),
                      invite.auto_approve ? copy.autoApprove : null,
                      state,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </ActivityText>
                </View>
                {state ? null : (
                  <Button
                    label={copy.revoke}
                    variant="text"
                    labelStyle={localizedType("field-label", locale)}
                    busy={busyKey === `revoke:${invite.id}`}
                    disabled={Boolean(busyKey)}
                    onPress={() =>
                      run(`revoke:${invite.id}`, async () => {
                        await api.revokeInvite(id, invite.id);
                        await invites.reload();
                      })
                    }
                  />
                )}
              </View>
            );
          })}
          <LoadMore
            resource={invites}
            label={copy.loadMore}
            section={copy.invitesHeading}
          />
          <View style={styles.inviteRow}>
            <View style={styles.text}>
              <ActivityText>{copy.autoApprove}</ActivityText>
            </View>
            <ActivityToggle
              label={copy.autoApprove}
              value={autoApprove}
              disabled={Boolean(busyKey)}
              onChange={setAutoApprove}
            />
          </View>
          <Button
            label={copy.newInvite}
            variant="secondary"
            labelStyle={localizedType("button", locale)}
            busy={busyKey === "invite:new"}
            disabled={Boolean(busyKey)}
            onPress={() =>
              run("invite:new", async () => {
                await api.createInvite(id, { auto_approve: autoApprove });
                await invites.reload();
              })
            }
          />

          <NeighbourHeading>{copy.reportsHeading}</NeighbourHeading>
          <ActivityStatus
            loading={reports.loading}
            error={reports.error}
            retry={reports.retry}
          />
          {!reports.items.length && !reports.loading && !reports.error ? (
            <ActivityText>{copy.noReports}</ActivityText>
          ) : null}
          {reports.items.map((report) => (
            <View key={report.id} style={styles.card}>
              <ActivityText strong>
                {report.name ??
                  copy.reportAbout(copy.targets[report.target_type])}
              </ActivityText>
              <ActivityText>
                {copy.reportReason} · {reasonLabels[report.reason]}
              </ActivityText>
              {report.details ? (
                <ActivityText>{report.details}</ActivityText>
              ) : null}
              <ActivityText>
                {formatActivityDate(report.created_at, locale)}
              </ActivityText>
              <View style={styles.rowActions}>
                <Button
                  label={copy.resolve}
                  labelStyle={localizedType("field-label", locale)}
                  busy={busyKey === `resolve:${report.id}`}
                  disabled={Boolean(busyKey)}
                  onPress={() => decideReport(report.id, false)}
                />
                <Button
                  label={copy.dismiss}
                  variant="outline"
                  labelStyle={localizedType("field-label", locale)}
                  disabled={Boolean(busyKey)}
                  onPress={() => decideReport(report.id, true)}
                />
              </View>
            </View>
          ))}
          <LoadMore
            resource={reports}
            label={copy.loadMore}
            section={copy.reportsHeading}
          />
        </>
      ) : null}
      {isLeader && removing ? (
        <NeighbourConfirmation
          title={copy.confirmRemoveTitle}
          confirmLabel={copy.remove}
          cancelLabel={nb.cancel}
          onConfirm={() => decide(removing, "remove")}
          onCancel={() => setRemoving(null)}
        >
          <ActivityText strong>
            {removing.display_name ?? copy.targets.user}
          </ActivityText>
          <ActivityText>{copy.confirmRemoveDetail}</ActivityText>
        </NeighbourConfirmation>
      ) : null}
    </CommunityScreen>
  );
}

function LoadMore({
  resource,
  label,
  section,
}: {
  resource: {
    cursor: string | null;
    loading: boolean;
    error: boolean;
    loadMore: () => void;
  };
  label: string;
  section: string;
}) {
  if (!resource.cursor || resource.error) return null;
  return (
    <Button
      label={label}
      accessibilityLabel={`${label} · ${section}`}
      variant="text"
      disabled={resource.loading}
      onPress={resource.loadMore}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["control-gap"],
  },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["control-gap"],
    paddingVertical: 4,
  },
  text: { flex: 1, gap: 2 },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["related-gap"],
  },
  card: {
    gap: spacing["related-gap"],
    padding: spacing["card-inset"],
    borderRadius: controls.radius,
    backgroundColor: colors.paper,
  },
});
