import { NativeTabs } from "expo-router/native-tabs";

import { assistantCopy } from "@/lib/assistant-copy";
import { useOnboardingText } from "@/lib/onboarding-i18n";
import { colors } from "@/theme/tokens.json";

const labels = {
  en: { home: "Home", browse: "Browse", requests: "Requests" },
  ja: { home: "ホーム", browse: "探す", requests: "依頼" },
  bn: { home: "হোম", browse: "খুঁজুন", requests: "অনুরোধ" },
};

export default function CommunityTabs() {
  const { locale } = useOnboardingText();
  const copy = labels[locale];

  return (
    <NativeTabs
      tintColor={colors.action}
      backgroundColor={colors.canvas}
      iconColor={{ default: colors.secondary, selected: colors.action }}
      labelStyle={{
        default: { color: colors.secondary },
        selected: { color: colors.action },
      }}
      indicatorColor={colors.wash}
      minimizeBehavior="never"
    >
      <NativeTabs.Trigger name="index" accessibilityLabel={copy.home}>
        <NativeTabs.Trigger.Icon
          sf={{ default: "house", selected: "house.fill" }}
          md="home"
        />
        <NativeTabs.Trigger.Label>{copy.home}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tools" accessibilityLabel={copy.browse}>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
        <NativeTabs.Trigger.Label>{copy.browse}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="requests" accessibilityLabel={copy.requests}>
        <NativeTabs.Trigger.Icon
          sf={{
            default: "list.bullet.rectangle",
            selected: "list.bullet.rectangle.fill",
          }}
          md="assignment"
        />
        <NativeTabs.Trigger.Label>{copy.requests}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="assistant"
        accessibilityLabel={assistantCopy[locale].tab}
      >
        <NativeTabs.Trigger.Icon
          sf={{ default: "bubble.left", selected: "bubble.left.fill" }}
          md="chat"
        />
        <NativeTabs.Trigger.Label>
          {assistantCopy[locale].tab}
        </NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
