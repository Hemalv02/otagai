import { ActivityIndicator, ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, ErrorText } from "@/components/ui";
import { useSession } from "@/lib/session";
import { colors } from "@/theme/tokens.json";

export default function Home() {
  const { profile, reloadProfile, signOut } = useSession();

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <ScrollView contentContainerClassName="gap-card-inset px-screen-gutter py-card-inset">
        <Text className="type-wordmark text-action">Otagai</Text>
        {profile.status === "loading" ? (
          <ActivityIndicator color={colors.action} />
        ) : null}
        {profile.status === "error" ? (
          <>
            <ErrorText>{profile.message}</ErrorText>
            <Button label="Try again" onPress={reloadProfile} />
          </>
        ) : null}
        {profile.status === "ready" ? (
          <>
            <Text className="type-screen-title text-ink">
              Welcome, {profile.profile.display_name}
            </Text>
            <Text className="type-body text-secondary">
              You are signed in. Asking and lending come next.
            </Text>
          </>
        ) : null}
        <Button label="Sign out" variant="secondary" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}
