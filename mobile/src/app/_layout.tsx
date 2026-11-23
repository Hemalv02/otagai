import "../../global.css";

import { useFonts } from "expo-font";
import { SplashScreen, Stack } from "expo-router";
import { DefaultTheme, ThemeProvider } from "expo-router/react-navigation";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

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
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  useEffect(() => {
    if (fontError) {
      console.warn("Could not load Otagai fonts.", fontError);
    }
    if ((fontsLoaded || fontError) && !isLoading) {
      SplashScreen.hide();
    }
  }, [fontsLoaded, fontError, isLoading]);

  if ((!fontsLoaded && !fontError) || isLoading) {
    return null;
  }

  const signedIn = session !== null;
  const needsProfile = signedIn && profile.status === "missing";

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={needsProfile}>
        <Stack.Screen name="profile-setup" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !needsProfile}>
        <Stack.Screen name="index" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style="dark" />
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
    </ThemeProvider>
  );
}
