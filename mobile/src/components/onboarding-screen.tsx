import { Image } from "expo-image";
import { router } from "expo-router";
import {
  type PropsWithChildren,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, ErrorText } from "@/components/ui";
import type { Language } from "@/lib/api";
import { useOnboarding } from "@/lib/onboarding";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { colors, controls, spacing } from "@/theme/tokens.json";

type ScreenProps = PropsWithChildren<{
  action: ReactNode;
  footer?: ReactNode;
  paper?: boolean;
  keyboard?: boolean;
}>;

export function OnboardingScreen({
  action,
  children,
  footer,
  paper,
  keyboard = false,
}: ScreenProps) {
  return (
    <SafeAreaView
      style={[styles.safeArea, paper ? styles.paper : styles.canvas]}
    >
      <KeyboardAvoidingView
        style={styles.safeArea}
        behavior={keyboard && Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.viewport}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.column}>
            <View style={styles.content}>
              <View style={styles.header}>
                <View style={styles.brand}>
                  <Image
                    source={require("../../assets/images/otagai-mark.png")}
                    style={styles.mark}
                    accessible={false}
                  />
                  <Text className="type-wordmark text-action">Otagai</Text>
                </View>
                {action}
              </View>
              {children}
            </View>
            {footer ? <View style={styles.actions}>{footer}</View> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function OnboardingBack({
  language,
  onPress = () => router.dismissTo("/welcome"),
}: {
  language?: Language;
  onPress?: () => void;
}) {
  const localizedType = useLocalizedType();
  const { t, locale } = useOnboardingText(language);
  return (
    <Button
      label={t("back")}
      labelStyle={[localizedType("button", locale), styles.secondaryLabel]}
      variant="secondary"
      style={styles.secondary}
      onPress={onPress}
    />
  );
}

export function OnboardingNext({ from }: { from: 1 | 2 }) {
  const localizedType = useLocalizedType();
  const { advance, state, saving } = useOnboarding();
  const { t, locale } = useOnboardingText();
  const [failed, setFailed] = useState(false);
  const pendingNavigation = useRef(false);
  const nextStep = from === 1 ? 2 : 3;
  const route = from === 1 ? "/onboarding-story" : "/onboarding-features";

  useEffect(() => {
    if (pendingNavigation.current && state.step >= nextStep) {
      pendingNavigation.current = false;
      router.push(route);
    }
  }, [nextStep, route, state.step]);

  async function next() {
    if (state.step >= nextStep) {
      router.push(route);
      return;
    }
    setFailed(false);
    pendingNavigation.current = true;
    try {
      await advance(from);
    } catch {
      pendingNavigation.current = false;
      setFailed(true);
    }
  }

  return (
    <>
      {failed ? <ErrorText>{t("saveError")}</ErrorText> : null}
      <Button
        label={t("next")}
        labelStyle={localizedType("button", locale)}
        busy={saving}
        onPress={next}
      />
    </>
  );
}

export function OnboardingFinish() {
  const localizedType = useLocalizedType();
  const { complete, saving } = useOnboarding();
  const { t, locale } = useOnboardingText();
  const [failed, setFailed] = useState(false);

  async function continueToSignIn() {
    setFailed(false);
    try {
      await complete();
    } catch {
      setFailed(true);
    }
  }

  return (
    <>
      {failed ? <ErrorText>{t("saveError")}</ErrorText> : null}
      <Button
        label={t("getStarted")}
        labelStyle={localizedType("button", locale)}
        busy={saving}
        onPress={continueToSignIn}
      />
    </>
  );
}

export function OnboardingLink({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const localizedType = useLocalizedType();
  const { locale } = useOnboardingText();
  return (
    <Button
      label={label}
      disabled={disabled}
      labelStyle={[localizedType("button", locale), styles.secondaryLabel]}
      variant="secondary"
      style={styles.secondary}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  canvas: { backgroundColor: colors.canvas },
  paper: { backgroundColor: colors.paper },
  viewport: { flexGrow: 1 },
  column: {
    alignSelf: "center",
    flex: 1,
    justifyContent: "space-between",
    maxWidth: 480,
    width: "100%",
    paddingHorizontal: spacing["screen-gutter"],
    paddingVertical: spacing["card-inset"],
    gap: spacing["screen-gutter"],
  },
  content: { gap: spacing["card-inset"] },
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing["related-gap"],
    paddingBottom: spacing["related-gap"],
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["related-gap"],
  },
  mark: { width: 36, height: 36 },
  actions: { gap: spacing["related-gap"] },
  secondary: {
    backgroundColor: "transparent",
    borderColor: colors.control,
    minHeight: controls["touch-target"],
  },
  secondaryLabel: { color: colors.action, textAlign: "center" },
});
