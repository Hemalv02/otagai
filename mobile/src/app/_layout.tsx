import "../../global.css";

import { useFonts } from "expo-font";
import { SplashScreen, Stack } from "expo-router";
import { DefaultTheme, ThemeProvider } from "expo-router/react-navigation";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { CommunityDemoProvider } from "@/lib/community-demo";
import { DemoListingsProvider } from "@/lib/demo-listings";
import { MembershipProvider, useMemberships } from "@/lib/memberships";
import { OnboardingProvider, useOnboarding } from "@/lib/onboarding";
import { getLaunchRoute } from "@/lib/onboarding-state";
import { SessionProvider, useSession } from "@/lib/session";
import { fontAssets } from "@/theme/fonts";
import { colors } from "@/theme/tokens.json";

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    primary: colors.action,
    background: colors.canvas,
    card: colors.canvas,
    text: colors.ink,
    border: colors.rule,
    notification: colors.action,
  },
};

SplashScreen.preventAutoHideAsync().catch((error: unknown) => {
  console.warn("Could not hold the splash screen.", error);
});

function RootNavigator() {
  const { session, isLoading, profile } = useSession();
  const { ready, state } = useOnboarding();
  const memberships = useMemberships();
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const accountLoading =
    session !== null &&
    (profile.status === "loading" ||
      (profile.status === "ready" && memberships.state.status === "loading"));

  useEffect(() => {
    if (fontError) {
      console.warn("Could not load Otagai fonts.", fontError);
    }
    if ((fontsLoaded || fontError) && !isLoading && ready && !accountLoading) {
      SplashScreen.hide();
    }
  }, [fontsLoaded, fontError, isLoading, ready, accountLoading]);

  if ((!fontsLoaded && !fontError) || isLoading || !ready || accountLoading) {
    return null;
  }

  const launchRoute = getLaunchRoute({
    signedIn: session !== null,
    needsProfile: profile.status === "missing",
    needsCircle:
      profile.status === "ready" &&
      memberships.state.status === "ready" &&
      memberships.access !== "approved",
    completed: state.completed,
  });

  const canUseCommunity =
    profile.status === "ready" && memberships.access === "approved";

  return (
    <CommunityDemoProvider
      key={session?.user.id ?? "guest"}
      memberName={
        profile.status === "ready" ? profile.profile.display_name : ""
      }
    >
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
        }}
      >
        <Stack.Protected guard={launchRoute === "welcome"}>
          <Stack.Screen name="welcome" />
          <Stack.Protected guard={state.step >= 2}>
            <Stack.Screen name="onboarding-story" />
          </Stack.Protected>
          <Stack.Protected guard={state.step === 3}>
            <Stack.Screen name="onboarding-features" />
          </Stack.Protected>
        </Stack.Protected>
        <Stack.Protected guard={launchRoute === "sign-in"}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="onboarding-preferences" />
        </Stack.Protected>
        <Stack.Protected guard={launchRoute === "profile-setup"}>
          <Stack.Screen name="profile-setup" />
        </Stack.Protected>
        <Stack.Protected guard={launchRoute === "find-circle"}>
          <Stack.Screen name="find-circle" />
        </Stack.Protected>
        <Stack.Protected guard={launchRoute === "index" && !canUseCommunity}>
          <Stack.Screen name="account-status" />
        </Stack.Protected>
        <Stack.Protected guard={canUseCommunity}>
          <Stack.Screen name="(community)" />
        </Stack.Protected>
      </Stack>
    </CommunityDemoProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style="dark" />
      <SessionProvider>
        <OnboardingProvider>
          <MembershipProvider>
            <DemoListingsProvider>
              <RootNavigator />
            </DemoListingsProvider>
          </MembershipProvider>
        </OnboardingProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
