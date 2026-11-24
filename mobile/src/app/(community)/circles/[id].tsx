import { useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ActivityStatus, ActivityText } from "@/components/activity-ui";
import { ActivityToggle } from "@/components/activity-toggle";
import { CommunityScreen } from "@/components/community-screen";
import { NeighbourConfirmation, NeighbourHeading } from "@/components/neighbour-ui";
import { Button, ErrorText } from "@/components/ui";
import { formatActivityDate } from "@/lib/activity-copy";
import {
  circleApi,
  type CircleInvite,
  type CircleReport,
  type Decision,
  type MembershipDetail,
} from "@/lib/circle-api";
import { circleCopy } from "@/lib/circle-copy";
import { useCurrentTime, useLiveResource } from "@/lib/live-resource";
import { isUnavailable, isUuid, type ReportReason } from "@/lib/neighbour-api";
import { neighbourCopy } from "@/lib/neighbour-copy";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, controls, spacing } from "@/theme/tokens.json";

type NamedMembership = MembershipDetail & { name: string | null };

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
  const { locale } = useOnboardingText();
  const copy = circleCopy[locale];
  const nb = neighbourCopy[locale];
  const api = useMemo(() => circleApi(authUserId), [authUserId]);
  const now = useCurrentTime();
  const ready = Boolean(authUserId) && isUuid(id);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);
  const [autoApprove, setAutoApprove] = useState(true);
  const [removing, setRemoving] = useState<NamedMembership | null>(null);

  const reasonLabels: Record<ReportReason, string> = {
    harassment: nb.unwanted,
    spam: nb.spam,
    unsafe: nb.unsafe,
    scam: nb.scam,
    other: nb.other,
  };

  const named = useCallback(
    async (userId: string) => {
      try {
        return (await api.profile(userId)).display_name;
      } catch (error) {
        if (isUnavailable(error)) return null;
        throw error;
      }
    },
    [api],
  );

  const circle = useLiveResource(
    useCallback(async () => {
      if (!ready) return { status: "unavailable" } as const;
      try {
        const detail = await api.circle(id);
        if (detail.my_role !== "leader")
          return { status: "forbidden" } as const;
        return { status: "ready", detail } as const;
      } catch (error) {
        if (isUnavailable(error)) return { status: "unavailable" } as const;
        throw error;
      }
    }, [api, id, ready]),
  );
  const isLeader = circle.data?.status === "ready";

  const loadMembers = useCallback(
    async (status: "pending" | "approved") => {
      if (!isLeader) return [] as NamedMembership[];
      const page = await api.members(id, status);
      return Promise.all(
        page.items.map(async (member) => ({
          ...member,
          name: await named(member.user_id),
        })),
      );
    },
    [api, id, isLeader, named],
  );
  const pending = useLiveResource(
    useCallback(() => loadMembers("pending"), [loadMembers]),
  );
  const members = useLiveResource(
    useCallback(() => loadMembers("approved"), [loadMembers]),
  );
  const invites = useLiveResource(
    useCallback(async () => {
      if (!isLeader) return [] as CircleInvite[];
      return (await api.invites(id)).items;
    }, [api, id, isLeader]),
  );
  const reports = useLiveResource(
    useCallback(async () => {
      if (!isLeader) return [] as (CircleReport & { name: string | null })[];
      const page = await api.reports(id, "open");
      return Promise.all(
        page.items.map(async (report) => ({
          ...report,
          name:
            report.target_type === "user"
              ? await named(report.target_id)
              : null,
        })),
      );
    }, [api, id, isLeader, named]),
  );

  async function run(key: string, action: () => Promise<unknown>) {
    if (busyKey) return;
    setBusyKey(key);
    setActionError(false);
    try {
      await action();
    } catch {
      setActionError(true);
    } finally {
      setBusyKey(null);
    }
  }

  function decide(member: NamedMembership, decision: Decision) {
    return run(`${decision}:${member.user_id}`, async () => {
      await api.decide(id, member.user_id, decision);
      await Promise.all([pending.reload(), members.reload()]);
      setRemoving(null);
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
      showDemoPreview={false}
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
            retry={pending.reload}
          />
          {pending.data?.length === 0 && !pending.loading ? (
            <ActivityText>{copy.noPending}</ActivityText>
          ) : null}
          {pending.data?.map((member) => (
            <View key={member.user_id} style={styles.row}>
              <View style={styles.text}>
                <ActivityText strong>
                  {member.name ?? copy.targets.user}
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

          <NeighbourHeading>{copy.membersHeading}</NeighbourHeading>
          <ActivityStatus
            loading={members.loading}
            error={members.error}
            retry={members.reload}
          />
          {members.data?.length === 0 && !members.loading ? (
            <ActivityText>{copy.noMembers}</ActivityText>
          ) : null}
          {members.data?.map((member) => (
            <View key={member.user_id} style={styles.row}>
              <View style={styles.text}>
                <ActivityText strong>
                  {member.name ?? copy.targets.user}
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

          <NeighbourHeading>{copy.invitesHeading}</NeighbourHeading>
          <ActivityStatus
            loading={invites.loading}
            error={invites.error}
            retry={invites.reload}
          />
          {invites.data?.length === 0 && !invites.loading ? (
            <ActivityText>{copy.noInvites}</ActivityText>
          ) : null}
          {invites.data?.map((invite) => {
            const state = inviteState(invite);
            return (
              <View key={invite.id} style={styles.row}>
                <View style={styles.text}>
                  <ActivityText strong>{invite.code}</ActivityText>
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
            retry={reports.reload}
          />
          {reports.data?.length === 0 && !reports.loading ? (
            <ActivityText>{copy.noReports}</ActivityText>
          ) : null}
          {reports.data?.map((report) => (
            <View key={report.id} style={styles.card}>
              <ActivityText strong>
                {report.name ?? copy.reportAbout(copy.targets[report.target_type])}
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
                  onPress={() =>
                    run(`resolve:${report.id}`, async () => {
                      await api.resolveReport(report.id, false);
                      await reports.reload();
                    })
                  }
                />
                <Button
                  label={copy.dismiss}
                  variant="outline"
                  labelStyle={localizedType("field-label", locale)}
                  disabled={Boolean(busyKey)}
                  onPress={() =>
                    run(`dismiss:${report.id}`, async () => {
                      await api.resolveReport(report.id, true);
                      await reports.reload();
                    })
                  }
                />
              </View>
            </View>
          ))}
        </>
      ) : null}
      {removing ? (
        <NeighbourConfirmation
          title={copy.confirmRemoveTitle}
          confirmLabel={copy.remove}
          cancelLabel={nb.cancel}
          onConfirm={() => decide(removing, "remove")}
          onCancel={() => setRemoving(null)}
        >
          <ActivityText strong>
            {removing.name ?? copy.targets.user}
          </ActivityText>
          <ActivityText>{copy.confirmRemoveDetail}</ActivityText>
        </NeighbourConfirmation>
      ) : null}
    </CommunityScreen>
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
