import { randomUUID } from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ActivityStatus, ActivityText } from "@/components/activity-ui";
import { ActivityToggle } from "@/components/activity-toggle";
import { CommunityScreen } from "@/components/community-screen";
import {
  NeighbourConfirmation,
  NeighbourHeading,
  NeighbourNotice,
  SelectionCopy,
} from "@/components/neighbour-ui";
import { Button, ErrorText, Field } from "@/components/ui";
import { activityScreenCopy } from "@/lib/activity-screen-copy";
import { useLiveResource } from "@/lib/live-resource";
import {
  exchangeLabel,
  isUnavailable,
  isUuid,
  neighbourApi,
  optionalVisible,
  partnerFor,
  type ReportReason,
  type ReportTarget,
} from "@/lib/neighbour-api";
import { neighbourCopy } from "@/lib/neighbour-copy";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { spacing } from "@/theme/tokens.json";

type Action = "report" | "block";
type Result = Partial<Record<Action, "done" | "failed">>;

const reportTargets: ReportTarget[] = ["user", "listing", "message"];

function asReportTarget(value: string): ReportTarget | null {
  return (reportTargets as string[]).includes(value)
    ? (value as ReportTarget)
    : null;
}

export default function ReportOrBlockScreen() {
  const { targetId, targetType, loanId, subjectId, title } =
    useLocalSearchParams<{
      targetId: string;
      targetType: string;
      loanId?: string;
      subjectId?: string;
      title?: string;
    }>();
  const { session, profile } = useSession();
  return (
    <ReportOrBlock
      key={`${session?.user.id}:${targetType}:${targetId}:${loanId}`}
      targetId={targetId}
      targetType={targetType}
      loanId={loanId}
      subjectId={subjectId}
      title={title}
      authUserId={session?.user.id ?? ""}
      profileId={profile.status === "ready" ? profile.profile.id : ""}
    />
  );
}

function ReportOrBlock({
  targetId,
  targetType,
  loanId,
  subjectId,
  title,
  authUserId,
  profileId,
}: {
  targetId: string;
  targetType: string;
  loanId?: string;
  subjectId?: string;
  title?: string;
  authUserId: string;
  profileId: string;
}) {
  const localizedType = useLocalizedType();
  const { locale } = useOnboardingText();
  const copy = neighbourCopy[locale];
  const api = useMemo(() => neighbourApi(authUserId), [authUserId]);
  const kind = asReportTarget(targetType);
  const target = useLiveResource(
    useCallback(async () => {
      if (!authUserId || !profileId || !kind || !isUuid(targetId)) return {};
      if (kind === "user" && targetId === profileId) return {};
      try {
        if (kind === "user") {
          if (!loanId) {
            const person = await api.profile(targetId);
            return { name: person.display_name };
          }
          if (!isUuid(loanId)) return {};
          const exchange = await api.exchange(loanId);
          if (
            exchange.mode !== "loan" ||
            partnerFor(exchange, profileId) !== targetId
          )
            return {};
          const [person, loanTitle] = await Promise.all([
            optionalVisible(api.profile(targetId)),
            exchangeLabel(api, exchange),
          ]);
          return { name: person?.display_name ?? null, title: loanTitle };
        }
        if (kind === "listing") {
          if (title?.trim()) return { name: title.trim() };
          const listing = await optionalVisible(api.listing(targetId));
          return { name: listing?.title ?? null };
        }
        return { name: title?.trim() || null };
      } catch (error) {
        if (isUnavailable(error)) return {};
        throw error;
      }
    }, [api, authUserId, kind, loanId, profileId, targetId, title]),
  );

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [blockOnly, setBlockOnly] = useState(false);
  const [block, setBlock] = useState(false);
  const [details, setDetails] = useState("");
  const [confirmation, setConfirmation] = useState<Action[] | null>(null);
  const [result, setResult] = useState<Result>({});
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const submissionId = useRef<string | null>(null);
  const reportDetails = details.trim();
  const ready = target.data?.name !== undefined;
  const headline =
    target.data?.name ??
    (kind === "listing"
      ? copy.reportListing
      : kind === "message"
        ? copy.reportMessage
        : copy.neighbour);
  const blockId =
    subjectId && isUuid(subjectId)
      ? subjectId
      : kind === "user"
        ? targetId
        : null;
  const canBlock = Boolean(blockId);
  const blockLabel = kind === "user" ? copy.block : copy.blockPerson;
  const alsoBlockLabel =
    kind === "user" ? copy.alsoBlock : copy.alsoBlockPerson;
  const reasonOptions: [ReportReason, string, string][] =
    kind === "listing"
      ? [
          ["unsafe", copy.unsafe, copy.unsafeDetail],
          ["scam", copy.scam, copy.scamDetail],
          ["spam", copy.spam, copy.spamDetail],
          ["other", copy.other, copy.otherDetail],
        ]
      : kind === "message"
        ? [
            ["harassment", copy.unwanted, copy.unwantedDetail],
            ["spam", copy.spam, copy.spamDetail],
            ["other", copy.other, copy.otherDetail],
          ]
        : [
            ["harassment", copy.unwanted, copy.unwantedDetail],
            ["other", copy.other, copy.otherDetail],
          ];
  const actions: Action[] = [];
  if (!blockOnly && reason) actions.push("report");
  if (canBlock && block) actions.push("block");
  const hasResult = result.report !== undefined || result.block !== undefined;
  const labelFor = (selected: Action[]) =>
    selected.length === 2
      ? copy.confirmBoth
      : selected[0] === "block"
        ? copy.confirmBlock
        : copy.confirmReport;
  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace("/loans");

  async function execute(selected: Action[]) {
    if (!ready || lock.current || !selected.length) return;
    lock.current = true;
    setConfirmation(null);
    setBusy(true);
    const outcomes: Result = {};
    try {
      if (
        selected.includes("report") &&
        reason &&
        kind &&
        result.report !== "done"
      ) {
        try {
          submissionId.current ??= randomUUID();
          await api.report(
            submissionId.current,
            kind,
            targetId,
            reason,
            reportDetails,
          );
          outcomes.report = "done";
        } catch {
          outcomes.report = "failed";
        }
      }
      if (selected.includes("block") && blockId && result.block !== "done") {
        try {
          await api.block(blockId);
          outcomes.block = "done";
        } catch {
          outcomes.block = "failed";
        }
      }
      setResult((previous) => ({ ...previous, ...outcomes }));
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }

  return (
    <CommunityScreen
      design
      back
      keyboard
      title={copy.reportOrBlock}
      subtitle={
        kind === "listing"
          ? copy.safetyListingIntro
          : kind === "message"
            ? copy.safetyMessageIntro
            : copy.safetyIntro
      }
    >
      <ActivityStatus
        loading={target.loading}
        error={target.error}
        retry={target.reload}
      />
      {target.data && !ready ? (
        <ActivityText>{copy.unavailable}</ActivityText>
      ) : null}
      {ready ? (
        <>
          <View>
            <ActivityText strong>{headline}</ActivityText>
            {target.data?.title ? (
              <ActivityText>{target.data.title}</ActivityText>
            ) : null}
          </View>
          {hasResult ? (
            <>
              <NeighbourNotice>
                {result.report === "done" ? (
                  <ActivityText strong>{copy.reported}</ActivityText>
                ) : null}
                {result.block === "done" ? (
                  <ActivityText strong>{copy.blocked}</ActivityText>
                ) : null}
                {result.report === "failed" ? (
                  <ErrorText>{copy.reportFailed}</ErrorText>
                ) : null}
                {result.block === "failed" ? (
                  <ErrorText>{copy.blockFailed}</ErrorText>
                ) : null}
              </NeighbourNotice>
              {result.report === "failed" ? (
                <Button
                  label={copy.retryReport}
                  disabled={busy}
                  onPress={() => setConfirmation(["report"])}
                />
              ) : null}
              {result.block === "failed" ? (
                <Button
                  label={copy.retryBlock}
                  disabled={busy}
                  onPress={() => setConfirmation(["block"])}
                />
              ) : null}
              <Button
                label={activityScreenCopy[locale].done}
                variant="outline"
                disabled={busy}
                onPress={goBack}
              />
            </>
          ) : (
            <>
              <View style={styles.reasonHeading}>
                {blockOnly ? (
                  <NeighbourHeading>{blockLabel}</NeighbourHeading>
                ) : (
                  <NeighbourHeading>{copy.reason}</NeighbourHeading>
                )}
                {canBlock ? (
                  <Button
                    label={blockOnly ? copy.includeReport : copy.blockOnly}
                    variant="text"
                    labelStyle={localizedType("field-label", locale)}
                    disabled={busy}
                    onPress={() => {
                      if (!blockOnly) setBlock(true);
                      setBlockOnly(!blockOnly);
                    }}
                  />
                ) : null}
              </View>
              {!blockOnly ? (
                <>
                  <View accessibilityRole="radiogroup" style={styles.reasons}>
                    {reasonOptions.map(([value, title, detail]) => (
                      <Pressable
                        key={value}
                        accessibilityRole="radio"
                        aria-checked={reason === value}
                        accessibilityState={{
                          checked: reason === value,
                          disabled: busy,
                        }}
                        disabled={busy}
                        onPress={() => {
                          setReason(value);
                        }}
                      >
                        <SelectionCopy
                          title={title}
                          detail={detail}
                          selected={reason === value}
                        />
                      </Pressable>
                    ))}
                  </View>
                  {reason ? (
                    <Field
                      label={copy.details}
                      labelStyle={localizedType("field-label", locale)}
                      value={details}
                      onChangeText={setDetails}
                      multiline
                      maxLength={2000}
                      style={localizedType("body", locale)}
                      editable={!busy}
                    />
                  ) : null}
                </>
              ) : null}
              {canBlock ? (
                <View style={styles.blockRow}>
                  <View style={styles.blockCopy}>
                    <ActivityText strong>
                      {blockOnly ? blockLabel : alsoBlockLabel}
                    </ActivityText>
                    <ActivityText>{copy.blockDetail}</ActivityText>
                  </View>
                  <ActivityToggle
                    label={blockOnly ? blockLabel : alsoBlockLabel}
                    value={block}
                    disabled={busy}
                    onChange={setBlock}
                  />
                </View>
              ) : null}
              <NeighbourNotice>
                <ActivityText strong>{copy.beforeConfirm}</ActivityText>
                <ActivityText>{copy.privateAction}</ActivityText>
              </NeighbourNotice>
              <View style={styles.controls}>
                <Button
                  label={copy.reviewActions}
                  labelStyle={localizedType("button", locale)}
                  busy={busy}
                  disabled={
                    !actions.length ||
                    (!blockOnly && !reason) ||
                    target.loading ||
                    target.error
                  }
                  onPress={() => setConfirmation(actions)}
                />
                <Button
                  label={copy.cancel}
                  variant="outline"
                  labelStyle={localizedType("button", locale)}
                  disabled={busy}
                  onPress={goBack}
                />
              </View>
            </>
          )}
        </>
      ) : null}
      {confirmation ? (
        <NeighbourConfirmation
          title={copy.beforeConfirm}
          confirmLabel={labelFor(confirmation)}
          cancelLabel={copy.cancel}
          onConfirm={() => execute(confirmation)}
          onCancel={() => setConfirmation(null)}
        >
          <ActivityText strong>{headline}</ActivityText>
          {confirmation.includes("report") && reason ? (
            <>
              <ActivityText>
                {copy.reason} ·{" "}
                {reasonOptions.find(([value]) => value === reason)?.[1] ??
                  copy.other}
              </ActivityText>
              {reportDetails ? (
                <View>
                  <ActivityText strong>{copy.details}</ActivityText>
                  <ActivityText>{reportDetails}</ActivityText>
                </View>
              ) : null}
            </>
          ) : null}
          {confirmation.includes("block") ? (
            <ActivityText>{copy.blockDetail}</ActivityText>
          ) : null}
          <ActivityText>{copy.privateAction}</ActivityText>
        </NeighbourConfirmation>
      ) : null}
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  reasons: { gap: spacing["card-inset"] },
  controls: { gap: spacing["related-gap"] },
  reasonHeading: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: spacing["related-gap"],
  },
  blockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["control-gap"],
    paddingVertical: 4,
  },
  blockCopy: { flex: 1 },
});
