import { ActivityIndicator, Text, View } from "react-native";

import {
  OnboardingLink,
  OnboardingScreen,
} from "@/components/onboarding-screen";
import { Button, ErrorText } from "@/components/ui";
import { useMemberships } from "@/lib/memberships";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors } from "@/theme/tokens.json";

export default function Home() {
  const { profile, reloadProfile, signOut } = useSession();
  const memberships = useMemberships();
  const { t, locale } = useOnboardingText();
  const title = localizedType("screen-title", locale);
  const body = localizedType("body", locale);

  return (
    <OnboardingScreen
      action={<OnboardingLink label={t("signOut")} onPress={signOut} />}
      footer={null}
    >
      {profile.status === "error" ? (
        <>
          <ErrorText>{profile.message}</ErrorText>
          <Button
            label={t("tryAgain")}
            labelStyle={body}
            onPress={reloadProfile}
          />
        </>
      ) : profile.status !== "ready" ||
        memberships.state.status === "loading" ? (
        <ActivityIndicator color={colors.action} />
      ) : memberships.state.status === "error" ? (
        <>
          <ErrorText>{t("circleLoadFailed")}</ErrorText>
          <Button
            label={t("tryAgain")}
            labelStyle={body}
            busy={memberships.refreshing}
            onPress={memberships.refresh}
          />
        </>
      ) : (
        <>
          <Text accessibilityRole="header" className="text-ink" style={title}>
            {t("accountWelcome", { name: profile.profile.display_name })}
          </Text>
          {memberships.state.items
            .filter((row) => row.status === "approved")
            .map((row) => (
              <View
                key={row.circle_id}
                className="gap-related-gap rounded-control bg-wash p-card-inset"
              >
                <Text
                  className="text-ink"
                  style={localizedType("card-title", locale)}
                >
                  {row.circle?.name ?? t("circleNameFallback")}
                </Text>
                <Text className="text-secondary" style={body}>
                  {t("circleApproved")}
                </Text>
              </View>
            ))}
        </>
      )}
    </OnboardingScreen>
  );
}
