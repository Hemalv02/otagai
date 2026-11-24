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
} from "@/lib/neighbour-api";
import { neighbourCopy } from "@/lib/neighbour-copy";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { spacing } from "@/theme/tokens.json";

type Action = "report" | "block";
type Result = Partial<Record<Action, "done" | "failed">>;

export default function ReportOrBlockScreen() {
  const { targetId, targetType, loanId } = useLocalSearchParams<{
    targetId: string;
    targetType: string;
    loanId?: string;
  }>();
  const { session, profile } = useSession();
  return (
    <ReportOrBlock
      key={`${session?.user.id}:${targetType}:${targetId}:${loanId}`}
      targetId={targetId}
      targetType={targetType}
      loanId={loanId}
      authUserId={session?.user.id ?? ""}
      profileId={profile.status === "ready" ? profile.profile.id : ""}
    />
  );
}

function ReportOrBlock({
  targetId,
  targetType,
  loanId,
  authUserId,
  profileId,
}: {
  targetId: string;
  targetType: string;
  loanId?: string;
  authUserId: string;
  profileId: string;
}) {
  const { locale } = useOnboardingText();
  const copy = neighbourCopy[locale];
  const api = useMemo(() => neighbourApi(authUserId), [authUserId]);
  const target = useLiveResource(
    useCallback(async () => {
      if (
        !authUserId ||
        !profileId ||
        !isUuid(targetId) ||
        targetId === profileId ||
        targetType !== "user"
      )
        return {};
      try {
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
        const [person, title] = await Promise.all([
          optionalVisible(api.profile(targetId)),
          exchangeLabel(api, exchange),
        ]);
        return { name: person?.display_name ?? null, title };
      } catch (error) {
        if (isUnavailable(error)) return {};
        throw error;
      }
    }, [api, authUserId, loanId, profileId, targetId, targetType]),
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
  const reportDetails = reason === "other" ? details.trim() : "";
  const ready = target.data?.name !== undefined;
  const name = target.data?.name ?? copy.neighbour;
  const actions: Action[] = [];
  if (!blockOnly && reason) actions.push("report");
  if (block) actions.push("block");
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
      if (selected.includes("report") && reason && result.report !== "done") {
        try {
          submissionId.current ??= randomUUID();
          await api.report(
            submissionId.current,
            "user",
            targetId,
            reason,
            reportDetails,
          );
          outcomes.report = "done";
        } catch {
          outcomes.report = "failed";
        }
      }
      if (selected.includes("block") && result.block !== "done") {
        try {
          await api.block(targetId);
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
      showDemoPreview={false}
      design
      back
      keyboard
      title={copy.reportOrBlock}
      subtitle={copy.safetyIntro}
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
            <ActivityText strong>{name}</ActivityText>
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
                  <NeighbourHeading>{copy.blockOnly}</NeighbourHeading>
                ) : (
                  <NeighbourHeading>{copy.reason}</NeighbourHeading>
                )}
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
              </View>
              {!blockOnly ? (
                <>
                  <View accessibilityRole="radiogroup" style={styles.reasons}>
                    {(
                      [
                        ["harassment", copy.unwanted, copy.unwantedDetail],
                        ["other", copy.other, copy.otherDetail],
                      ] as const
                    ).map(([value, title, detail]) => (
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
                          if (value !== "other") setDetails("");
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
                  {reason === "other" ? (
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
              <View style={styles.blockRow}>
                <View style={styles.blockCopy}>
                  <ActivityText strong>
                    {blockOnly ? copy.block : copy.alsoBlock}
                  </ActivityText>
                  <ActivityText>{copy.blockDetail}</ActivityText>
                </View>
                <ActivityToggle
                  label={blockOnly ? copy.block : copy.alsoBlock}
                  value={block}
                  disabled={busy}
                  onChange={setBlock}
                />
              </View>
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
          <ActivityText strong>{name}</ActivityText>
          {confirmation.includes("report") && reason ? (
            <>
              <ActivityText>
                {copy.reason} ·{" "}
                {reason === "harassment" ? copy.unwanted : copy.other}
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
