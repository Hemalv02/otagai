import { Image } from "expo-image";
import { router } from "expo-router";
import {
  type ComponentRef,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
  type Ref,
  useState,
} from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  type RefreshControlProps,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Choice, ErrorText } from "@/components/ui";
import type { Language } from "@/lib/api";
import { activityCopy } from "@/lib/activity-copy";
import { useCommunityDemo } from "@/lib/community-demo";
import { useOnboarding } from "@/lib/onboarding";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, controls, spacing } from "@/theme/tokens.json";

type CommunityScreenProps = PropsWithChildren<{
  title?: string;
  titleAction?: ReactNode;
  inlineTitleAction?: boolean;
  eyebrow?: string;
  subtitle?: string;
  back?: boolean;
  backAction?: ReactNode;
  keyboard?: boolean;
  footer?: ReactNode;
  scrollRef?: Ref<ComponentRef<typeof ScrollView>>;
  onContentSizeChange?: (width: number, height: number) => void;
  showDemoPreview?: boolean;
  fixedTitle?: boolean;
  compactTitle?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
  scroll?: boolean;
  design?: boolean;
  renderList?: (header: ReactNode) => ReactNode;
}>;

const text = {
  en: {
    settings: "Settings",
    language: "App language",
    done: "Done",
    preview: "Previewing as",
  },
  ja: {
    settings: "設定",
    language: "表示言語",
    done: "閉じる",
    preview: "プレビュー中",
  },
  bn: {
    settings: "সেটিংস",
    language: "অ্যাপের ভাষা",
    done: "বন্ধ করুন",
    preview: "প্রিভিউ",
  },
};

const languages: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "bn", label: "বাংলা" },
];
const shortLanguage = { en: "EN", ja: "日本語", bn: "বাংলা" };
export function CommunityScreen({
  children,
  title,
  titleAction,
  inlineTitleAction = false,
  eyebrow,
  subtitle,
  back,
  backAction,
  keyboard,
  footer,
  scrollRef,
  onContentSizeChange,
  showDemoPreview = true,
  fixedTitle = false,
  compactTitle = false,
  refreshControl,
  scroll = true,
  design = false,
  renderList,
}: CommunityScreenProps) {
  const { t, locale } = useOnboardingText();
  const { state, saving, savePreferences } = useOnboarding();
  const { actor, people } = useCommunityDemo();
  const [options, setOptions] = useState<"settings" | "language" | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const copy = text[locale];
  const label = localizedType("field-label", locale);
  const body = localizedType("body", locale);

  function openOptions(kind: "settings" | "language") {
    setSaveFailed(false);
    setOptions(kind);
  }

  async function chooseLanguage(language: Language) {
    setSaveFailed(false);
    try {
      await savePreferences({ language, region: state.region });
    } catch {
      setSaveFailed(true);
    }
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  const backButton = back ? (
    <Pressable accessibilityRole="button" onPress={goBack} style={styles.back}>
      <Image
        source={require("../../assets/images/lending-arrow-left.svg")}
        style={styles.arrow}
        accessible={false}
      />
      <Text style={[label, styles.green]}>{t("back")}</Text>
    </Pressable>
  ) : null;

  const heading =
    title || eyebrow || subtitle ? (
      <View
        style={[
          styles.heading,
          fixedTitle && styles.fixedHeading,
          design && styles.designHeading,
        ]}
      >
        {eyebrow ? <Text style={[label, styles.green]}>{eyebrow}</Text> : null}
        {title || titleAction ? (
          <View
            style={[
              styles.titleRow,
              inlineTitleAction && styles.inlineTitleRow,
            ]}
          >
            {title ? (
              <Text
                accessibilityRole="header"
                style={[
                  localizedType(
                    compactTitle ? "field-label" : "screen-title",
                    locale,
                  ),
                  styles.ink,
                  styles.title,
                ]}
              >
                {title}
              </Text>
            ) : null}
            {titleAction}
          </View>
        ) : null}
        {subtitle ? (
          <Text style={[body, styles.secondary]}>{subtitle}</Text>
        ) : null}
      </View>
    ) : null;

  const screenContent = (
    <>
      {back && backAction ? (
        <View style={styles.titleRow}>
          {backButton}
          {backAction}
        </View>
      ) : (
        backButton
      )}
      {!fixedTitle && heading}
      {children}
    </>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.rule}>
        <View
          style={[styles.column, styles.header, design && styles.designHeader]}
        >
          <Text className="type-wordmark text-action">Otagai</Text>
          <View
            style={[styles.headerActions, design && styles.designHeaderActions]}
          >
            <Pressable
              accessibilityRole="button"
              onPress={() => openOptions("settings")}
              style={styles.headerButton}
            >
              <Text style={[label, styles.green]}>{copy.settings}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.language}
              onPress={() => openOptions("language")}
              style={styles.headerButton}
            >
              <Text style={[label, styles.green]}>{shortLanguage[locale]}</Text>
            </Pressable>
          </View>
        </View>
      </View>
      {showDemoPreview && actor === "neighbour" ? (
        <View style={styles.preview}>
          <Text style={[label, styles.green]}>
            {copy.preview} {people.neighbour.name}
          </Text>
        </View>
      ) : null}
      {fixedTitle ? heading : null}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={keyboard && Platform.OS === "ios" ? "padding" : undefined}
      >
        {renderList ? (
          renderList(screenContent)
        ) : scroll ? (
          <ScrollView
            ref={scrollRef}
            onContentSizeChange={onContentSizeChange}
            contentContainerStyle={[
              styles.column,
              styles.content,
              design && styles.designContent,
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            refreshControl={refreshControl}
          >
            {screenContent}
          </ScrollView>
        ) : (
          <View style={[styles.column, styles.content, styles.flex]}>
            {screenContent}
          </View>
        )}
        {footer ? (
          <View style={[styles.column, styles.footer]}>{footer}</View>
        ) : null}
      </KeyboardAvoidingView>
      <Modal
        visible={options !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setOptions(null)}
      >
        <SafeAreaView style={styles.scrim}>
          <View accessibilityViewIsModal style={styles.sheet}>
            <Text
              accessibilityRole="header"
              style={[localizedType("section-heading", locale), styles.ink]}
            >
              {options === "settings" ? copy.settings : copy.language}
            </Text>
            {options === "settings" ? (
              <>
                <Button
                  label={activityCopy[locale].notifications}
                  labelStyle={label}
                  variant="text"
                  onPress={() => {
                    setOptions(null);
                    router.push("/notifications");
                  }}
                />
                <Button
                  label={activityCopy[locale].preferences}
                  labelStyle={label}
                  variant="text"
                  onPress={() => {
                    setOptions(null);
                    router.push("/notification-preferences");
                  }}
                />
                <Text style={[label, styles.secondary]}>{copy.language}</Text>
              </>
            ) : null}
            <Choice
              options={languages}
              value={locale}
              onChange={chooseLanguage}
              disabled={saving}
            />
            {saveFailed ? <ErrorText>{t("saveError")}</ErrorText> : null}
            <Button
              label={copy.done}
              labelStyle={label}
              disabled={saving}
              onPress={() => setOptions(null)}
            />
            {options === "settings" ? (
              <CommunitySignOut onClose={() => setOptions(null)} />
            ) : null}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function CommunitySignOut({ onClose }: { onClose: () => void }) {
  const { signOut } = useSession();
  const { t, locale } = useOnboardingText();
  return (
    <Button
      label={t("signOut")}
      labelStyle={localizedType("field-label", locale)}
      variant="text"
      onPress={() => {
        onClose();
        void signOut();
      }}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  column: { width: "100%", maxWidth: 540, alignSelf: "center" },
  rule: { borderBottomWidth: 1, borderColor: colors.rule },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing["screen-gutter"],
    minHeight: 56,
    gap: spacing["related-gap"],
  },
  headerActions: {
    flexDirection: "row",
    flexShrink: 1,
    alignItems: "center",
    gap: spacing["control-gap"],
  },
  designHeader: { minHeight: 58, paddingVertical: 5 },
  designHeaderActions: { gap: spacing["card-inset"] },
  designContent: { paddingVertical: spacing["card-inset"] },
  designHeading: { gap: 6 },
  headerButton: {
    minHeight: controls["touch-target"],
    minWidth: 32,
    justifyContent: "center",
  },
  preview: {
    paddingHorizontal: spacing["screen-gutter"],
    paddingVertical: 6,
    backgroundColor: colors.wash,
  },
  content: { padding: spacing["screen-gutter"], gap: spacing["card-inset"] },
  heading: { gap: spacing["related-gap"] },
  fixedHeading: {
    width: "100%",
    maxWidth: 540,
    alignSelf: "center",
    paddingHorizontal: spacing["screen-gutter"],
    paddingTop: 10,
    paddingBottom: 4,
  },
  titleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing["related-gap"],
  },
  title: { flexShrink: 1 },
  inlineTitleRow: { flexWrap: "nowrap" },
  back: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 6,
    minHeight: controls["touch-target"],
  },
  arrow: { width: 20, height: 20 },
  footer: {
    paddingHorizontal: spacing["screen-gutter"],
    paddingVertical: spacing["related-gap"],
    gap: spacing["related-gap"],
  },
  green: { color: colors.action },
  secondary: { color: colors.secondary },
  ink: { color: colors.ink },
  scrim: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(48,54,48,0.28)",
  },
  sheet: {
    alignSelf: "center",
    maxWidth: 500,
    width: "100%",
    backgroundColor: colors.canvas,
    padding: spacing["screen-gutter"],
    gap: spacing["card-inset"],
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
});
