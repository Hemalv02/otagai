import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { useEffect, useState } from "react";
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
  activityLocale,
  activityScreenCopy,
  quietHoursSummary,
} from "@/lib/activity-screen-copy";
import { useLiveResource } from "@/lib/live-resource";
import {
  devicePushCopy,
  getDeviceRegistration,
  registerDevice,
  removeDeviceRegistration,
  supportsDevicePush,
} from "@/lib/device-push";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, controls, spacing } from "@/theme/tokens.json";

const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const defaultStart = "22:00";
const defaultEnd = "07:00";
type QuietTime = "start" | "end";

function pickerDate(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(2000, 0, 1, hours, minutes);
}

function pickerTime(date: Date) {
  return [date.getHours(), date.getMinutes()]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export default function NotificationPreferencesScreen() {
  const { locale } = useOnboardingText();
  const { session } = useSession();
  const copy = activityCopy[locale];
  const screen = activityScreenCopy[locale];
  const preferences = useLiveResource(api.getMyProfile);
  return (
    <CommunityScreen
      showDemoPreview={false}
      design
      back
      title={copy.notifications}
      subtitle={screen.preferencesBody}
    >
      <ActivityStatus
        loading={preferences.loading}
        error={preferences.error}
        retry={preferences.reload}
      />
      {session ? (
        <DeviceAlerts key={session.user.id} userId={session.user.id} />
      ) : null}
      {preferences.data ? (
        <PreferencesForm
          initial={preferences.data}
          loading={preferences.loading || preferences.error}
        />
      ) : null}
    </CommunityScreen>
  );
}

function DeviceAlerts({ userId }: { userId: string }) {
  const { locale } = useOnboardingText();
  const copy = devicePushCopy[locale];
  const [registered, setRegistered] = useState(false);
  const [busy, setBusy] = useState(supportsDevicePush);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!supportsDevicePush) return;
    let current = true;
    async function load() {
      try {
        const previous = await getDeviceRegistration(userId);
        if (!previous) return;
        const result = await registerDevice(userId, false, copy.channel);
        if (result === "denied") await removeDeviceRegistration(userId);
        if (current) setRegistered(result === "registered");
      } catch {
        if (current) setError(copy.failed);
      } finally {
        if (current) setBusy(false);
      }
    }
    void load();
    return () => {
      current = false;
    };
  }, [copy.channel, copy.failed, userId]);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (registered) {
        await removeDeviceRegistration(userId);
        setRegistered(false);
      } else {
        const result = await registerDevice(userId, true, copy.channel);
        if (result === "registered") setRegistered(true);
        else setError(result === "denied" ? copy.denied : copy.unavailable);
      }
    } catch {
      setError(copy.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.topic}>
      <ActivityText strong>{copy.title}</ActivityText>
      {!supportsDevicePush ? (
        <ActivityText>{copy.unavailable}</ActivityText>
      ) : (
        <>
          {registered ? <ActivityText>{copy.enabled}</ActivityText> : null}
          <Button
            variant="text"
            label={registered ? copy.disable : copy.enable}
            labelStyle={localizedType("field-label", locale)}
            busy={busy}
            onPress={() => void toggle()}
          />
        </>
      )}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
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
    initial.quiet_hours_start?.slice(0, 5) ?? defaultStart,
  );
  const [end, setEnd] = useState(
    initial.quiet_hours_end?.slice(0, 5) ?? defaultEnd,
  );
  const [paused, setPaused] = useState(!initial.push_enabled);
  const [editing, setEditing] = useState(false);
  const [activePicker, setActivePicker] = useState<QuietTime | null>(null);
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
  const devicePicker = Platform.OS === "ios" || Platform.OS === "android";
  const timeLocale = locale === "en" ? "en-US" : activityLocale(locale);
  const timeFormat = new Intl.DateTimeFormat(timeLocale, {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: locale === "en" ? "h12" : "h23",
  });
  const timeFields = [
    { key: "start", label: copy.start, value: start, update: setStart },
    { key: "end", label: copy.end, value: end, update: setEnd },
  ] as const;

  function closeEditor() {
    setActivePicker(null);
    setEditing(false);
  }

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
      setStart(result.quiet_hours_start?.slice(0, 5) ?? defaultStart);
      setEnd(result.quiet_hours_end?.slice(0, 5) ?? defaultEnd);
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
        onRequestClose={closeEditor}
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
                  onChange={(value) =>
                    change(() => {
                      setQuiet(value);
                      setActivePicker(null);
                    })
                  }
                />
              </View>
              <ActivityText>{copy.quietHelp}</ActivityText>
              <ActivityText>
                {copy.timeZone}: {initial.timezone}
              </ActivityText>
              {quiet
                ? timeFields.map(({ key, label, value, update }) => {
                    if (!devicePicker) {
                      return (
                        <Field
                          key={key}
                          label={`${label} (HH:mm)`}
                          labelStyle={localizedType("field-label", locale)}
                          value={value}
                          onChangeText={(text) => change(() => update(text))}
                          editable={!disabled}
                          maxLength={5}
                          autoCapitalize="none"
                        />
                      );
                    }
                    const date = pickerDate(value);
                    const expanded = activePicker === key;
                    return (
                      <View key={key}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={label}
                          accessibilityValue={{ text: timeFormat.format(date) }}
                          accessibilityState={{ expanded, disabled }}
                          disabled={disabled}
                          style={[
                            styles.timeRow,
                            expanded && styles.activeTimeRow,
                          ]}
                          onPress={() => setActivePicker(expanded ? null : key)}
                        >
                          <ActivityText strong>{label}</ActivityText>
                          <Text
                            style={[
                              localizedType("field-label", locale),
                              styles.timeValue,
                            ]}
                          >
                            {timeFormat.format(date)}
                          </Text>
                        </Pressable>
                        {expanded ? (
                          <DateTimePicker
                            value={date}
                            mode="time"
                            display={
                              Platform.OS === "ios" ? "spinner" : "clock"
                            }
                            presentation={
                              Platform.OS === "ios" ? "inline" : "dialog"
                            }
                            accentColor={colors.action}
                            style={
                              Platform.OS === "ios" ? styles.wheel : undefined
                            }
                            themeVariant="light"
                            locale={timeLocale.replace("-", "_")}
                            is24Hour={locale !== "en"}
                            positiveButton={{ label: screen.done }}
                            negativeButton={{ label: screen.cancel }}
                            disabled={disabled}
                            onDismiss={() => setActivePicker(null)}
                            onValueChange={(_, selected) =>
                              change(() => {
                                update(pickerTime(selected));
                                if (Platform.OS === "android") {
                                  setActivePicker(null);
                                }
                              })
                            }
                          />
                        ) : null}
                      </View>
                    );
                  })
                : null}
              {timeError ? (
                <ErrorText>
                  {devicePicker ? copy.timeError : copy.typedTimeError}
                </ErrorText>
              ) : null}
              <Button
                label={screen.done}
                labelStyle={localizedType("button", locale)}
                disabled={disabled}
                onPress={() => {
                  if (!validQuietHours()) {
                    setTimeError(true);
                    return;
                  }
                  closeEditor();
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
  timeRow: {
    minHeight: controls["touch-target"],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing["related-gap"],
    paddingHorizontal: spacing["control-gap"],
    paddingVertical: spacing["related-gap"],
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: controls.radius,
  },
  activeTimeRow: { backgroundColor: colors.wash, borderColor: colors.action },
  wheel: { alignSelf: "center", width: "100%", maxWidth: 320 },
  timeValue: { color: colors.action, fontVariant: ["tabular-nums"] },
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
