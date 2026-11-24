import { router } from "expo-router";
import { ActivityIndicator } from "react-native";

import {
  OnboardingLink,
  OnboardingScreen,
} from "@/components/onboarding-screen";
import { Button, ErrorText } from "@/components/ui";
import { useMemberships } from "@/lib/memberships";
import { useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { settingsCopy } from "@/lib/settings-copy";
import { colors } from "@/theme/tokens.json";

export default function AccountStatusScreen() {
  const { profile, reloadProfile, signOut } = useSession();
  const { state, refresh, refreshing } = useMemberships();
  const { t, locale } = useOnboardingText();

  return (
    <OnboardingScreen
      action={<OnboardingLink label={t("signOut")} onPress={signOut} />}
    >
      {profile.status === "error" ? (
        <>
          <ErrorText>{profile.message}</ErrorText>
          <Button label={t("tryAgain")} onPress={reloadProfile} />
        </>
      ) : state.status === "error" ? (
        <>
          <ErrorText>{t("circleLoadFailed")}</ErrorText>
          <Button label={t("tryAgain")} busy={refreshing} onPress={refresh} />
        </>
      ) : (
        <ActivityIndicator color={colors.action} />
      )}
      {profile.status === "ready" ? (
        <OnboardingLink
          label={settingsCopy[locale].title}
          onPress={() => router.push("/settings")}
        />
      ) : null}
    </OnboardingScreen>
  );
}
