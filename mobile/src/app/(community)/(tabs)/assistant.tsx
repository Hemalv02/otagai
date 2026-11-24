import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { type ComponentRef, useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  AssistantSheet,
  ConversationTurn,
  IconButton,
  ReviewSheet,
  UserBubble,
} from "@/components/assistant-widgets";
import { CommunityScreen } from "@/components/community-screen";
import { Button, ErrorText } from "@/components/ui";
import { ApiError, type Page } from "@/lib/api";
import {
  assistantApi,
  assistantError,
  type AssistantCard,
  type AssistantThread,
  type AssistantTurn,
  type ConfirmRequest,
  type MediaFile,
} from "@/lib/assistant-api";
import {
  makeReview,
  mergeTurns,
  type Review,
} from "@/lib/assistant-conversation";
import { assistantCopy } from "@/lib/assistant-copy";
import { useMemberships } from "@/lib/memberships";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useAssistantVoice } from "@/lib/use-assistant-voice";
import { colors, spacing } from "@/theme/tokens.json";

type Attachment = MediaFile & { mediaId?: string };

export default function AssistantScreen() {
  const localizedType = useLocalizedType();
  const { locale } = useOnboardingText();
  const { state: memberships } = useMemberships();
  const copy = assistantCopy[locale];
  const homeCircle =
    memberships.status === "ready"
      ? memberships.items.find((membership) => membership.status === "approved")
          ?.circle
      : null;
  const [threads, setThreads] = useState<Page<AssistantThread>>({
    items: [],
    next_cursor: null,
  });
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [earlier, setEarlier] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<Attachment | null>(null);
  const [pending, setPending] = useState<{
    text: string;
    photo: Attachment | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrySend, setRetrySend] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const sending = useRef(false);
  const confirming = useRef(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const shouldScroll = useRef(false);

  const jumpToLatest = useCallback(() => {
    requestAnimationFrame(() =>
      scroll.current?.scrollToEnd({ animated: false }),
    );
  }, []);

  const voice = useAssistantVoice(
    (transcript) =>
      setText((current) =>
        [current.trim(), transcript].filter(Boolean).join(" ").slice(0, 2000),
      ),
    (reason, error) =>
      setError(
        reason === "denied"
          ? copy.micDenied
          : reason === "unavailable"
            ? copy.micUnavailable
            : reason === "inaudible"
              ? copy.noSpeech
              : assistantError(error, locale),
      ),
  );
  const last = turns.at(-1);
  const voiceActive = voice.status !== "idle";
  const locked = pending !== null || voiceActive;
  const label = localizedType("field-label", locale);
  const supporting = localizedType("supporting", locale);

  async function pickPhoto() {
    setError(null);
    try {
      const selected = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.72,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (selected.canceled) return;
      const image = selected.assets[0];
      if (image)
        setPhoto({
          uri: image.uri,
          file: image.file,
        });
    } catch {
      setError(copy.failed);
    }
  }

  async function send(prefill?: string) {
    const prompt = prefill ?? text.trim();
    if (sending.current || locked || (!prompt && !photo)) return;
    sending.current = true;
    setRetrySend(false);
    let attachment = photo;
    Keyboard.dismiss();
    setError(null);
    setText("");
    setPhoto(null);
    shouldScroll.current = true;
    setPending({ text: prompt, photo: attachment });
    try {
      if (attachment && !attachment.mediaId) {
        const media = await assistantApi.upload("ask", attachment);
        attachment = { ...attachment, mediaId: media.id };
      }
      const turn = await assistantApi.send({
        language: locale,
        ...(prompt ? { text: prompt } : {}),
        ...(attachment?.mediaId ? { image_media_id: attachment.mediaId } : {}),
        ...(last ? { previous_turn_id: last.id } : {}),
      });
      shouldScroll.current = true;
      setTurns((current) => mergeTurns(current, [turn]));
    } catch (error) {
      setText(prompt);
      setPhoto(attachment);
      setRetrySend(true);
      setError(assistantError(error, locale));
    } finally {
      setPending(null);
      sending.current = false;
    }
  }

  async function older() {
    if (!earlier || !last || moreBusy) return;
    setMoreBusy(true);
    setError(null);
    try {
      const page = await assistantApi.turns(last.thread_id, earlier);
      setTurns((current) => mergeTurns(current, page.items));
      setEarlier(page.next_cursor);
    } catch {
      setError(copy.failed);
    } finally {
      setMoreBusy(false);
    }
  }

  async function showHistory(more = false) {
    setHistoryOpen(true);
    setHistoryError(false);
    setHistoryBusy(true);
    try {
      const page = await assistantApi.threads(
        more ? threads.next_cursor : null,
      );
      setThreads((current) =>
        more ? { ...page, items: [...current.items, ...page.items] } : page,
      );
    } catch {
      setHistoryError(true);
    } finally {
      setHistoryBusy(false);
    }
  }

  function startNew() {
    setHistoryOpen(false);
    setTurns([]);
    setEarlier(null);
    setText("");
    setPhoto(null);
    setError(null);
    setRetrySend(false);
  }

  async function switchThread(id: string) {
    setHistoryBusy(true);
    setHistoryError(false);
    try {
      const page = await assistantApi.turns(id);
      startNew();
      shouldScroll.current = true;
      setTurns(mergeTurns([], page.items));
      setEarlier(page.next_cursor);
    } catch {
      setHistoryError(true);
    } finally {
      setHistoryBusy(false);
    }
  }

  function openCard(card: AssistantCard) {
    router.push({
      pathname: "/assistant-detail/[type]/[id]",
      params:
        card.type === "tool"
          ? { type: "listing", id: card.listing.id }
          : { type: "helper", id: card.owner.id, skill: card.listing.id },
    });
  }

  function openReview(turn: AssistantTurn, card?: AssistantCard) {
    Keyboard.dismiss();
    setPostError(null);
    const message = card
      ? (card.action === "borrow" ? copy.borrowDraft : copy.helpDraft)(
          card.listing.title,
        )
      : undefined;
    setReview(makeReview(turn, card, message));
  }

  async function confirm(body: ConfirmRequest) {
    if (!review || confirming.current) return;
    confirming.current = true;
    setPosting(true);
    setPostError(null);
    try {
      const posted = await assistantApi.confirm(review.turnId, body);
      setTurns((current) =>
        current.map((turn) => {
          if (turn.id !== review.turnId) return turn;
          if (!body.listing_id) return { ...turn, request_id: posted.id };
          return {
            ...turn,
            listing_requests: [
              ...(turn.listing_requests ?? []).filter(
                (item) => item.listing_id !== body.listing_id,
              ),
              {
                listing_id: body.listing_id,
                request_id: posted.id,
                title: review.title,
                kind: posted.kind,
              },
            ],
          };
        }),
      );
      setReview(null);
      shouldScroll.current = true;
    } catch (error) {
      setPostError(
        error instanceof ApiError && [404, 409].includes(error.status)
          ? copy.unavailable
          : assistantError(error, locale),
      );
    } finally {
      setPosting(false);
      confirming.current = false;
    }
  }

  return (
    <CommunityScreen
      title={copy.title}
      titleAction={
        <IconButton
          icon="history"
          label={copy.history}
          disabled={locked || moreBusy}
          onPress={() => void showHistory()}
        />
      }
      scrollRef={scroll}
      fixedTitle
      compactTitle
      keyboard
      onContentSizeChange={() => {
        if (shouldScroll.current) {
          shouldScroll.current = false;
          jumpToLatest();
        }
      }}
      footer={
        <>
          {error ? (
            <View style={styles.sendError}>
              <View style={styles.fill}>
                <ErrorText>{error}</ErrorText>
              </View>
              {retrySend ? (
                <Button
                  label={copy.retry}
                  variant="text"
                  labelStyle={label}
                  disabled={locked}
                  onPress={() => void send()}
                />
              ) : null}
            </View>
          ) : null}
          <View style={styles.composer}>
            {photo ? (
              <View style={styles.attachment}>
                <Image
                  source={photo.uri}
                  style={styles.preview}
                  contentFit="cover"
                />
                <IconButton
                  icon="close"
                  label={copy.removePhoto}
                  disabled={locked}
                  onPress={() => setPhoto(null)}
                />
              </View>
            ) : null}
            {voice.status === "recording" ? (
              <View style={styles.recording}>
                <View style={styles.recordingDot} />
                <Text style={[supporting, styles.ink]}>{copy.recording}</Text>
              </View>
            ) : voice.status === "transcribing" ? (
              <Text
                accessibilityLiveRegion="polite"
                style={[supporting, styles.recording, styles.secondary]}
              >
                {copy.transcribing}
              </Text>
            ) : (
              <TextInput
                accessibilityLabel={copy.message}
                placeholder={last?.clarification ? copy.answer : copy.composer}
                placeholderTextColor={colors.secondary}
                value={text}
                onChangeText={setText}
                editable={!locked}
                maxLength={2000}
                multiline
                style={[localizedType("body", locale), styles.input]}
              />
            )}
            <View style={styles.composerActions}>
              {voice.status === "recording" ? (
                <>
                  <IconButton
                    icon="close"
                    label={copy.cancelVoice}
                    onPress={() => void voice.stop(true)}
                  />
                  <View style={styles.fill} />
                  <IconButton
                    icon="stop"
                    label={copy.stop}
                    filled
                    onPress={() => void voice.stop()}
                  />
                </>
              ) : (
                <>
                  <IconButton
                    icon="photo"
                    label={copy.photo}
                    disabled={locked}
                    onPress={() => void pickPhoto()}
                  />
                  <IconButton
                    icon="mic"
                    label={copy.mic}
                    disabled={locked}
                    onPress={() => {
                      Keyboard.dismiss();
                      setError(null);
                      void voice.start();
                    }}
                  />
                  <View style={styles.fill} />
                  <IconButton
                    icon="send"
                    label={copy.send}
                    disabled={locked || (!text.trim() && !photo)}
                    filled
                    onPress={() => void send()}
                  />
                </>
              )}
            </View>
          </View>
        </>
      }
    >
      {!turns.length && !pending ? (
        <View style={styles.empty}>
          <Text
            accessibilityRole="header"
            style={[localizedType("section-heading", locale), styles.ink]}
          >
            {copy.welcome}
          </Text>
          <Text style={[localizedType("body", locale), styles.secondary]}>
            {copy.intro}
          </Text>
          <View style={styles.examples}>
            {copy.examples.map((example) => (
              <Pressable
                key={example}
                accessibilityRole="button"
                style={styles.example}
                onPress={() => setText(example)}
              >
                <Text style={[supporting, styles.green]}>{example}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {earlier ? (
        <Button
          variant="text"
          label={copy.earlier}
          labelStyle={label}
          disabled={locked}
          busy={moreBusy}
          onPress={() => void older()}
        />
      ) : null}
      {turns.map((turn) => (
        <ConversationTurn
          key={turn.id}
          turn={turn}
          locale={locale}
          openCard={openCard}
          chooseCard={(card) => openReview(turn, card)}
          review={() => openReview(turn)}
          draftMissing={
            turn.id === last?.id
              ? () => void send(copy.draftMissingPrompt)
              : undefined
          }
          draftDisabled={locked || !!text.trim() || !!photo}
          openRequest={(id) =>
            router.push({
              pathname: "/requests/[id]",
              params: { id },
            })
          }
        />
      ))}
      {pending ? (
        <>
          <UserBubble locale={locale}>
            {pending.photo ? (
              <Image
                source={pending.photo.uri}
                style={styles.pendingPhoto}
                contentFit="cover"
              />
            ) : null}
            {pending.text ? (
              <Text style={[localizedType("body", locale), styles.ink]}>
                {pending.text}
              </Text>
            ) : null}
          </UserBubble>
          <View style={styles.thinking}>
            <ActivityIndicator color={colors.action} size="small" />
            <Text
              accessibilityLiveRegion="polite"
              style={[supporting, styles.secondary]}
            >
              {copy.thinking}
            </Text>
          </View>
        </>
      ) : null}
      {historyOpen ? (
        <AssistantSheet
          title={copy.history}
          locale={locale}
          close={() => setHistoryOpen(false)}
        >
          <Button
            label={copy.newChat}
            labelStyle={label}
            disabled={historyBusy}
            onPress={startNew}
          />
          {historyBusy ? (
            <ActivityIndicator
              color={colors.action}
              accessibilityLabel={copy.loading}
            />
          ) : null}
          {historyError ? (
            <>
              <ErrorText>{copy.failed}</ErrorText>
              <Button
                variant="text"
                label={copy.retry}
                onPress={() => void showHistory()}
                labelStyle={label}
              />
            </>
          ) : null}
          {!historyBusy && !threads.items.length ? (
            <Text style={[supporting, styles.secondary]}>{copy.noHistory}</Text>
          ) : null}
          {threads.items.map((thread) => (
            <Pressable
              key={thread.id}
              accessibilityRole="button"
              disabled={historyBusy}
              onPress={() => void switchThread(thread.id)}
              style={styles.historyRow}
            >
              <Text numberOfLines={2} style={[label, styles.ink]}>
                {thread.title}
              </Text>
              <Text style={[supporting, styles.secondary]}>
                {new Intl.DateTimeFormat(locale, {
                  month: "short",
                  day: "numeric",
                }).format(new Date(thread.updated_at))}
              </Text>
            </Pressable>
          ))}
          {threads.next_cursor ? (
            <Button
              variant="text"
              label={copy.more}
              disabled={historyBusy}
              onPress={() => void showHistory(true)}
              labelStyle={label}
            />
          ) : null}
        </AssistantSheet>
      ) : null}
      {review ? (
        <ReviewSheet
          key={`${review.turnId}-${review.listingId ?? "draft"}`}
          review={review}
          homeCircle={homeCircle}
          locale={locale}
          busy={posting}
          error={postError}
          close={() => {
            if (!confirming.current) setReview(null);
          }}
          confirm={(body) => void confirm(body)}
        />
      ) : null}
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
  green: { color: colors.action },
  fill: { flex: 1 },
  empty: { paddingTop: 12, gap: 8 },
  sendError: { flexDirection: "row", alignItems: "center", gap: 8 },
  examples: { gap: 8, alignItems: "flex-start", marginTop: 12 },
  example: {
    borderRadius: 20,
    borderColor: colors.rule,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  composer: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 20,
    backgroundColor: colors.canvas,
    padding: 4,
  },
  composerActions: { flexDirection: "row", alignItems: "center", gap: 2 },
  input: {
    color: colors.ink,
    minHeight: 48,
    maxHeight: 114,
    paddingHorizontal: 12,
    paddingVertical: 9,
    textAlignVertical: "top",
  },
  attachment: {
    flexDirection: "row",
    gap: 4,
    alignItems: "flex-start",
    margin: 8,
  },
  preview: { width: 66, height: 54, borderRadius: 8 },
  pendingPhoto: { width: 186, height: 124, borderRadius: 10 },
  recording: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.clay,
  },
  thinking: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  historyRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
    paddingVertical: spacing["control-gap"],
    gap: 2,
  },
});
