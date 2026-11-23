import { useState } from "react";
import { Switch, View } from "react-native";
import {
  ActivityStatus,
  ActivityText,
  activityStyles as styles,
} from "@/components/activity-ui";
import { CommunityScreen } from "@/components/community-screen";
import { Button, ErrorText, Field } from "@/components/ui";
import { api, type UserProfile } from "@/lib/api";
import { activityCopy } from "@/lib/activity-copy";
import { useLiveResource } from "@/lib/live-resource";
import { useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors } from "@/theme/tokens.json";

const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export default function NotificationPreferencesScreen() {
  const { locale } = useOnboardingText();
  const copy = activityCopy[locale];
  const preferences = useLiveResource(api.getMyProfile);
  return (
    <CommunityScreen live back keyboard title={copy.preferences}>
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
  const [quiet, setQuiet] = useState(
    Boolean(initial.quiet_hours_start && initial.quiet_hours_end),
  );
  const [start, setStart] = useState(
    initial.quiet_hours_start?.slice(0, 5) ?? "",
  );
  const [end, setEnd] = useState(initial.quiet_hours_end?.slice(0, 5) ?? "");
  const [paused, setPaused] = useState(!initial.push_enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function change(update: () => void) {
    update();
    setSaved(false);
    setError(null);
  }

  async function save() {
    if (saving) return;
    setSaved(false);
    if (quiet && (!validTime(start) || !validTime(end) || start === end)) {
      setError(copy.timeError);
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

  const disabled = saving || loading;
  return (
    <>
      <View style={styles.card}>
        <View style={styles.row}>
          <ActivityText strong>{copy.quiet}</ActivityText>
          <Switch
            accessibilityLabel={copy.quiet}
            value={quiet}
            disabled={disabled}
            onValueChange={(value) => change(() => setQuiet(value))}
            trackColor={{ true: colors.action, false: colors.rule }}
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
      </View>
      <View style={styles.card}>
        <View style={styles.row}>
          <ActivityText strong>{copy.pause}</ActivityText>
          <Switch
            accessibilityLabel={copy.pause}
            value={paused}
            disabled={disabled}
            onValueChange={(value) => change(() => setPaused(value))}
            trackColor={{ true: colors.action, false: colors.rule }}
          />
        </View>
        <ActivityText>{copy.pauseHelp}</ActivityText>
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {saved ? <ActivityText>{copy.saved}</ActivityText> : null}
      <Button
        label={copy.save}
        busy={saving}
        disabled={disabled}
        onPress={save}
      />
    </>
  );
}
