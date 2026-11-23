import { router } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { Button, Choice, Field } from "@/components/ui";
import { type RequestDraft, useCommunityDemo } from "@/lib/community-demo";
import { listingText, useDemoListings } from "@/lib/demo-listings";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { requestAudiences, requestCopy } from "@/lib/request-demo-copy";
import { colors, controls, spacing } from "@/theme/tokens.json";

const politeCopy = {
  en: {
    action: "Use polite wording",
    intro: "Hello, could you help me with the following?",
    thanks: "Thank you for considering it.",
  },
  ja: {
    action: "丁寧な文面にする",
    intro: "お手数ですが、次の件でお力をお借りできますか。",
    thanks: "ご検討いただけますと幸いです。",
  },
  bn: {
    action: "বিনীত ভাষা ব্যবহার করুন",
    intro: "নমস্কার, নিচের কাজে কি একটু সাহায্য করতে পারবেন?",
    thanks: "সময় নিয়ে পড়ার জন্য ধন্যবাদ।",
  },
};

export default function AskReviewScreen() {
  const { locale } = useOnboardingText();
  const copy = requestCopy[locale];
  const { actor, askDraft, createRequest, setAskDraft } = useCommunityDemo();
  const listingId = askDraft?.listingId;
  const { listings } = useDemoListings();
  const listing = listings.find((item) => item.id === listingId);
  const isLoan = listing?.kind === "tool";
  const canSendDirect =
    listing?.postedBy !== undefined && listing.postedBy !== actor;
  const [title, setTitle] = useState(askDraft?.title ?? "");
  const [description, setDescription] = useState(askDraft?.description ?? "");
  const [timing, setTiming] = useState("");
  const [audience, setAudience] = useState<RequestDraft["audience"]>(
    canSendDirect ? "direct" : "circle",
  );
  const [editingMessage, setEditingMessage] = useState(false);
  const [usedPoliteWording, setUsedPoliteWording] = useState(false);
  const [showAudienceChoices, setShowAudienceChoices] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const submitted = useRef(false);
  const allowSend =
    confirmed && Boolean(title.trim() && description.trim() && timing.trim());
  const editingLabel = localizedType("field-label", locale);
  const body = localizedType("body", locale);
  const supporting = localizedType("supporting", locale);
  const button = localizedType("button", locale);
  const audienceOptions = requestAudiences
    .filter((value) => value !== "direct" || canSendDirect)
    .map((value) => ({ value, label: copy.audienceLabels[value] }));

  function send() {
    if (!allowSend || submitted.current) return;
    submitted.current = true;
    const id = createRequest({
      title: title.trim(),
      description: description.trim(),
      timing: timing.trim(),
      audience,
      ...(listingId ? { listingId } : {}),
    });
    setAskDraft(null);
    router.replace({ pathname: "/request-sent/[id]", params: { id } });
  }

  if (!askDraft) {
    return (
      <CommunityScreen back title={copy.review}>
        <Button
          label={copy.newRequest}
          labelStyle={button}
          onPress={() => router.replace("/ask")}
        />
      </CommunityScreen>
    );
  }

  return (
    <CommunityScreen
      back
      keyboard
      title={copy.review}
      subtitle={listing ? listingText(listing.title, locale) : undefined}
      footer={
        <Button
          label={copy.send}
          labelStyle={button}
          disabled={!allowSend}
          onPress={send}
        />
      }
    >
      <Field
        label={copy.requestTitle}
        labelStyle={editingLabel}
        value={title}
        onChangeText={(value) => {
          setTitle(value);
          setConfirmed(false);
        }}
        style={body}
        maxLength={100}
      />
      {editingMessage || !description.trim() ? (
        <Field
          label={copy.requestMessage}
          labelStyle={editingLabel}
          value={description}
          onChangeText={(value) => {
            setDescription(value);
            setConfirmed(false);
          }}
          style={[body, styles.messageField]}
          multiline
          maxLength={1000}
        />
      ) : (
        <>
          <View style={styles.messagePreview}>
            <Text style={[editingLabel, styles.ink]}>
              {copy.requestMessage}
            </Text>
            <Text style={[body, styles.ink]}>{description}</Text>
          </View>
          <Button
            label={copy.editMessage}
            labelStyle={[button, styles.actionLabel]}
            variant="secondary"
            style={styles.editButton}
            onPress={() => setEditingMessage(true)}
          />
          {!usedPoliteWording ? (
            <Button
              label={politeCopy[locale].action}
              labelStyle={editingLabel}
              variant="text"
              onPress={() => {
                const { intro, thanks } = politeCopy[locale];
                setDescription([intro, description, thanks].join("\n\n"));
                setUsedPoliteWording(true);
                setConfirmed(false);
              }}
            />
          ) : null}
        </>
      )}
      <Field
        label={isLoan ? copy.listingTiming : copy.timing}
        labelStyle={editingLabel}
        value={timing}
        placeholder={isLoan ? copy.listingTimingExample : copy.timingExample}
        onChangeText={(value) => {
          setTiming(value);
          setConfirmed(false);
        }}
        style={body}
        maxLength={160}
      />
      <View style={styles.audience}>
        <Text style={[editingLabel, styles.ink]}>{copy.audience}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${copy.audience}. ${copy.audienceLabels[audience]}`}
          accessibilityState={{ expanded: showAudienceChoices }}
          style={styles.audienceField}
          onPress={() => setShowAudienceChoices(!showAudienceChoices)}
        >
          <Text style={[body, styles.audienceLabel]}>
            {copy.audienceLabels[audience]}
          </Text>
          <Text
            importantForAccessibility="no"
            style={[editingLabel, styles.actionLabel]}
          >
            {showAudienceChoices ? "−" : "+"}
          </Text>
        </Pressable>
        {showAudienceChoices ? (
          <Choice
            stacked
            labelStyle={() => body}
            options={audienceOptions}
            value={audience}
            onChange={(value) => {
              if (value !== audience) setConfirmed(false);
              setAudience(value);
              setShowAudienceChoices(false);
            }}
          />
        ) : null}
        <Text style={[supporting, styles.secondary]}>{copy.audienceHint}</Text>
      </View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`${copy.confirm}. ${copy.confirmHint}`}
        accessibilityState={{ checked: confirmed }}
        onPress={() => setConfirmed(!confirmed)}
        style={styles.confirm}
      >
        <View style={[styles.checkbox, confirmed && styles.checked]}>
          {confirmed ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <View style={styles.confirmText}>
          <Text style={[editingLabel, styles.ink]}>{copy.confirm}</Text>
          <Text style={[supporting, styles.secondary]}>{copy.confirmHint}</Text>
        </View>
      </Pressable>
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  messageField: { minHeight: 96 },
  messagePreview: {
    borderLeftColor: colors.clay,
    borderLeftWidth: 2,
    gap: 2,
    paddingLeft: spacing["control-gap"],
  },
  editButton: {
    borderColor: colors.control,
    minHeight: controls["touch-target"],
  },
  actionLabel: { color: colors.action },
  audience: { gap: spacing["related-gap"] },
  audienceField: {
    minHeight: controls["touch-target"],
    borderColor: colors.control,
    borderRadius: controls.radius,
    borderWidth: 1,
    alignItems: "center",
    flexDirection: "row",
    gap: spacing["control-gap"],
    paddingHorizontal: spacing["control-gap"],
    paddingVertical: spacing["related-gap"],
  },
  audienceLabel: { color: colors.ink, flex: 1 },
  confirm: {
    minHeight: controls["touch-target"],
    alignItems: "center",
    flexDirection: "row",
    gap: spacing["control-gap"],
  },
  confirmText: { flex: 1 },
  checkbox: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderColor: colors.control,
    borderRadius: 4,
    borderWidth: 1,
  },
  checked: { backgroundColor: colors.action, borderColor: colors.action },
  checkmark: { color: colors["on-action"], fontSize: 16, lineHeight: 20 },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
});
