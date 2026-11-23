import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { Button } from "@/components/ui";
import { useCommunityDemo } from "@/lib/community-demo";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { requestCopy } from "@/lib/request-demo-copy";
import { colors, controls, spacing } from "@/theme/tokens.json";

export default function RequestsScreen() {
  const { actor, requests } = useCommunityDemo();
  const { locale } = useOnboardingText();
  const copy = requestCopy[locale];
  const sections = [
    {
      title: copy.myRequests,
      empty: copy.emptyMine,
      requests: requests.filter((item) => item.createdBy === actor),
    },
    {
      title: copy.circleRequests,
      empty: copy.emptyCircle,
      requests: requests.filter((item) => item.createdBy !== actor),
    },
  ];
  const supporting = localizedType("supporting", locale);

  return (
    <CommunityScreen title={copy.requests}>
      <Button
        label={copy.newRequest}
        labelStyle={localizedType("button", locale)}
        onPress={() => router.push("/ask")}
      />
      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text
            accessibilityRole="header"
            style={[localizedType("section-heading", locale), styles.title]}
          >
            {section.title}
          </Text>
          {section.requests.length === 0 ? (
            <Text style={[supporting, styles.detail]}>{section.empty}</Text>
          ) : (
            section.requests.map((request) => {
              const status =
                request.status === "open" && request.offer
                  ? request.createdBy === actor
                    ? copy.offerReceived
                    : copy.offerSent
                  : copy.requestStatus[request.status];
              return (
                <Pressable
                  accessibilityRole="button"
                  key={request.id}
                  style={styles.card}
                  onPress={() =>
                    router.push({
                      pathname: "/requests/[id]",
                      params: { id: request.id },
                    })
                  }
                >
                  <Text
                    style={[localizedType("card-title", locale), styles.title]}
                  >
                    {request.title}
                  </Text>
                  <Text style={[supporting, styles.detail]}>
                    {request.timing}
                  </Text>
                  <Text
                    style={[
                      localizedType("field-label", locale),
                      styles.status,
                    ]}
                  >
                    {status}
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>
      ))}
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing["related-gap"] },
  card: {
    borderColor: colors.rule,
    borderRadius: controls.radius,
    borderWidth: 1,
    gap: 4,
    padding: spacing["card-inset"],
  },
  title: { color: colors.ink },
  detail: { color: colors.secondary },
  status: { color: colors.action },
});
