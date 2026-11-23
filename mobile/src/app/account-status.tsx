import { ActivityIndicator } from "react-native";

import {
  OnboardingLink,
  OnboardingScreen,
} from "@/components/onboarding-screen";
import { Button, ErrorText } from "@/components/ui";
import { useMemberships } from "@/lib/memberships";
import { useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors } from "@/theme/tokens.json";

export default function AccountStatusScreen() {
  const { profile, reloadProfile, signOut } = useSession();
  const { state, refresh, refreshing } = useMemberships();
  const { t } = useOnboardingText();

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
    </OnboardingScreen>
  );
}
