import { Image } from "expo-image";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { ExchangeUnavailable, useExchange } from "@/components/exchange-ui";
import { RequestNotice } from "@/components/request-notice";
import { Button } from "@/components/ui";
import { useDemoListings } from "@/lib/demo-listings";
import { localizedType } from "@/lib/onboarding-i18n";

const tanakaPortrait = require("../../../../../assets/images/lending-tanaka-thumbnail.png");

export default function CompleteExchangeScreen() {
  const context = useExchange();
  const { listings } = useDemoListings();
  const { actor, confirmHelp, copy, exchange, locale, people, viewRequest } =
    context;

  if (!exchange) {
    return <ExchangeUnavailable title={copy.complete} context={context} />;
  }

  const { request, helper, partner } = exchange;
  const isLoan = listings.some(
    (item) => item.id === request.listingId && item.kind === "tool",
  );
  const confirmed = request.confirmedBy.includes(actor);
  const partnerConfirmed = request.confirmedBy.includes(partner);
  const completed = request.status === "completed";
  const partnerName = people[partner].name;
  const canThank =
    completed && actor === request.createdBy && !request.thankYou;
  const participants = [
    { id: request.createdBy, role: isLoan ? copy.borrower : copy.requester },
    { id: helper, role: isLoan ? copy.lender : copy.helper },
  ];

  return (
    <CommunityScreen
      title={isLoan ? copy.returnTitle : copy.complete}
      subtitle={[request.title, request.timing].filter(Boolean).join(" · ")}
      back
    >
      {participants.map(({ id, role }) => {
        const name = people[id].name;

        return (
          <View key={id} className="flex-row items-center gap-control-gap">
            {id === "neighbour" ? (
              <Image
                source={tanakaPortrait}
                style={styles.portrait}
                contentFit="cover"
                accessible={false}
              />
            ) : (
              <View
                className="items-center justify-center bg-wash"
                style={styles.portrait}
              >
                <Text
                  className="text-action"
                  style={localizedType("card-title", locale)}
                  accessible={false}
                >
                  {Array.from(name)[0]?.toLocaleUpperCase(locale)}
                </Text>
              </View>
            )}
            <View className="flex-1">
              <Text
                className="text-ink"
                style={localizedType("field-label", locale)}
              >
                {name}
              </Text>
              <Text
                className="text-secondary"
                style={localizedType("supporting", locale)}
              >
                {role}
              </Text>
            </View>
          </View>
        );
      })}
      <View
        className="flex-row items-start gap-control-gap"
        accessibilityLiveRegion="polite"
      >
        <View className="flex-1 rounded-control bg-wash px-2.5 py-related-gap">
          <Text
            className="text-ink"
            style={localizedType("field-label", locale)}
          >
            {partnerConfirmed
              ? copy.confirmed(partnerName)
              : copy.awaiting(partnerName)}
          </Text>
        </View>
        <View className="flex-1 rounded-control bg-wash px-2.5 py-related-gap">
          <Text
            className="text-ink"
            style={localizedType("field-label", locale)}
          >
            {confirmed ? copy.yourConfirmation : copy.yourTurn}
          </Text>
        </View>
      </View>
      {completed ? (
        <RequestNotice
          title={isLoan ? copy.itemReturned : copy.completed}
          detail={isLoan ? copy.itemReturnedDetail : copy.completedDetail}
          locale={locale}
        />
      ) : confirmed ? (
        <RequestNotice
          title={copy.waiting}
          detail={copy.waitingDetail(partnerName)}
          locale={locale}
        />
      ) : (
        <RequestNotice
          title={copy.ready}
          detail={isLoan ? copy.bothConfirmReturn : copy.bothConfirm}
          locale={locale}
        />
      )}
      {!confirmed && !completed ? (
        <>
          <Button
            label={copy.moreTime}
            labelStyle={localizedType("field-label", locale)}
            variant="text"
            onPress={() =>
              router.navigate({
                pathname: "/exchanges/[id]/chat",
                params: { id: request.id },
              })
            }
          />
          <Button
            label={isLoan ? copy.confirmReturn : copy.confirm}
            labelStyle={localizedType("button", locale)}
            onPress={() => confirmHelp(request.id)}
          />
        </>
      ) : (
        <Button
          label={canThank ? copy.thanks : copy.viewRequest}
          labelStyle={localizedType("button", locale)}
          onPress={
            canThank
              ? () =>
                  router.navigate({
                    pathname: "/exchanges/[id]/thank-you",
                    params: { id: request.id },
                  })
              : viewRequest
          }
        />
      )}
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  portrait: { width: 56, height: 56, borderRadius: 28 },
});
