import { router } from "expo-router";
import { useRef, useState } from "react";
import { Text, View } from "react-native";

import {
  OnboardingLink,
  OnboardingScreen,
} from "@/components/onboarding-screen";
import { ActivityToggle } from "@/components/activity-toggle";
import { Button, Choice, ErrorText, Field } from "@/components/ui";
import {
  api,
  type CircleMembership,
  type CircleUnitType,
  type MembershipRole,
} from "@/lib/api";
import { circleCopy } from "@/lib/circle-copy";
import { useMemberships } from "@/lib/memberships";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";

const unitsByRegion: Record<"jp" | "bd", CircleUnitType[]> = {
  jp: ["han", "association", "building"],
  bd: ["para", "moholla", "building"],
};

export default function StartCircle() {
  const { profile, signOut } = useSession();
  const { record } = useMemberships();
  const { t, locale } = useOnboardingText();
  const copy = circleCopy[locale];
  const region = profile.status === "ready" ? profile.profile.region : "jp";
  const units = unitsByRegion[region];
  const [name, setName] = useState("");
  const [unitType, setUnitType] = useState<CircleUnitType>(units[0]);
  const [openToNearby, setOpenToNearby] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const body = localizedType("body", locale);
  const fieldLabel = localizedType("field-label", locale);

  async function create() {
    if (!name.trim() || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const detail = await api.createCircle({
        name: name.trim(),
        unit_type: unitType,
        open_to_nearby: openToNearby,
      });
      record(detail, {
        circle_id: detail.id,
        role: (detail.my_role as MembershipRole | null) ?? "leader",
        status:
          (detail.my_status as CircleMembership["status"] | null) ?? "approved",
        circle: detail,
      });
    } catch {
      setFailed(true);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <OnboardingScreen
      keyboard
      action={
        <OnboardingLink
          label={t("back")}
          disabled={busy}
          onPress={() => (router.canGoBack() ? router.back() : signOut())}
        />
      }
      footer={
        <Button
          label={copy.create}
          labelStyle={localizedType("button", locale)}
          busy={busy}
          disabled={!name.trim()}
          onPress={create}
        />
      }
    >
      <View className="gap-related-gap">
        <Text
          accessibilityRole="header"
          className="text-ink"
          style={localizedType("screen-title", locale)}
        >
          {copy.startCircle}
        </Text>
        <Text className="text-secondary" style={body}>
          {copy.startCircleBody}
        </Text>
      </View>
      <Field
        label={copy.circleName}
        style={body}
        labelStyle={fieldLabel}
        value={name}
        onChangeText={setName}
        maxLength={120}
        editable={!busy}
        placeholder={copy.circleNamePlaceholder}
      />
      <View className="gap-related-gap">
        <Text className="text-ink" style={fieldLabel}>
          {copy.circleType}
        </Text>
        <Choice
          options={units.map((value) => ({
            value,
            label: copy.types[value],
          }))}
          value={unitType}
          onChange={setUnitType}
          labelStyle={() => body}
          disabled={busy}
          stacked
        />
      </View>
      <View className="flex-row items-center gap-control-gap">
        <View className="flex-1">
          <Text className="text-ink" style={fieldLabel}>
            {copy.openToNearby}
          </Text>
        </View>
        <ActivityToggle
          label={copy.openToNearby}
          value={openToNearby}
          disabled={busy}
          onChange={setOpenToNearby}
        />
      </View>
      {failed ? <ErrorText>{copy.createError}</ErrorText> : null}
    </OnboardingScreen>
  );
}
