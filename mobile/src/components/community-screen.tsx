import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
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

import { Choice, ErrorText } from "@/components/ui";
import type { Language } from "@/lib/api";
import { activityCopy } from "@/lib/activity-copy";
import { circleCopy } from "@/lib/circle-copy";
import { neighbourCopy } from "@/lib/neighbour-copy";
import { useMemberships } from "@/lib/memberships";
import { useOnboarding } from "@/lib/onboarding";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
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
  backHref?: Href;
  settingsMenu?: boolean;
  keyboard?: boolean;
  footer?: ReactNode;
  scrollRef?: Ref<ComponentRef<typeof ScrollView>>;
  onContentSizeChange?: (width: number, height: number) => void;
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
    profile: "Profile and account",
    language: "App language",
    done: "Done",
  },
  ja: {
    settings: "設定",
    profile: "プロフィールとアカウント",
    language: "表示言語",
    done: "閉じる",
  },
  bn: {
    settings: "সেটিংস",
    profile: "প্রোফাইল ও অ্যাকাউন্ট",
    language: "অ্যাপের ভাষা",
    done: "বন্ধ করুন",
  },
};

const languages: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "bn", label: "বাংলা" },
];
const shortLanguage = { en: "EN", ja: "日本語", bn: "বাংলা" };
const settingsIcons = {
  profile: {
    ios: "person.crop.circle",
    android: "account_circle",
    web: "account_circle",
  },
  notifications: {
    ios: "bell",
    android: "notifications",
    web: "notifications",
  },
  preferences: { ios: "slider.horizontal.3", android: "tune", web: "tune" },
  blocked: { ios: "hand.raised", android: "block", web: "block" },
  reports: { ios: "flag", android: "flag", web: "flag" },
  circle: { ios: "person.2", android: "group", web: "group" },
  language: { ios: "globe", android: "language", web: "language" },
  next: {
    ios: "chevron.right",
    android: "chevron_right",
    web: "chevron_right",
  },
  signOut: {
    ios: "rectangle.portrait.and.arrow.right",
    android: "logout",
    web: "logout",
  },
} satisfies Record<string, SymbolViewProps["name"]>;

type OptionsSheet = "settings" | "language" | "settings-language";

export function CommunityScreen({
  children,
  title,
  titleAction,
  inlineTitleAction = false,
  eyebrow,
  subtitle,
  back,
  backAction,
  backHref = "/",
  settingsMenu = true,
  keyboard,
  footer,
  scrollRef,
  onContentSizeChange,
  fixedTitle = false,
  compactTitle = false,
  refreshControl,
  scroll = true,
  design = false,
  renderList,
}: CommunityScreenProps) {
  const localizedType = useLocalizedType();
  const { t, locale } = useOnboardingText();
  const { state, saving, savePreferences } = useOnboarding();
  const memberships = useMemberships();
  const ledCircles =
    memberships.state.status === "ready"
      ? memberships.state.items.filter(
          (item) => item.role === "leader" && item.status === "approved",
        )
      : [];
  const [options, setOptions] = useState<OptionsSheet | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const copy = text[locale];
  const label = localizedType("field-label", locale);
  const body = localizedType("body", locale);

  function openOptions(kind: OptionsSheet) {
    setSaveFailed(false);
    setOptions(kind);
  }

  function closeOptions() {
    if (!saving)
      setOptions(options === "settings-language" ? "settings" : null);
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
    else router.replace(backHref);
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
            {settingsMenu ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => openOptions("settings")}
                style={styles.headerButton}
              >
                <Text style={[label, styles.green]}>{copy.settings}</Text>
              </Pressable>
            ) : null}
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
        onRequestClose={closeOptions}
      >
        <SafeAreaView style={styles.scrim}>
          <View accessibilityViewIsModal style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text
                accessibilityRole="header"
                style={[
                  localizedType("section-heading", locale),
                  styles.sheetTitle,
                ]}
              >
                {options === "settings" ? copy.settings : copy.language}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: saving }}
                disabled={saving}
                onPress={closeOptions}
                style={styles.sheetDone}
              >
                <Text style={[label, styles.green]}>{copy.done}</Text>
              </Pressable>
            </View>
            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetContent}
            >
              {options === "settings" ? (
                <>
                  <View style={styles.settingsGroup}>
                    {(
                      [
                        ["profile", copy.profile, "/settings"],
                        [
                          "notifications",
                          activityCopy[locale].notifications,
                          "/notifications",
                        ],
                        [
                          "preferences",
                          activityCopy[locale].preferences,
                          "/notification-preferences",
                        ],
                        [
                          "blocked",
                          neighbourCopy[locale].blockedPeople,
                          "/blocked-people",
                        ],
                      ] as const
                    ).map(([icon, itemLabel, href]) => (
                      <View key={href} style={styles.rule}>
                        <SettingsRow
                          icon={icon}
                          label={itemLabel}
                          locale={locale}
                          onPress={() => {
                            setOptions(null);
                            router.navigate(href);
                          }}
                        />
                      </View>
                    ))}
                    {ledCircles.map((ledCircle) => (
                      <View key={ledCircle.circle_id} style={styles.rule}>
                        <SettingsRow
                          icon="circle"
                          label={circleCopy[locale].manageCircle}
                          locale={locale}
                          value={
                            ledCircles.length > 1
                              ? ledCircle.circle?.name
                              : undefined
                          }
                          onPress={() => {
                            setOptions(null);
                            router.push({
                              pathname: "/circles/[id]",
                              params: { id: ledCircle.circle_id },
                            });
                          }}
                        />
                      </View>
                    ))}
                    <View style={styles.rule}>
                      <SettingsRow
                        icon="reports"
                        label={circleCopy[locale].myReports}
                        locale={locale}
                        onPress={() => {
                          setOptions(null);
                          router.push("/my-reports");
                        }}
                      />
                    </View>
                    <SettingsRow
                      icon="language"
                      label={copy.language}
                      locale={locale}
                      value={
                        languages.find((language) => language.value === locale)
                          ?.label
                      }
                      onPress={() => openOptions("settings-language")}
                    />
                  </View>
                  <CommunitySignOut onClose={() => setOptions(null)} />
                </>
              ) : (
                <>
                  <Choice
                    options={languages}
                    value={locale}
                    onChange={chooseLanguage}
                    disabled={saving}
                  />
                  {saveFailed ? <ErrorText>{t("saveError")}</ErrorText> : null}
                </>
              )}
            </ScrollView>
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
    <SettingsRow
      icon="signOut"
      label={t("signOut")}
      locale={locale}
      navigates={false}
      onPress={() => {
        onClose();
        void signOut();
      }}
    />
  );
}

function SettingsRow({
  icon,
  label,
  locale,
  value,
  navigates = true,
  onPress,
}: {
  icon: keyof typeof settingsIcons;
  label: string;
  locale: Language;
  value?: string;
  navigates?: boolean;
  onPress: () => void;
}) {
  const localizedType = useLocalizedType();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      onPress={onPress}
      android_ripple={{ color: colors.wash }}
      style={styles.settingsRow}
    >
      <SymbolView
        name={settingsIcons[icon]}
        size={19}
        tintColor={colors.action}
        accessible={false}
      />
      <Text style={[localizedType("field-label", locale), styles.rowLabel]}>
        {label}
      </Text>
      {value ? (
        <Text style={[localizedType("supporting", locale), styles.secondary]}>
          {value}
        </Text>
      ) : null}
      {navigates ? (
        <SymbolView
          name={settingsIcons.next}
          size={13}
          tintColor={colors.control}
          accessible={false}
        />
      ) : null}
    </Pressable>
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
    maxHeight: "88%",
    backgroundColor: colors.canvas,
    paddingHorizontal: spacing["screen-gutter"],
    paddingTop: spacing["related-gap"],
    paddingBottom: spacing["control-gap"],
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["related-gap"],
  },
  sheetTitle: { flex: 1, color: colors.ink },
  sheetDone: {
    minHeight: controls["touch-target"],
    minWidth: controls["touch-target"],
    alignItems: "flex-end",
    justifyContent: "center",
  },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  sheetContent: {
    gap: spacing["related-gap"],
    paddingTop: spacing["related-gap"],
  },
  settingsGroup: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 12,
    overflow: "hidden",
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["control-gap"],
    minHeight: controls["touch-target"],
    paddingHorizontal: spacing["control-gap"],
    paddingVertical: 6,
  },
  rowLabel: { flex: 1, color: colors.ink },
});
