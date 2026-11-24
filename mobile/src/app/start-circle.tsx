import * as Location from "expo-location";
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
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";

const unitsByRegion: Record<"jp" | "bd", CircleUnitType[]> = {
  jp: ["han", "association", "building"],
  bd: ["para", "moholla", "building"],
};

export default function StartCircle() {
  const { profile } = useSession();
  const localizedType = useLocalizedType();
  const { record } = useMemberships();
  const { t, locale } = useOnboardingText();
  const copy = circleCopy[locale];
  const region = profile.status === "ready" ? profile.profile.region : "jp";
  const units = unitsByRegion[region];
  const [name, setName] = useState("");
  const [unitType, setUnitType] = useState<CircleUnitType>(units[0]);
  const [openToNearby, setOpenToNearby] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"createError" | "nearbyLocationError">();
  const submitting = useRef(false);
  const body = localizedType("body", locale);
  const fieldLabel = localizedType("field-label", locale);

  async function create() {
    if (!name.trim() || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const position = openToNearby
        ? await getApproximatePosition()
        : undefined;
      if (openToNearby && !position) {
        setError("nearbyLocationError");
        return;
      }
      const detail = await api.createCircle({
        name: name.trim(),
        unit_type: unitType,
        open_to_nearby: openToNearby,
        ...position,
      });
      record(detail, {
        circle_id: detail.id,
        role: (detail.my_role as MembershipRole | null) ?? "leader",
        status:
          (detail.my_status as CircleMembership["status"] | null) ?? "approved",
        circle: detail,
      });
    } catch {
      setError("createError");
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
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/find-circle")
          }
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
          <Text className="text-secondary" style={body}>
            {copy.nearbyLocationHint}
          </Text>
        </View>
        <ActivityToggle
          label={copy.openToNearby}
          value={openToNearby}
          disabled={busy}
          onChange={setOpenToNearby}
        />
      </View>
      {error ? <ErrorText>{copy[error]}</ErrorText> : null}
    </OnboardingScreen>
  );
}

async function getApproximatePosition() {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return;
    const { coords } = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      approx_lat: Math.round(coords.latitude * 1000) / 1000,
      approx_lng: Math.round(coords.longitude * 1000) / 1000,
    };
  } catch {
    return;
  }
}
