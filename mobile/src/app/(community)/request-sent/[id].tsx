import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { RequestNotice } from "@/components/request-notice";
import { Button } from "@/components/ui";
import { useCommunityDemo } from "@/lib/community-demo";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { requestCopy } from "@/lib/request-demo-copy";
import { colors, spacing } from "@/theme/tokens.json";

const currentDot = require("../../../../assets/images/request-ripple-current.svg");
const pendingDot = require("../../../../assets/images/request-ripple-pending.svg");

export default function RequestSentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actor, people, requests } = useCommunityDemo();
  const { locale } = useOnboardingText();
  const copy = requestCopy[locale];
  const request = requests.find(
    (item) => item.id === id && item.createdBy === actor,
  );
  const viewRequests = (
    <Button
      label={copy.viewRequests}
      labelStyle={localizedType("button", locale)}
      onPress={() => router.dismissTo("/requests")}
    />
  );

  if (!request) {
    return <CommunityScreen back title={copy.notFound} footer={viewRequests} />;
  }

  const recipients = {
    direct: [
      [
        people[actor === "member" ? "neighbour" : "member"].name,
        copy.directHint,
      ],
    ],
    circle: [[copy.circle, copy.circleHint]],
    ripple: [
      [copy.family, copy.familyHint],
      [copy.han, copy.hanHint],
      [copy.association, copy.associationHint],
      [copy.nearby, copy.nearbyHint],
    ],
  }[request.audience];

  return (
    <CommunityScreen
      back
      title={copy.sent}
      subtitle={`${request.title} · ${request.timing}`}
      footer={viewRequests}
    >
      <View style={styles.list}>
        {recipients.map(([title, detail], index) => (
          <View key={title} style={styles.recipient}>
            <Image
              source={index === 0 ? currentDot : pendingDot}
              style={styles.dot}
              accessible={false}
            />
            <View style={styles.recipientText}>
              <Text
                style={[localizedType("field-label", locale), styles.title]}
              >
                {title}
              </Text>
              <Text
                style={[localizedType("supporting", locale), styles.detail]}
              >
                {detail}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <RequestNotice
        title={copy.quiet}
        detail={copy.quietDetail}
        locale={locale}
      />
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing["related-gap"] },
  recipient: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["control-gap"],
  },
  recipientText: { flex: 1 },
  dot: { width: 12, height: 12 },
  title: { color: colors.ink },
  detail: { color: colors.secondary },
});
