import { Stack } from "expo-router";

import { colors } from "@/theme/tokens.json";

export const unstable_settings = { initialRouteName: "(tabs)" };

export default function CommunityLayout() {
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
