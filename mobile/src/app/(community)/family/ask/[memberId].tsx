import { router, useLocalSearchParams, usePreventRemove } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { ActingBanner, SelectionCard } from "@/components/family-forms";
import {
  AccountSkeleton,
  FamilyNotice,
  initial,
  ListRow,
  Thumbnail,
} from "@/components/family-ui";
import { Button, ErrorText, Field } from "@/components/ui";
import { ApiError, type Language } from "@/lib/api";
import { familyApi, type DestinationCircle } from "@/lib/family-api";
import { familyAskCopy } from "@/lib/family-ask-copy";
import {
  actingRequestBody,
  classifySendFailure,
  LIMITS,
  normalizeMemberId,
  type SendFailure,
  validateActingDraft,
} from "@/lib/family-consent";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, controls, spacing } from "@/theme/tokens.json";

type Load =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-allowed"; name: string }
  | {
      status: "ready";
      name: string;
      destinations: DestinationCircle[];
      canViewActivity: boolean;
    };

type Step = "compose" | "review" | "sent";

function circleName(circle: DestinationCircle, locale: Language) {
  const translated = circle.name_translations[locale];
  return typeof translated === "string" ? translated : circle.name;
}

async function loadComposer(
  memberId: string,
  authUserId: string,
  signal: AbortSignal,
): Promise<Load> {
  const grants = await familyApi.grants("caretaker", signal, authUserId);
  const grant = grants.find((item) => item.member_user_id === memberId);
  const name = grant?.other?.display_name ?? "";
  if (!grant || !grant.can_post_requests)
    return { status: "not-allowed", name };
  try {
    const destinations = await familyApi.destinationsFor(
      memberId,
      signal,
      authUserId,
    );
    return {
      status: "ready",
      name,
      destinations,
      canViewActivity: grant.can_view_activity,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return { status: "not-allowed", name };
    }
    throw error;
  }
}

export default function ActingRequestScreen() {
  const params = useLocalSearchParams<{ memberId: string }>();
  const memberId =
    typeof params.memberId === "string"
      ? normalizeMemberId(params.memberId)
      : null;
  const { session } = useSession();
  const authUserId = session?.user.id;
  if (!authUserId) return null;
  return (
    <ActingRequestComposer
      key={`${authUserId}:${memberId ?? ""}`}
      authUserId={authUserId}
      memberId={memberId}
    />
  );
}

function ActingRequestComposer({
  memberId,
  authUserId,
}: {
  memberId: string | null;
  authUserId: string;
}) {
  const { locale } = useOnboardingText();
  const localizedType = useLocalizedType();
  const copy = familyAskCopy[locale];
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [reload, setReload] = useState(0);
  const [step, setStep] = useState<Step>("compose");
  const [need, setNeed] = useState("");
  const [when, setWhen] = useState("");
  const [details, setDetails] = useState("");
  const [chosenCircle, setChosenCircle] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [sending, setSending] = useState(false);
  const submitting = useRef(false);
  const [failure, setFailure] = useState<SendFailure | null>(null);
  const [shareFailed, setShareFailed] = useState(false);
  const [sentId, setSentId] = useState<string | null>(null);
  const label = localizedType("field-label", locale);
  const button = localizedType("button", locale);
  const supporting = localizedType("supporting", locale);

  useEffect(() => {
    if (!memberId) return;
    const controller = new AbortController();
    let active = true;
    loadComposer(memberId, authUserId, controller.signal).then(
      (next) => {
        if (active) setLoad(next);
      },
      () => {
        if (active) setLoad({ status: "error" });
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [authUserId, memberId, reload]);

  const sendBlocked = failure === "revoked" || failure === "unconfirmed";
  const allowLeave = usePreventRemove(step === "review", ({ repeat }) => {
    if (submitting.current) return;
    if (sendBlocked) {
      allowLeave();
      repeat();
    } else {
      editReview();
    }
  });

  function editReview() {
    setFailure(null);
    setStep("compose");
  }

  function exitToMine() {
    allowLeave();
    router.dismissTo({
      pathname: "/family",
      params: { account: "self", at: String(Date.now()) },
    });
  }

  function retryLoad() {
    setLoad({ status: "loading" });
    setReload((value) => value + 1);
  }

  const name =
    load.status === "ready" || load.status === "not-allowed" ? load.name : "";
  const destinations = load.status === "ready" ? load.destinations : [];
  const circle =
    destinations.find((item) => item.id === chosenCircle) ??
    (failure === "destination" ? undefined : destinations[0]);
  const draft = { need, when, details, circleId: circle?.id ?? null };
  const problems = validateActingDraft(draft);
  const body = actingRequestBody(draft, locale, copy.whenPrefix);
  const hasDraft = Boolean(need.trim() || when.trim() || details.trim());
  const banner = name ? (
    <ActingBanner
      title={copy.bannerTitle(name)}
      detail={copy.bannerDetail(
        name,
        circle ? circleName(circle, locale) : null,
      )}
      locale={locale}
    />
  ) : null;

  async function send() {
    if (!memberId || sendBlocked || submitting.current || problems.length > 0)
      return;
    submitting.current = true;
    setSending(true);
    setFailure(null);
    try {
      const created = await familyApi.postFor(memberId, body, { authUserId });
      setSentId(created.id);
      setStep("sent");
    } catch (error) {
      const kind = classifySendFailure(
        error instanceof ApiError ? error.status : 0,
      );
      setFailure(kind);
      if (kind === "destination") {
        setStep("compose");
        setChosenCircle(null);
        setChoosing(true);
        retryLoad();
      }
    } finally {
      submitting.current = false;
      setSending(false);
    }
  }

  async function copyWording() {
    setShareFailed(false);
    try {
      await Share.share({ message: body.raw_text });
    } catch {
      setShareFailed(true);
    }
  }

  const switchAction = (
    <Button
      label={copy.switchToMine}
      labelStyle={label}
      variant="text"
      onPress={exitToMine}
    />
  );

  const keepWording = hasDraft ? (
    <View style={styles.card}>
      <Text selectable style={[localizedType("body", locale), styles.ink]}>
        {body.raw_text}
      </Text>
      <Button
        label={copy.copyWording}
        labelStyle={label}
        variant="outline"
        onPress={() => void copyWording()}
      />
      {shareFailed ? <ErrorText>{copy.shareFailed}</ErrorText> : null}
    </View>
  ) : null;

  if (!memberId || load.status === "not-allowed") {
    return (
      <CommunityScreen back title={copy.title} banner={banner}>
        <FamilyNotice
          title={name ? copy.notAllowedTitle(name) : copy.notAllowedGeneric}
          body={copy.notAllowedBody}
          locale={locale}
        />
        {keepWording}
        {switchAction}
      </CommunityScreen>
    );
  }
  if (load.status === "loading") {
    return (
      <CommunityScreen back title={copy.title} banner={banner}>
        <AccountSkeleton />
      </CommunityScreen>
    );
  }
  if (load.status === "error") {
    return (
      <CommunityScreen back title={copy.title} banner={banner}>
        <FamilyNotice
          tone="alert"
          title={copy.loadFailed}
          actionLabel={copy.retry}
          onAction={retryLoad}
          locale={locale}
        />
        {keepWording}
        {switchAction}
      </CommunityScreen>
    );
  }

  if (step === "sent" && sentId) {
    return (
      <CommunityScreen
        title={copy.sentTitle(name)}
        subtitle={copy.sentBody(name)}
        banner={banner}
      >
        <View style={styles.card}>
          <Text style={[label, styles.ink]}>{copy.requestId}</Text>
          <Text selectable style={[supporting, styles.ink]}>
            {sentId}
          </Text>
        </View>
        <Button
          label={copy.backToFamily}
          labelStyle={button}
          onPress={() => router.dismissTo("/family")}
        />
      </CommunityScreen>
    );
  }

  const failureMessage =
    failure === "session" ? copy.session : failure === "failed" ? copy.failed : null;
  const failureNotice =
    failure === "revoked" ? (
      <FamilyNotice
        tone="alert"
        title={copy.revokedTitle(name)}
        body={copy.keptBody}
        actionLabel={copy.copyWording}
        onAction={() => void copyWording()}
        locale={locale}
      />
    ) : failure === "destination" ? (
      <FamilyNotice
        tone="alert"
        title={copy.destinationTitle}
        body={copy.destinationBody}
        locale={locale}
      />
    ) : failure === "unconfirmed" ? (
      <FamilyNotice
        tone="alert"
        title={copy.unconfirmedTitle}
        body={
          load.canViewActivity ? copy.checkFamily : copy.checkWithMember(name)
        }
        actionLabel={copy.copyWording}
        onAction={() => void copyWording()}
        locale={locale}
      />
    ) : failureMessage ? (
      <ErrorText>{failureMessage}</ErrorText>
    ) : null;

  if (step === "review") {
    return (
      <CommunityScreen
        back
        title={copy.reviewTitle}
        banner={banner}
        footer={
          sendBlocked ? (
            <Button
              label={
                failure === "revoked" ? copy.switchToMine : copy.backToFamily
              }
              labelStyle={button}
              onPress={() => {
                if (failure === "revoked") {
                  exitToMine();
                } else {
                  allowLeave();
                  router.dismissTo("/family");
                }
              }}
            />
          ) : (
            <>
              <Button
                label={copy.send}
                labelStyle={button}
                busy={sending}
                disabled={problems.length > 0}
                onPress={() => void send()}
              />
              <Button
                label={copy.editRequest}
                labelStyle={label}
                variant="outline"
                disabled={sending}
                onPress={editReview}
              />
            </>
          )
        }
      >
        {failureNotice}
        {shareFailed ? <ErrorText>{copy.shareFailed}</ErrorText> : null}
        <View style={styles.card}>
          <Text selectable style={[localizedType("body", locale), styles.ink]}>
            {body.raw_text}
          </Text>
          <Text style={[supporting, styles.secondary]}>
            {`${copy.shareWith}: ${circle ? circleName(circle, locale) : ""}`}
          </Text>
        </View>
        <Text style={[supporting, styles.secondary]}>
          {copy.reviewNote(name)}
        </Text>
      </CommunityScreen>
    );
  }

  const noCircle = destinations.length === 0;
  return (
    <CommunityScreen
      back
      keyboard
      title={copy.title}
      banner={banner}
      footer={
        <Button
          label={copy.review}
          labelStyle={button}
          disabled={!circle}
          onPress={() => {
            setShowProblems(true);
            if (problems.length === 0) {
              setFailure(null);
              setStep("review");
            }
          }}
        />
      }
    >
      {switchAction}
      {failureNotice}
      {noCircle ? (
        <FamilyNotice
          title={copy.noCircleTitle(name)}
          body={copy.noCircleBody}
          locale={locale}
        />
      ) : null}
      <View style={styles.field}>
        <Field
          label={copy.need(name)}
          labelStyle={label}
          style={localizedType("body", locale)}
          value={need}
          onChangeText={setNeed}
          maxLength={LIMITS.need}
        />
        {showProblems && problems.includes("need") ? (
          <ErrorText>
            {need.trim() ? copy.tooLong : copy.needRequired}
          </ErrorText>
        ) : null}
      </View>
      <Field
        label={copy.when}
        labelStyle={label}
        style={localizedType("body", locale)}
        value={when}
        onChangeText={setWhen}
        maxLength={LIMITS.when}
      />
      <Field
        label={copy.details}
        labelStyle={label}
        style={[localizedType("body", locale), styles.multiline]}
        value={details}
        onChangeText={setDetails}
        maxLength={LIMITS.details}
        multiline
      />
      {circle ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${copy.shareWith}, ${circleName(circle, locale)}`}
          disabled={destinations.length < 2}
          onPress={() => setChoosing((value) => !value)}
        >
          <ListRow
            thumbnail={
              <Thumbnail
                letter={initial(circleName(circle, locale), locale)}
                shape="square"
                locale={locale}
              />
            }
            title={copy.shareWith}
            detail={circleName(circle, locale)}
            status={destinations.length > 1 ? copy.edit : ""}
            locale={locale}
          />
        </Pressable>
      ) : null}
      {choosing && (destinations.length > 1 || (!circle && !noCircle)) ? (
        <View accessibilityRole="radiogroup" style={styles.list}>
          <Text style={[label, styles.ink]}>{copy.chooseCircle}</Text>
          {destinations.map((item) => (
            <SelectionCard
              key={item.id}
              title={circleName(item, locale)}
              selected={item.id === circle?.id}
              onPress={() => {
                setChosenCircle(item.id);
                setChoosing(false);
              }}
              locale={locale}
            />
          ))}
        </View>
      ) : null}
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  field: { gap: 4 },
  list: { gap: spacing["related-gap"] },
  multiline: { minHeight: 96 },
  card: {
    gap: spacing["related-gap"],
    padding: spacing["card-inset"],
    borderRadius: controls.radius,
    backgroundColor: colors.paper,
  },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
});
