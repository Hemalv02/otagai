import "../../global.css";

import { useFonts } from "expo-font";
import { SplashScreen, Stack } from "expo-router";
import { DefaultTheme, ThemeProvider } from "expo-router/react-navigation";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
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

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  useEffect(() => {
    if (fontError) {
      console.warn("Could not load Otagai fonts.", fontError);
    }
    if (fontsLoaded || fontError) {
      SplashScreen.hide();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
        }}
      />
    </ThemeProvider>
  );
}
