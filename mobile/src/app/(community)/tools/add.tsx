import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { LendingPhoto } from "@/components/lending-photo";
import { ListingCategoryPicker } from "@/components/listing-category-picker";
import { Button, Choice, ErrorText, Field } from "@/components/ui";
import { useCommunityDemo } from "@/lib/community-demo";
import {
  type ListingCategory,
  type ListingKind,
  type ListingPhoto,
  useDemoListings,
} from "@/lib/demo-listings";
import { lendingCopy } from "@/lib/lending-copy";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { colors, controls, spacing } from "@/theme/tokens.json";

type FormError =
  "required" | "photoFailed" | "cameraPermission" | "publishFailed";
const pickerOptions: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  quality: 0.7,
};

export default function AddListingScreen() {
  const { locale } = useOnboardingText();
  const { actor } = useCommunityDemo();
  const { publish, ready } = useDemoListings();
  const copy = lendingCopy[locale];
  const [kind, setKind] = useState<ListingKind>("tool");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ListingCategory | "">("");
  const [description, setDescription] = useState("");
  const [safety, setSafety] = useState("");
  const [availability, setAvailability] = useState("");
  const [photo, setPhoto] = useState<ListingPhoto | null>(null);
  const [error, setError] = useState<FormError | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const working = useRef(false);
  const labelType = localizedType("field-label", locale);
  const bodyType = localizedType("body", locale);
  const buttonType = localizedType("button", locale);
  const tool = kind === "tool";
  const busy = picking || saving;

  useEffect(() => {
    if (Platform.OS !== "android") return;
    let current = true;
    void ImagePicker.getPendingResultAsync()
      .then((result) => {
        if (!current || !result) return;
        if ("code" in result) setError("photoFailed");
        else if (!result.canceled) setPhoto({ uri: result.assets[0].uri });
      })
      .catch(() => {
        if (current) setError("photoFailed");
      });
    return () => {
      current = false;
    };
  }, []);

  async function selectPhoto(source: "camera" | "library") {
    if (working.current) return;
    working.current = true;
    setPicking(true);
    setError(null);
    try {
      if (source === "camera" && Platform.OS !== "web") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError("cameraPermission");
          return;
        }
      }
      const result = await (source === "camera"
        ? ImagePicker.launchCameraAsync(pickerOptions)
        : ImagePicker.launchImageLibraryAsync(pickerOptions));
      if (!result.canceled) setPhoto({ uri: result.assets[0].uri });
    } catch {
      setError("photoFailed");
    } finally {
      working.current = false;
      setPicking(false);
    }
  }

  function loadSample() {
    setError(null);
    setPhoto("grass-cutter");
    if (tool) {
      setName((value) => value || copy.sampleName);
      setCategory((value) => value || "garden");
      setDescription((value) => value || copy.sampleParts);
      setSafety((value) => value || copy.sampleSafety);
    }
  }

  async function submit() {
    if (!ready || working.current) return;
    if (!name.trim() || !category) {
      setError("required");
      return;
    }

    working.current = true;
    setSaving(true);
    setError(null);
    try {
      const id = await publish({
        title: name.trim(),
        description: description.trim(),
        availabilityNote: availability.trim() || undefined,
        safetyNote: tool ? safety.trim() || undefined : undefined,
        photo: photo ?? undefined,
        category,
        postedBy: actor,
        kind,
      });
      router.replace({ pathname: "/tools/[id]", params: { id } });
    } catch {
      setError("publishFailed");
    } finally {
      working.current = false;
      setSaving(false);
    }
  }

  return (
    <CommunityScreen
      title={copy.addListing}
      back
      keyboard
      footer={
        <Button
          label={copy.publish}
          labelStyle={buttonType}
          busy={saving}
          disabled={!ready || picking}
          onPress={submit}
        />
      }
    >
      <Choice<ListingKind>
        options={[
          { value: "tool", label: copy.toolOrItem },
          { value: "skill", label: copy.oneSkill },
        ]}
        value={kind}
        onChange={setKind}
        labelStyle={() => labelType}
        disabled={busy}
      />
      <Field
        label={tool ? copy.toolName : copy.skillName}
        placeholder={tool ? copy.toolExample : copy.skillExample}
        value={name}
        onChangeText={(next) => {
          setName(next);
          if (error === "required") setError(null);
        }}
        labelStyle={labelType}
        style={bodyType}
        editable={!busy}
        maxLength={100}
      />
      <View style={styles.category}>
        <Text style={[labelType, styles.ink]}>{copy.category}</Text>
        <ListingCategoryPicker
          value={category}
          onChange={(next) => {
            setCategory(next);
            if (error === "required") setError(null);
          }}
          disabled={busy}
        />
      </View>
      <Field
        label={tool ? copy.includedParts : copy.description}
        placeholder={
          tool ? copy.toolDescriptionExample : copy.skillDescriptionExample
        }
        value={description}
        onChangeText={setDescription}
        labelStyle={labelType}
        style={[bodyType, styles.multiline]}
        editable={!busy}
        multiline
        maxLength={400}
      />
      <Field
        label={copy.availabilityOptional}
        placeholder={tool ? copy.pickupExample : copy.skillAvailabilityExample}
        value={availability}
        onChangeText={setAvailability}
        labelStyle={labelType}
        style={bodyType}
        editable={!busy}
        maxLength={100}
      />
      {tool ? (
        <Field
          label={copy.safetyOptional}
          value={safety}
          onChangeText={setSafety}
          labelStyle={labelType}
          style={bodyType}
          editable={!busy}
          maxLength={250}
        />
      ) : null}
      <View style={styles.photos}>
        <Text style={[labelType, styles.ink]}>{copy.photoOptional}</Text>
        {photo ? (
          <LendingPhoto
            photo={photo}
            caption={copy.photoCaption}
            locale={locale}
          />
        ) : null}
        <View style={styles.photoActions}>
          <Button
            label={copy.choosePhoto}
            labelStyle={labelType}
            onPress={() => selectPhoto("library")}
            disabled={busy}
            variant="text"
          />
          <Button
            label={copy.takePhoto}
            labelStyle={labelType}
            onPress={() => selectPhoto("camera")}
            disabled={busy}
            variant="text"
          />
          {photo ? (
            <Button
              label={copy.removePhoto}
              labelStyle={labelType}
              onPress={() => setPhoto(null)}
              disabled={busy}
              variant="text"
            />
          ) : tool ? (
            <Button
              label={copy.demoPhoto}
              labelStyle={labelType}
              onPress={loadSample}
              disabled={busy}
              variant="text"
            />
          ) : null}
        </View>
      </View>
      {error ? <ErrorText>{copy[error]}</ErrorText> : null}
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  ink: { color: colors.ink },
  category: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: controls["touch-target"],
    gap: spacing["related-gap"],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  multiline: { minHeight: 78 },
  photos: { gap: spacing["related-gap"] },
  photoActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing["card-inset"],
  },
});
