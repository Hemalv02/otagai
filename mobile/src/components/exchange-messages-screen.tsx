import { randomUUID } from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityStatus, ActivityText } from "@/components/activity-ui";
import { Button, ErrorText } from "@/components/ui";
import { api, ApiError, type Conversation } from "@/lib/api";
import { activityCopy, formatActivityDate } from "@/lib/activity-copy";
import {
  clearLoanMessageDraft,
  loadExchangeConversation,
  peekLoanMessageDraft,
} from "@/lib/exchange-conversation";
import { exchangeMessageCopy } from "@/lib/exchange-message-copy";
import { useLiveResource, usePagedResource } from "@/lib/live-resource";
import { neighbourCopy } from "@/lib/neighbour-copy";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, controls, spacing } from "@/theme/tokens.json";

export function ExchangeMessagesScreen({ mode }: { mode: "loan" | "help" }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { locale } = useOnboardingText();
  const { profile } = useSession();
  const profileId = profile.status === "ready" ? profile.profile.id : "";
  const thread = useLiveResource(
    useCallback(
      () => loadExchangeConversation(api, id, profileId, mode),
      [id, profileId, mode],
    ),
  );
  const copy = exchangeMessageCopy[locale];
  const partnerName = thread.data?.partnerName || copy.neighbour;
  const conversation = thread.data?.conversation;

  function back() {
    if (router.canGoBack()) router.back();
    else
      router.replace({
        pathname: mode === "loan" ? "/loans/[id]" : "/exchanges/[id]",
        params: { id },
      });
  }

  if (conversation) {
    return (
      <ExchangeChat
        key={`${conversation.id}:${profileId}`}
        onBack={back}
        conversation={conversation}
        profileId={profileId}
        loanId={mode === "loan" ? id : undefined}
        partnerName={partnerName}
      />
    );
  }

  return (
    <ChatFrame
      onBack={back}
      title={partnerName}
      refreshing={thread.loading}
      refresh={thread.reload}
    >
      <View style={styles.notice}>
        <ActivityStatus
          loading={thread.loading}
          error={thread.error}
          retry={thread.reload}
        />
        {!thread.loading && !thread.error ? (
          <View style={styles.section}>
            <ActivityText>{copy.unavailable}</ActivityText>
            <Button
              variant="secondary"
              label={activityCopy[locale].retry}
              onPress={thread.reload}
            />
          </View>
        ) : null}
      </View>
    </ChatFrame>
  );
}

const chatIcons = {
  back: { ios: "chevron.backward", android: "arrow_back", web: "arrow_back" },
  refresh: { ios: "arrow.clockwise", android: "refresh", web: "refresh" },
  send: { ios: "arrow.up", android: "arrow_upward", web: "arrow_upward" },
} satisfies Record<string, SymbolViewProps["name"]>;

function ChatFrame({
  children,
  onBack,
  title,
  refreshing,
  refresh,
}: {
  children: ReactNode;
  onBack: () => void;
  title: string;
  refreshing: boolean;
  refresh: () => void;
}) {
  const localizedType = useLocalizedType();
  const { locale, t } = useOnboardingText();
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("back")}
          onPress={onBack}
          style={styles.iconButton}
        >
          <SymbolView
            name={chatIcons.back}
            size={22}
            tintColor={colors.action}
          />
        </Pressable>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[localizedType("card-title", locale), styles.title]}
        >
          {title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={activityCopy[locale].refresh}
          accessibilityState={{ disabled: refreshing, busy: refreshing }}
          disabled={refreshing}
          onPress={refresh}
          style={styles.iconButton}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={colors.action} />
          ) : (
            <SymbolView
              name={chatIcons.refresh}
              size={20}
              tintColor={colors.action}
            />
          )}
        </Pressable>
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {children}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ExchangeChat({
  onBack,
  conversation,
  profileId,
  loanId,
  partnerName,
}: {
  onBack: () => void;
  conversation: Conversation;
  profileId: string;
  loanId?: string;
  partnerName: string;
}) {
  const localizedType = useLocalizedType();
  const { locale } = useOnboardingText();
  const copy = exchangeMessageCopy[locale];
  const activity = activityCopy[locale];
  const [closed, setClosed] = useState(conversation.status !== "open");
  const newestRead = useRef<string | null>(null);
  const messages = usePagedResource(
    useCallback(
      async (before?: string | null) => {
        const [current, page] = await Promise.all([
          api.getConversation(conversation.id),
          api.listMessages(conversation.id, before),
        ]);
        setClosed(current.status !== "open");
        const newestId = page.items[0]?.id;
        if (!before && newestId && newestId !== newestRead.current) {
          await api.markConversationRead(conversation.id);
          newestRead.current = newestId;
        }
        return page;
      },
      [conversation.id],
    ),
    5000,
  );
  const [draft, setDraft] = useState(() =>
    loanId && conversation.status === "open"
      ? (peekLoanMessageDraft(profileId, loanId) ?? "")
      : "",
  );
  useEffect(() => {
    if (loanId) clearLoanMessageDraft(profileId, loanId);
  }, [loanId, profileId]);
  const [inputHeight, setInputHeight] = useState(48);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  const pending = useRef<{ body: string; id: string } | null>(null);
  const sendingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function send() {
    const body = draft.trim();
    if (!body || sendingRef.current || closed) return;
    sendingRef.current = true;
    setSending(true);
    setSendError(false);
    try {
      if (pending.current?.body !== body)
        pending.current = { body, id: randomUUID() };
      await api.sendMessage(conversation.id, body, pending.current.id);
      if (!mounted.current) return;
      pending.current = null;
      setDraft("");
      setInputHeight(48);
      await messages.reload();
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ApiError && error.status === 409) setClosed(true);
      setSendError(true);
    } finally {
      sendingRef.current = false;
      if (mounted.current) setSending(false);
    }
  }

  const canSend = !!draft.trim() && !sending && !messages.error;
  const reportLabel = neighbourCopy[locale].reportMessage;
  function openReport(messageId: string, senderId: string, body: string) {
    router.push({
      pathname: "/report-or-block",
      params: {
        targetType: "message",
        targetId: messageId,
        subjectId: senderId,
        title: body.slice(0, 140),
      },
    });
  }
  return (
    <ChatFrame
      onBack={onBack}
      title={partnerName}
      refreshing={messages.loading}
      refresh={messages.reload}
    >
      {messages.error ? (
        <View style={styles.notice}>
          <ActivityStatus
            loading={messages.loading}
            error={messages.error}
            retry={messages.retry}
          />
        </View>
      ) : null}
      <FlatList
        inverted
        style={styles.flex}
        contentContainerStyle={styles.messageList}
        data={messages.items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          !messages.loading && !messages.error ? (
            <View style={styles.section}>
              <ActivityText strong>{copy.emptyChat}</ActivityText>
              <ActivityText>{copy.emptyChatDetail}</ActivityText>
            </View>
          ) : undefined
        }
        ListFooterComponent={
          messages.cursor ? (
            <Button
              label={copy.earlier}
              variant="text"
              disabled={messages.loading}
              onPress={messages.loadMore}
            />
          ) : undefined
        }
        renderItem={({ item }) => {
          const body = item.deleted
            ? copy.deleted
            : item.body || copy.attachment;
          if (!item.sender_user_id) {
            return (
              <Text
                style={[localizedType("supporting", locale), styles.system]}
              >
                {body}
              </Text>
            );
          }
          const own = item.sender_user_id === profileId;
          const stamp = formatActivityDate(item.created_at, locale);
          const sender = item.sender_user_id;
          const canReport = !own && !item.deleted && !!sender;
          return (
            <Pressable
              accessible
              accessibilityLabel={`${own ? copy.you : partnerName}. ${body} ${stamp}`}
              accessibilityHint={canReport ? reportLabel : undefined}
              accessibilityActions={
                canReport ? [{ name: "report", label: reportLabel }] : undefined
              }
              onAccessibilityAction={
                canReport
                  ? (event) => {
                      if (event.nativeEvent.actionName === "report" && sender)
                        openReport(item.id, sender, body);
                    }
                  : undefined
              }
              onLongPress={
                canReport && sender
                  ? () => openReport(item.id, sender, body)
                  : undefined
              }
              style={[styles.message, own && styles.own]}
            >
              <Text style={[localizedType("body", locale), styles.ink]}>
                {body}
              </Text>
              <Text style={[localizedType("supporting", locale), styles.stamp]}>
                {stamp}
              </Text>
            </Pressable>
          );
        }}
      />
      <View style={styles.composer}>
        {closed ? (
          <ActivityText>{copy.closed}</ActivityText>
        ) : (
          <View style={styles.composeRow}>
            <TextInput
              accessibilityLabel={copy.message}
              style={[
                localizedType("body", locale),
                styles.input,
                { height: inputHeight },
              ]}
              value={draft}
              onChangeText={(value) => {
                setDraft(value);
                setSendError(false);
              }}
              placeholder={copy.writeMessage}
              placeholderTextColor={colors.control}
              onContentSizeChange={(event) => {
                setInputHeight(
                  Math.max(
                    48,
                    Math.min(event.nativeEvent.contentSize.height, 120),
                  ),
                );
              }}
              multiline
              maxLength={4000}
              editable={!sending}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.sendMessage}
              accessibilityState={{ disabled: !canSend, busy: sending }}
              disabled={!canSend}
              onPress={() => void send()}
              style={[
                styles.iconButton,
                styles.send,
                !canSend && !sending && styles.disabled,
              ]}
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors["on-action"]} />
              ) : (
                <SymbolView
                  name={chatIcons.send}
                  size={22}
                  tintColor={colors["on-action"]}
                />
              )}
            </Pressable>
          </View>
        )}
        {sendError ? <ErrorText>{activity.actionError}</ErrorText> : null}
      </View>
    </ChatFrame>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.canvas },
  header: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
  },
  title: { flex: 1, minWidth: 0, color: colors.ink },
  iconButton: {
    width: controls["touch-target"],
    height: controls["touch-target"],
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
  },
  notice: { padding: spacing["card-inset"] },
  section: { gap: spacing["related-gap"] },
  messageList: {
    gap: spacing["related-gap"],
    padding: spacing["card-inset"],
  },
  message: {
    alignSelf: "flex-start",
    maxWidth: "86%",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: colors.paper,
    gap: 4,
  },
  own: { alignSelf: "flex-end", backgroundColor: colors.wash },
  ink: { color: colors.ink },
  stamp: {
    alignSelf: "flex-end",
    color: colors.secondary,
    fontSize: 12,
    lineHeight: 17,
  },
  system: {
    alignSelf: "center",
    maxWidth: "88%",
    color: colors.secondary,
    textAlign: "center",
  },
  composer: {
    gap: spacing["related-gap"],
    paddingHorizontal: spacing["card-inset"],
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
  },
  composeRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 20,
    color: colors.ink,
  },
  send: { backgroundColor: colors.action },
  disabled: { opacity: 0.45 },
});
