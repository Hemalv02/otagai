import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { ExchangeUnavailable, useExchange } from "@/components/exchange-ui";
import { RequestNotice } from "@/components/request-notice";
import { Button, Field } from "@/components/ui";
import { localizedType } from "@/lib/onboarding-i18n";
import { colors, controls } from "@/theme/tokens.json";

const unselectedMarker = require("../../../../../assets/images/exchange-selection-off.svg");
const selectedMarker = require("../../../../../assets/images/exchange-selection-on.svg");

export default function ThankYouScreen() {
  const context = useExchange();
  const { actor, copy, exchange } = context;

  if (!exchange) {
    return <ExchangeUnavailable title={copy.thanks} context={context} />;
  }

  const { request } = exchange;

  if (actor !== request.createdBy || request.status !== "completed") {
    return (
      <ExchangeUnavailable
        title={copy.thanks}
        reason={
          actor !== request.createdBy ? copy.requesterOnly : copy.finishFirst
        }
        context={context}
      />
    );
  }

  return <ThankYou key={request.id} context={context} exchange={exchange} />;
}

function ThankYou({
  context,
  exchange,
}: {
  context: ReturnType<typeof useExchange>;
  exchange: NonNullable<ReturnType<typeof useExchange>["exchange"]>;
}) {
  const { copy, locale, people, sendThanks, viewRequest } = context;
  const { helper, request } = exchange;
  const name = people[helper].name;
  const [mode, setMode] = useState<"note" | "gift">("note");
  const [alternate, setAlternate] = useState(false);
  const [edit, setEdit] = useState<string>();
  const ideas =
    mode === "gift"
      ? [copy.giftNote, copy.anotherGiftNote]
      : [copy.noteDraft, copy.anotherNote];
  const note = edit ?? ideas[alternate ? 1 : 0];
  const options = [
    { value: "note", title: copy.note, detail: copy.privateNote(name) },
    { value: "gift", title: copy.gift, detail: copy.giftDetail },
    { value: "orei", title: copy.orei, detail: copy.oreiDetail },
  ] as const;

  if (request.thankYou) {
    return (
      <CommunityScreen title={copy.sent} subtitle={request.title} back>
        <RequestNotice
          title={copy.sentDetail(name)}
          detail={request.thankYou}
          locale={locale}
        />
        <Button
          label={copy.viewRequest}
          labelStyle={localizedType("button", locale)}
          onPress={viewRequest}
        />
      </CommunityScreen>
    );
  }

  return (
    <CommunityScreen
      title={copy.thank(name)}
      subtitle={request.title}
      back
      keyboard
    >
      {options.map(({ value, title, detail }) => {
        const selected = mode === value;
        const disabled = value === "orei";

        return (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityLabel={title}
            accessibilityHint={detail}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => {
              if (value !== "orei" && mode !== value) {
                setMode(value);
                setAlternate(false);
              }
            }}
            className={`min-h-touch-target flex-row items-center gap-control-gap rounded-control border px-control-gap py-[7px] ${selected ? "border-action bg-wash" : "border-control bg-canvas"}`}
          >
            <Image
              source={selected ? selectedMarker : unselectedMarker}
              style={styles.marker}
              contentFit="contain"
              accessible={false}
            />
            <View className="flex-1 gap-0.5">
              <Text
                className="text-ink"
                style={localizedType("field-label", locale)}
              >
                {title}
              </Text>
              <Text
                className="text-secondary"
                style={localizedType("supporting", locale)}
              >
                {detail}
              </Text>
            </View>
          </Pressable>
        );
      })}
      <Field
        label={copy.suggestedNote}
        labelStyle={localizedType("field-label", locale)}
        style={[localizedType("body", locale), styles.note]}
        multiline
        value={note}
        onChangeText={setEdit}
      />
      <Button
        label={copy.suggestAnother}
        labelStyle={localizedType("field-label", locale)}
        variant="text"
        onPress={() => {
          setEdit(undefined);
          setAlternate(!alternate);
        }}
      />
      <View className="gap-related-gap">
        <Button
          label={copy.sendThanks}
          labelStyle={localizedType("button", locale)}
          disabled={!note.trim()}
          onPress={() => sendThanks(request.id, note.trim())}
        />
        <Button
          label={copy.maybeLater}
          labelStyle={[localizedType("button", locale), styles.secondaryLabel]}
          style={styles.secondary}
          variant="secondary"
          onPress={viewRequest}
        />
      </View>
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  marker: { width: 22, height: 22 },
  note: { minHeight: 104 },
  secondary: {
    minHeight: controls["touch-target"],
    borderColor: colors.control,
  },
  secondaryLabel: { color: colors.action },
});
