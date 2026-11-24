import { router } from "expo-router";
import { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ActivityStatus, ActivityText } from "@/components/activity-ui";
import { CommunityScreen } from "@/components/community-screen";
import { Button } from "@/components/ui";
import { useLiveResource } from "@/lib/live-resource";
import { neighbourApi } from "@/lib/neighbour-api";
import { neighbourCopy, shortExchangeDate } from "@/lib/neighbour-copy";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, spacing } from "@/theme/tokens.json";

export default function NeighboursScreen() {
  const { session } = useSession();
  return (
    <Neighbours key={session?.user.id} authUserId={session?.user.id ?? ""} />
  );
}

function Neighbours({ authUserId }: { authUserId: string }) {
  const { locale } = useOnboardingText();
  const copy = neighbourCopy[locale];
  const data = useLiveResource(
    useCallback(() => neighbourApi(authUserId).neighbours(), [authUserId]),
  );

  return (
    <CommunityScreen
      showDemoPreview={false}
      design
      back
      title={copy.neighbours}
      subtitle={copy.neighboursDetail}
    >
      <ActivityStatus
        loading={data.loading}
        error={data.error}
        retry={data.reload}
      />
      {data.data?.items.length === 0 ? (
        <ActivityText>{copy.noNeighbours}</ActivityText>
      ) : null}
      {data.data?.items.map(({ other, last_exchange_at }) => {
        const date = shortExchangeDate(last_exchange_at, locale);
        return (
          <Pressable
            key={other.id}
            accessibilityRole="button"
            accessibilityLabel={copy.viewProfileFor(other.display_name)}
            accessibilityHint={
              date ? `${copy.lastExchange} · ${date}` : undefined
            }
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() =>
              router.push({
                pathname: "/neighbours/[id]",
                params: { id: other.id },
              })
            }
          >
            <View style={styles.avatar} accessible={false} aria-hidden>
              <Text
                style={[localizedType("field-label", locale), styles.green]}
              >
                {Array.from(other.display_name.trim())[0]?.toLocaleUpperCase(
                  locale,
                )}
              </Text>
            </View>
            <View style={styles.detail}>
              <ActivityText strong>{other.display_name}</ActivityText>
              {date ? (
                <ActivityText>
                  {copy.lastExchange} · {date}
                </ActivityText>
              ) : null}
            </View>
            <Text style={[localizedType("supporting", locale), styles.green]}>
              {copy.viewProfile}
            </Text>
          </Pressable>
        );
      })}
      <Button
        variant="text"
        label={copy.browse}
        labelStyle={localizedType("field-label", locale)}
        onPress={() => router.navigate("/tools")}
      />
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["control-gap"],
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.wash,
    alignItems: "center",
    justifyContent: "center",
  },
  detail: { flex: 1, paddingTop: 4, paddingBottom: 5 },
  green: { color: colors.action },
  pressed: { backgroundColor: colors.paper },
});
