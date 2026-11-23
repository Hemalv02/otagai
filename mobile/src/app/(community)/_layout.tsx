import { router, Stack, useRootNavigationState } from "expo-router";
import { useEffect } from "react";

import { listenForRequestNotification } from "@/lib/device-push";

import { colors } from "@/theme/tokens.json";

export const unstable_settings = { initialRouteName: "(tabs)" };

export default function CommunityLayout() {
  const navigationKey = useRootNavigationState()?.key;
  useEffect(() => {
    if (!navigationKey) return;
    let active = true;
    let remove: (() => void) | undefined;
    void listenForRequestNotification((id) => {
      if (active) router.push({ pathname: "/requests/[id]", params: { id } });
    })
      .then((subscription) => {
        if (active) remove = subscription;
        else subscription?.();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      remove?.();
    };
  }, [navigationKey]);
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
