import { Image } from "expo-image";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import {
  useEffect,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Choice, ErrorText, Field } from "@/components/ui";
import type { Circle, Language } from "@/lib/api";
import {
  assistantApi,
  type AssistantCard,
  type AssistantTurn,
  type ConfirmRequest,
} from "@/lib/assistant-api";
import {
  confirmationBody,
  hasClearedTiming,
  type Review,
} from "@/lib/assistant-conversation";
import { assistantCopy } from "@/lib/assistant-copy";
import { localizedType } from "@/lib/onboarding-i18n";
import {
  rippleCopy,
  rippleScopes,
  type RippleScope,
} from "@/lib/request-ripple";
import { colors, controls, spacing } from "@/theme/tokens.json";

export const assistantIcons = {
  history: {
    ios: "clock.arrow.circlepath",
    android: "history",
    web: "history",
  },
  add: { ios: "plus", android: "add", web: "add" },
  photo: { ios: "photo", android: "image", web: "image" },
  mic: { ios: "mic", android: "mic", web: "mic" },
  stop: { ios: "stop.fill", android: "stop", web: "stop" },
  send: { ios: "arrow.up", android: "arrow_upward", web: "arrow_upward" },
  close: { ios: "xmark", android: "close", web: "close" },
  next: {
    ios: "chevron.right",
    android: "chevron_right",
    web: "chevron_right",
  },
  tool: {
    ios: "wrench.and.screwdriver",
    android: "construction",
    web: "construction",
  },
  draft: { ios: "doc.text", android: "description", web: "description" },
  posted: {
    ios: "checkmark.circle.fill",
    android: "check_circle",
    web: "check_circle",
  },
} satisfies Record<string, SymbolViewProps["name"]>;

export function IconButton({
  icon,
  label,
  onPress,
  disabled,
  filled = false,
  busy = false,
}: {
  icon: keyof typeof assistantIcons;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  filled?: boolean;
  busy?: boolean;
}) {
  const tint = filled ? colors["on-action"] : colors.action;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={[
        styles.iconButton,
        filled && styles.filled,
        disabled && styles.dim,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={tint} />
      ) : (
        <SymbolView
          accessible={false}
          name={assistantIcons[icon]}
          size={20}
          tintColor={tint}
        />
      )}
    </Pressable>
  );
}

export function UserBubble({
  children,
  locale,
}: PropsWithChildren<{ locale: Language }>) {
  return (
    <View style={styles.userBubble}>
      {typeof children === "string" ? (
        <Text style={[localizedType("body", locale), styles.ink]}>
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}

function SentPhoto({ id, subject }: { id: string; subject?: string | null }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    assistantApi
      .media(id)
      .then(({ urls }) => {
        if (mounted) setUri(urls.display ?? urls.thumb ?? null);
      })
      .catch(() => {
        if (mounted) setUri(null);
      });
    return () => {
      mounted = false;
    };
  }, [id]);

  return uri ? (
    <Image
      source={uri}
      contentFit="cover"
      accessibilityLabel={subject ?? undefined}
      style={styles.sentPhoto}
    />
  ) : null;
}

export function ResultWidget({
  card,
  locale,
  onOpen,
  onChoose,
}: {
  card: AssistantCard;
  locale: Language;
  onOpen: () => void;
  onChoose?: () => void;
}) {
  const copy = assistantCopy[locale];
  const tool = card.type === "tool";
  const title = tool ? card.listing.title : card.owner.display_name;
  const detail = tool
    ? `${card.owner.display_name} · ${copy.available}`
    : card.listing.title;
  return (
    <View style={[styles.widget, styles.result]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        onPress={onOpen}
        style={[styles.widgetRow, styles.widgetWords]}
      >
        <View style={[styles.thumbnail, !tool && styles.avatar]}>
          {card.listing.photo_url && tool ? (
            <Image
              source={card.listing.photo_url}
              contentFit="cover"
              style={StyleSheet.absoluteFill}
            />
          ) : tool ? (
            <SymbolView
              name={assistantIcons.tool}
              size={24}
              tintColor={colors.action}
            />
          ) : (
            <Text style={[localizedType("card-title", locale), styles.green]}>
              {Array.from(card.owner.display_name)[0]}
            </Text>
          )}
        </View>
        <View style={styles.widgetWords}>
          <Text
            numberOfLines={2}
            style={[localizedType("field-label", locale), styles.ink]}
          >
            {title}
          </Text>
          <Text
            numberOfLines={2}
            style={[localizedType("supporting", locale), styles.secondary]}
          >
            {detail}
          </Text>
        </View>
        <SymbolView
          accessible={false}
          name={assistantIcons.next}
          tintColor={colors.action}
          size={16}
        />
      </Pressable>
      {onChoose ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            card.action === "borrow" ? copy.borrow : copy.help
          }
          onPress={onChoose}
          style={styles.widgetAction}
        >
          <Text style={[localizedType("field-label", locale), styles.green]}>
            {card.action === "borrow" ? copy.borrowShort : copy.helpShort}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ConversationTurn({
  turn,
  locale,
  openCard,
  chooseCard,
  review,
  draftMissing,
  draftDisabled,
  openRequest,
}: {
  turn: AssistantTurn;
  locale: Language;
  openCard: (card: AssistantCard) => void;
  chooseCard: (card: AssistantCard) => void;
  review: () => void;
  draftMissing?: () => void;
  draftDisabled?: boolean;
  openRequest: (id: string) => void;
}) {
  const copy = assistantCopy[locale];
  const body = localizedType("body", locale);
  const label = localizedType("field-label", locale);
  const listingRequests = turn.listing_requests ?? [];
  return (
    <View style={styles.turn}>
      {turn.text || turn.image_media_id ? (
        <UserBubble locale={locale}>
          {turn.image_media_id ? (
            <SentPhoto id={turn.image_media_id} subject={turn.image_subject} />
          ) : null}
          {turn.text ? (
            <Text style={[body, styles.ink]}>{turn.text}</Text>
          ) : null}
        </UserBubble>
      ) : null}
      <View style={styles.reply}>
        {turn.image_subject ? (
          <Text style={[label, styles.green]}>{turn.image_subject}</Text>
        ) : null}
        <Text style={[body, styles.ink]}>{turn.reply}</Text>
      </View>
      {turn.no_matches && draftMissing ? (
        <Button
          variant="secondary"
          label={copy.draftMissing}
          labelStyle={label}
          disabled={draftDisabled}
          onPress={draftMissing}
        />
      ) : null}
      {(["tool", "helper"] as const).map((type) => {
        const cards = turn.cards.filter((card) => card.type === type);
        if (!cards.length) return null;
        return (
          <View key={type} style={styles.group}>
            <Text accessibilityRole="header" style={[label, styles.secondary]}>
              {type === "tool" ? copy.tools : copy.helpers}
            </Text>
            {cards.map((card) => (
              <ResultWidget
                key={card.listing.id}
                card={card}
                locale={locale}
                onOpen={() => openCard(card)}
                onChoose={
                  turn.clarification ||
                  listingRequests.some(
                    (request) => request.listing_id === card.listing.id,
                  )
                    ? undefined
                    : () => chooseCard(card)
                }
              />
            ))}
          </View>
        );
      })}
      {listingRequests.map((request) => (
        <Pressable
          key={request.request_id}
          accessibilityRole="button"
          accessibilityLabel={`${copy.viewRequest} · ${request.title}`}
          onPress={() => openRequest(request.request_id)}
          style={[styles.widgetRow, styles.posted]}
        >
          <SymbolView
            name={assistantIcons.posted}
            size={18}
            tintColor={colors.action}
          />
          <View style={styles.widgetWords}>
            <Text style={[label, styles.green]}>
              {request.kind === "help" ? copy.helpSent : copy.borrowSent}
            </Text>
            <Text
              style={[localizedType("supporting", locale), styles.secondary]}
            >
              {request.title}
            </Text>
          </View>
          <SymbolView
            name={assistantIcons.next}
            size={16}
            tintColor={colors.action}
          />
        </Pressable>
      ))}
      {turn.request_id ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.viewRequest}
          onPress={() => openRequest(turn.request_id!)}
          style={[styles.widgetRow, styles.posted]}
        >
          <SymbolView
            name={assistantIcons.posted}
            size={20}
            tintColor={colors.action}
          />
          <Text style={[label, styles.green, styles.widgetWords]}>
            {copy.posted}
          </Text>
          <SymbolView
            name={assistantIcons.next}
            size={16}
            tintColor={colors.action}
          />
        </Pressable>
      ) : turn.draft && !turn.clarification && !listingRequests.length ? (
        <View style={[styles.widget, styles.draft]}>
          <View style={styles.widgetRow}>
            <SymbolView
              name={assistantIcons.draft}
              size={22}
              tintColor={colors.action}
            />
            <View style={styles.widgetWords}>
              <Text
                style={[localizedType("supporting", locale), styles.secondary]}
              >
                {copy.pending}
              </Text>
              <Text style={[label, styles.ink]}>{turn.draft.title}</Text>
            </View>
          </View>
          <View style={styles.draftBody}>
            <Text style={[localizedType("supporting", locale), styles.ink]}>
              {turn.draft.description}
            </Text>
            {turn.draft.when_text ? (
              <Text style={[label, styles.secondary]}>
                {turn.draft.when_text}
              </Text>
            ) : null}
            <Button label={copy.review} onPress={review} labelStyle={label} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function AssistantSheet({
  title,
  locale,
  close,
  children,
  footer,
}: PropsWithChildren<{
  title: string;
  locale: Language;
  close: () => void;
  footer?: ReactNode;
}>) {
  const copy = assistantCopy[locale];
  return (
    <Modal
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaView style={styles.sheet} accessibilityViewIsModal>
        <KeyboardAvoidingView
          style={styles.sheet}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.sheetHeader}>
            <Text
              accessibilityRole="header"
              style={[
                localizedType("section-heading", locale),
                styles.ink,
                styles.widgetWords,
              ]}
            >
              {title}
            </Text>
            <IconButton icon="close" label={copy.close} onPress={close} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetBody}
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

export function ReviewSheet({
  review,
  homeCircle,
  locale,
  busy,
  error,
  close,
  confirm,
}: {
  review: Review;
  homeCircle: Circle | null | undefined;
  locale: Language;
  busy: boolean;
  error: string | null;
  close: () => void;
  confirm: (body: ConfirmRequest) => void;
}) {
  const copy = assistantCopy[locale];
  const [description, setDescription] = useState(review.text);
  const [when, setWhen] = useState(review.when);
  const [scope, setScope] = useState<RippleScope>("han");
  const delivery = rippleCopy[locale];
  const body = confirmationBody(
    review,
    description,
    when,
    homeCircle?.id,
    scope,
  );
  const needsCircle = !review.listingId && !homeCircle;
  const localizedCircleName = homeCircle?.name_translations[locale];
  const circleName =
    typeof localizedCircleName === "string"
      ? localizedCircleName
      : homeCircle?.name;
  let validation = null;
  if (!description.trim()) validation = copy.requestRequired;
  else if (hasClearedTiming(review, description, when))
    validation = copy.removeTiming;
  else if (!body) validation = copy.requestTooLong;
  const label = localizedType("field-label", locale);
  const text = localizedType("body", locale);
  return (
    <AssistantSheet
      title={copy.review}
      locale={locale}
      close={close}
      footer={
        <View style={styles.reviewActions}>
          <Button
            variant="secondary"
            label={copy.cancel}
            disabled={busy}
            onPress={close}
            labelStyle={label}
          />
          <Button
            label={copy.post}
            disabled={!body || needsCircle}
            busy={busy}
            onPress={() => {
              if (body && !needsCircle) confirm(body);
            }}
            labelStyle={label}
            style={styles.widgetWords}
          />
        </View>
      }
    >
      <View style={styles.reviewHeading}>
        <Text style={[label, styles.green]}>{copy[review.kind]}</Text>
        {review.title ? (
          <Text style={[localizedType("card-title", locale), styles.ink]}>
            {review.title}
          </Text>
        ) : null}
        {review.recipient ? (
          <Text style={[localizedType("supporting", locale), styles.secondary]}>
            {copy.to} · {review.recipient}
          </Text>
        ) : null}
      </View>
      <Field
        label={copy.details}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
        maxLength={2000}
        editable={!busy}
        style={[text, styles.descriptionInput]}
        labelStyle={label}
      />
      <Field
        label={copy.when}
        placeholder={copy.timeExample}
        value={when}
        onChangeText={setWhen}
        maxLength={180}
        editable={!busy}
        style={text}
        labelStyle={label}
      />
      {!review.listingId && homeCircle ? (
        <View style={styles.reviewHeading}>
          <Text style={[label, styles.ink]}>{delivery.limit}</Text>
          <Choice
            options={rippleScopes.map((value) => ({
              value,
              label:
                value === "han"
                  ? (circleName ?? delivery.stages.han)
                  : delivery.stages[value],
            }))}
            value={scope}
            onChange={setScope}
            disabled={busy}
            labelStyle={() => label}
          />
          <Text style={[localizedType("supporting", locale), styles.secondary]}>
            {delivery.startsWithFamily}
          </Text>
        </View>
      ) : null}
      {validation || error || needsCircle ? (
        <ErrorText>{validation ?? error ?? copy.circleRequired}</ErrorText>
      ) : null}
    </AssistantSheet>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: controls["touch-target"],
    height: controls["touch-target"],
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
  },
  filled: { backgroundColor: colors.action },
  dim: { opacity: 0.45 },
  turn: { gap: 12, marginBottom: 8 },
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "90%",
    gap: 6,
    backgroundColor: colors.wash,
    borderRadius: 18,
    borderBottomRightRadius: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  sentPhoto: {
    width: 186,
    height: 124,
    borderRadius: 10,
    backgroundColor: colors.paper,
  },
  reply: { gap: 4, maxWidth: "94%" },
  ink: { color: colors.ink },
  green: { color: colors.action },
  secondary: { color: colors.secondary },
  group: { gap: spacing["related-gap"] },
  widget: {
    backgroundColor: colors.canvas,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.rule,
    overflow: "hidden",
  },
  result: { flexDirection: "row", alignItems: "center" },
  widgetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    minHeight: controls["touch-target"],
  },
  thumbnail: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: colors.wash,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  avatar: { borderRadius: 23 },
  widgetWords: { flex: 1, minWidth: 0 },
  widgetAction: {
    minHeight: controls["touch-target"],
    paddingHorizontal: 12,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
    justifyContent: "center",
  },
  posted: { backgroundColor: colors.paper, borderRadius: 12 },
  draft: { backgroundColor: colors.paper },
  draftBody: { gap: spacing["related-gap"], padding: 12, paddingTop: 0 },
  sheet: { flex: 1, backgroundColor: colors.canvas },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 20,
    paddingRight: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
  },
  sheetBody: { padding: spacing["screen-gutter"], gap: spacing["card-inset"] },
  sheetFooter: {
    padding: spacing["screen-gutter"],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
  },
  reviewHeading: {
    gap: 5,
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.paper,
  },
  descriptionInput: { minHeight: 104 },
  reviewActions: { flexDirection: "row", gap: spacing["related-gap"] },
});
