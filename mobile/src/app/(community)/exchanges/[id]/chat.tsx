import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { ExchangeUnavailable, useExchange } from "@/components/exchange-ui";
import { RequestNotice } from "@/components/request-notice";
import { Button, Field } from "@/components/ui";
import { localizedType } from "@/lib/onboarding-i18n";

export default function ExchangeChatScreen() {
  const context = useExchange();
  const { actor, copy, exchange } = context;

  if (!exchange) {
    return <ExchangeUnavailable title={copy.chat} context={context} />;
  }

  return (
    <ExchangeChat
      key={`${exchange.request.id}:${actor}`}
      context={context}
      exchange={exchange}
    />
  );
}

function ExchangeChat({
  context,
  exchange,
}: {
  context: ReturnType<typeof useExchange>;
  exchange: NonNullable<ReturnType<typeof useExchange>["exchange"]>;
}) {
  const { actor, copy, locale, people, sendMessage } = context;
  const { partner, request } = exchange;
  const [message, setMessage] = useState("");
  const completed = request.status === "completed";

  function send() {
    if (message.trim()) {
      sendMessage(request.id, message.trim());
      setMessage("");
    }
  }

  return (
    <CommunityScreen
      title={copy.chatWith(people[partner].name)}
      subtitle={request.title}
      back
      keyboard
    >
      {request.messages.length === 0 ? (
        <RequestNotice
          title={copy.emptyChat}
          detail={copy.emptyChatDetail}
          locale={locale}
        />
      ) : null}
      {request.messages.map((entry) => {
        const ownMessage = entry.by === actor;
        const translation =
          entry.language !== locale ? entry.translation?.[locale] : undefined;

        return (
          <View
            key={entry.id}
            className={`gap-1 rounded-control px-control-gap py-2.5 ${ownMessage ? "bg-wash" : "bg-paper"}`}
          >
            <Text
              className="text-ink"
              style={localizedType("field-label", locale)}
            >
              {ownMessage ? copy.you : people[entry.by].name}
            </Text>
            <Text
              className="text-ink"
              style={localizedType("body", entry.language ?? locale)}
            >
              {entry.text}
            </Text>
            {translation ? (
              <Text
                className="text-secondary"
                style={localizedType("supporting", locale)}
              >
                {copy.translation} · {translation}
              </Text>
            ) : null}
          </View>
        );
      })}
      {request.timing ? (
        <RequestNotice
          title={copy.timing}
          detail={request.timing}
          locale={locale}
        />
      ) : null}
      {completed ? (
        <Text
          className="text-secondary"
          style={localizedType("supporting", locale)}
        >
          {copy.chatClosed}
        </Text>
      ) : (
        <>
          <Field
            label={copy.message}
            labelStyle={localizedType("field-label", locale)}
            style={localizedType("body", locale)}
            placeholder={copy.writeMessage}
            value={message}
            onChangeText={setMessage}
            returnKeyType="send"
            onSubmitEditing={send}
          />
          <View>
            <Button
              label={copy.sendMessage}
              labelStyle={localizedType("field-label", locale)}
              variant="text"
              disabled={!message.trim()}
              onPress={send}
            />
            <Text
              className="text-secondary"
              style={localizedType("supporting", locale)}
            >
              {copy.contactPrivacy}
            </Text>
          </View>
        </>
      )}
      <Button
        label={completed ? copy.completed : copy.confirm}
        labelStyle={localizedType("button", locale)}
        onPress={() =>
          router.navigate({
            pathname: "/exchanges/[id]/complete",
            params: { id: request.id },
          })
        }
      />
    </CommunityScreen>
  );
}
