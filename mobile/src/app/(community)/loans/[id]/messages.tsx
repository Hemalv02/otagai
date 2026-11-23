import { randomUUID } from "expo-crypto";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { CommunityScreen } from "@/components/community-screen";
import { ActivityStatus, ActivityText } from "@/components/activity-ui";
import { Button, ErrorText, Field } from "@/components/ui";
import { api, ApiError, type Conversation } from "@/lib/api";
import { activityCopy, formatActivityDate } from "@/lib/activity-copy";
import { exchangeCopy } from "@/lib/exchange-copy";
import { useLiveResource, usePagedResource } from "@/lib/live-resource";
import { loadLoanConversation } from "@/lib/loan-messages";
import { loanMessageCopy } from "@/lib/loan-message-copy";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, controls, spacing } from "@/theme/tokens.json";

export default function LoanMessagesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { locale } = useOnboardingText();
  const { profile } = useSession();
  const profileId = profile.status === "ready" ? profile.profile.id : "";
  const loan = useLiveResource(
    useCallback(() => loadLoanConversation(id, profileId), [id, profileId]),
  );
  const copy = loanMessageCopy[locale];
  const partnerName = loan.data?.partnerName || copy.neighbour;
  const conversation = loan.data?.conversation;
  return (
    <CommunityScreen
      live
      design
      back
      keyboard
      scroll={false}
      title={exchangeCopy[locale].chatWith(partnerName)}
    >
      <ActivityStatus
        loading={loan.loading}
        error={loan.error}
        retry={loan.reload}
      />
      {conversation ? (
        <LoanChat
          key={`${conversation.id}:${profileId}`}
          conversation={conversation}
          profileId={profileId}
          partnerName={partnerName}
        />
      ) : !loan.loading && !loan.error ? (
        <View style={styles.section}>
          <ActivityText>{copy.unavailable}</ActivityText>
          <Button
            variant="secondary"
            label={activityCopy[locale].retry}
            onPress={loan.reload}
          />
        </View>
      ) : null}
    </CommunityScreen>
  );
}

function LoanChat({
  conversation,
  profileId,
  partnerName,
}: {
  conversation: Conversation;
  profileId: string;
  partnerName: string;
}) {
  const { locale } = useOnboardingText();
  const copy = loanMessageCopy[locale];
  const chat = exchangeCopy[locale];
  const activity = activityCopy[locale];
  const [closed, setClosed] = useState(conversation.status !== "open");
  const messages = usePagedResource(
    useCallback(
      async (before?: string | null) => {
        const current = await api.getConversation(conversation.id);
        setClosed(current.status !== "open");
        const page = await api.listMessages(conversation.id, before);
        await api.markConversationRead(conversation.id);
        return page;
      },
      [conversation.id],
    ),
  );
  const [draft, setDraft] = useState("");
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

  return (
    <View style={styles.flex}>
      <View style={styles.tools}>
        <Button
          label={activity.refresh}
          variant="text"
          disabled={messages.loading || sending}
          onPress={messages.reload}
        />
      </View>
      <ActivityStatus
        loading={messages.loading}
        error={messages.error}
        retry={messages.retry}
      />
      <FlatList
        inverted
        style={styles.flex}
        contentContainerStyle={styles.messageList}
        data={messages.items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          !messages.loading && !messages.error ? (
            <View style={styles.section}>
              <ActivityText strong>{chat.emptyChat}</ActivityText>
              <ActivityText>{chat.emptyChatDetail}</ActivityText>
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
        renderItem={({ item }) => (
          <View
            style={[
              styles.message,
              item.sender_user_id === profileId && styles.own,
            ]}
          >
            <ActivityText strong>
              {item.sender_user_id === profileId
                ? chat.you
                : item.sender_user_id
                  ? partnerName
                  : "Otagai"}
            </ActivityText>
            <ActivityText>
              {item.deleted ? copy.deleted : item.body || copy.attachment}
            </ActivityText>
            <ActivityText>
              {formatActivityDate(item.created_at, locale)}
            </ActivityText>
          </View>
        )}
      />
      <View style={styles.composer}>
        {closed ? (
          <ActivityText>{copy.closed}</ActivityText>
        ) : (
          <>
            <Field
              label={chat.message}
              labelStyle={localizedType("field-label", locale)}
              style={localizedType("body", locale)}
              value={draft}
              onChangeText={(value) => {
                setDraft(value);
                setSendError(false);
              }}
              placeholder={chat.writeMessage}
              multiline
              maxLength={4000}
              editable={!sending}
            />
            <Button
              label={chat.sendMessage}
              labelStyle={localizedType("button", locale)}
              busy={sending}
              disabled={!draft.trim() || messages.error}
              onPress={send}
            />
          </>
        )}
        {sendError ? <ErrorText>{activity.actionError}</ErrorText> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: spacing["related-gap"] },
  tools: { alignItems: "flex-end" },
  messageList: {
    gap: spacing["related-gap"],
    paddingVertical: spacing["related-gap"],
  },
  message: {
    padding: spacing["card-inset"],
    borderRadius: controls.radius,
    backgroundColor: colors.paper,
    gap: spacing["related-gap"],
  },
  own: { backgroundColor: colors.wash },
  composer: {
    gap: spacing["related-gap"],
    paddingTop: spacing["related-gap"],
    borderTopWidth: 1,
    borderColor: colors.rule,
  },
});
