import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityStatus, ActivityText } from "@/components/activity-ui";
import { ActivityToggle } from "@/components/activity-toggle";
import { CommunityScreen } from "@/components/community-screen";
import { Button, ErrorText, Field } from "@/components/ui";
import { api, type UserProfile } from "@/lib/api";
import { activityCopy } from "@/lib/activity-copy";
import {
  activityScreenCopy,
  quietHoursSummary,
} from "@/lib/activity-screen-copy";
import { useLiveResource } from "@/lib/live-resource";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, spacing } from "@/theme/tokens.json";

const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export default function NotificationPreferencesScreen() {
  const { locale } = useOnboardingText();
  const copy = activityCopy[locale];
  const screen = activityScreenCopy[locale];
  const preferences = useLiveResource(api.getMyProfile);
  return (
    <CommunityScreen
      live
      design
      back
      keyboard
      title={copy.notifications}
      subtitle={screen.preferencesBody}
    >
      <ActivityStatus
        loading={preferences.loading}
        error={preferences.error}
        retry={preferences.reload}
      />
      {preferences.data ? (
        <PreferencesForm
          initial={preferences.data}
          loading={preferences.loading || preferences.error}
        />
      ) : null}
    </CommunityScreen>
  );
}

function PreferencesForm({
  initial,
  loading,
}: {
  initial: UserProfile;
  loading: boolean;
}) {
  const { locale } = useOnboardingText();
  const { setProfile } = useSession();
  const copy = activityCopy[locale];
  const screen = activityScreenCopy[locale];
  const [quiet, setQuiet] = useState(
    Boolean(initial.quiet_hours_start && initial.quiet_hours_end),
  );
  const [start, setStart] = useState(
    initial.quiet_hours_start?.slice(0, 5) ?? "",
  );
  const [end, setEnd] = useState(initial.quiet_hours_end?.slice(0, 5) ?? "");
  const [paused, setPaused] = useState(!initial.push_enabled);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeError, setTimeError] = useState(false);
  const [saved, setSaved] = useState(false);
  const topics = [
    [screen.nearby, screen.nearbyDetail],
    [screen.matches, screen.matchesDetail],
    [screen.messages, screen.messagesDetail],
    [screen.reminders, screen.remindersDetail],
    [screen.thanks, screen.thanksDetail],
  ];
  const disabled = saving || loading;

  function change(update: () => void) {
    update();
    setSaved(false);
    setError(null);
    setTimeError(false);
  }
  function validQuietHours() {
    return !quiet || (validTime(start) && validTime(end) && start !== end);
  }

  async function save() {
    if (saving) return;
    setSaved(false);
    if (!validQuietHours()) {
      setTimeError(true);
      setEditing(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await api.updateNotificationPreferences({
        push_enabled: !paused,
        quiet_hours_start: quiet ? `${start}:00` : null,
        quiet_hours_end: quiet ? `${end}:00` : null,
      });
      setProfile(result);
      setQuiet(Boolean(result.quiet_hours_start && result.quiet_hours_end));
      setStart(result.quiet_hours_start?.slice(0, 5) ?? "");
      setEnd(result.quiet_hours_end?.slice(0, 5) ?? "");
      setPaused(!result.push_enabled);
      setSaved(true);
    } catch {
      setError(copy.actionError);
    } finally {
      setSaving(false);
    }
  }

  const summary =
    quiet && validTime(start) && validTime(end)
      ? quietHoursSummary(start, end, locale)
      : screen.off;
  return (
    <>
      {topics.map(([title, detail]) => (
        <View key={title} style={styles.topic}>
          <ActivityText strong>{title}</ActivityText>
          <ActivityText>{detail}</ActivityText>
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${copy.quiet}: ${summary}`}
        disabled={disabled}
        style={styles.quietRow}
        onPress={() => setEditing(true)}
      >
        <View style={styles.rowCopy}>
          <ActivityText strong>{copy.quiet}</ActivityText>
          <ActivityText>{screen.quietDetail}</ActivityText>
        </View>
        <Text style={[localizedType("supporting", locale), styles.summary]}>
          {summary}
        </Text>
      </Pressable>
      <View>
        <Button
          label={paused ? screen.resume : copy.pause}
          variant="text"
          disabled={disabled}
          labelStyle={localizedType("field-label", locale)}
          onPress={() => change(() => setPaused(!paused))}
        />
        {paused ? <ActivityText>{copy.pauseHelp}</ActivityText> : null}
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {saved ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[localizedType("supporting", locale), styles.ink]}
        >
          {copy.saved}
        </Text>
      ) : null}
      <Button
        label={screen.saveNotifications}
        labelStyle={localizedType("button", locale)}
        busy={saving}
        disabled={disabled}
        onPress={save}
      />
      <ActivityText>{screen.inboxActivity}</ActivityText>
      <Modal
        visible={editing}
        transparent
        animationType="slide"
        onRequestClose={() => setEditing(false)}
      >
        <KeyboardAvoidingView
          style={styles.scrim}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <SafeAreaView style={styles.modalArea}>
            <ScrollView
              accessibilityViewIsModal
              style={styles.sheet}
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.editorHeading}>
                <Text
                  accessibilityRole="header"
                  style={[localizedType("section-heading", locale), styles.ink]}
                >
                  {copy.quiet}
                </Text>
                <ActivityToggle
                  label={copy.quiet}
                  value={quiet}
                  disabled={disabled}
                  onChange={(value) => change(() => setQuiet(value))}
                />
              </View>
              <ActivityText>{copy.quietHelp}</ActivityText>
              <ActivityText>
                {copy.timeZone}: {initial.timezone}
              </ActivityText>
              {quiet ? (
                <>
                  <Field
                    label={copy.start}
                    labelStyle={localizedType("field-label", locale)}
                    value={start}
                    placeholder="22:00"
                    onChangeText={(value) => change(() => setStart(value))}
                    editable={!disabled}
                    maxLength={5}
                    keyboardType="numbers-and-punctuation"
                    autoCapitalize="none"
                  />
                  <Field
                    label={copy.end}
                    labelStyle={localizedType("field-label", locale)}
                    value={end}
                    placeholder="07:00"
                    onChangeText={(value) => change(() => setEnd(value))}
                    editable={!disabled}
                    maxLength={5}
                    keyboardType="numbers-and-punctuation"
                    autoCapitalize="none"
                  />
                </>
              ) : null}
              {timeError ? <ErrorText>{copy.timeError}</ErrorText> : null}
              <Button
                label={screen.done}
                labelStyle={localizedType("button", locale)}
                disabled={disabled}
                onPress={() => {
                  if (!validQuietHours()) {
                    setTimeError(true);
                    return;
                  }
                  setEditing(false);
                }}
              />
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  topic: { minHeight: 48, paddingTop: 4, paddingBottom: 5, paddingRight: 50 },
  quietRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["control-gap"],
    paddingTop: 4,
    paddingBottom: 5,
  },
  rowCopy: { flex: 1 },
  summary: { color: colors.action, width: 92, textAlign: "right" },
  ink: { color: colors.ink },
  scrim: {
    flex: 1,
    backgroundColor: "rgba(48,54,48,0.28)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.canvas,
    width: "100%",
    maxWidth: 540,
    alignSelf: "center",
    flexGrow: 0,
    maxHeight: "100%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalArea: { flex: 1, justifyContent: "flex-end" },
  sheetContent: {
    padding: spacing["screen-gutter"],
    gap: spacing["card-inset"],
  },
  editorHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing["control-gap"],
  },
});
