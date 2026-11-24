import { Host, Picker } from "@expo/ui";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { router, useNavigation } from "expo-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { RequestNotice } from "@/components/request-notice";
import { LendingPhoto } from "@/components/lending-photo";
import { Button, Choice, ErrorText, Field } from "@/components/ui";
import {
  api,
  ApiError,
  type CategoryNode,
  type ListingKind,
  type LendMode,
} from "@/lib/api";
import { listingDraftCopy } from "@/lib/listing-draft-copy";
import {
  emptyDraftFields,
  isRiskyCategory,
  listingLendMode,
  mergeSuggestion,
  parseParts,
  suggestionFields,
} from "@/lib/listing-draft";
import { myListingsCopy } from "@/lib/my-listings-copy";
import {
  createLatestRequest,
  prepareListingMedia,
} from "@/lib/listing-workflow";
import { categoryName, flattenCategories } from "@/lib/listing-read";
import { lendingCopy } from "@/lib/lending-copy";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, controls, spacing } from "@/theme/tokens.json";

type FormError =
  | "required"
  | "photoFailed"
  | "cameraPermission"
  | "publishFailed"
  | "attachmentFailed";
type CategoryLoad =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; items: CategoryNode[]; isCurrent: () => boolean };
const pickerOptions: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  quality: 0.7,
};

export default function AddListingScreen() {
  const navigation = useNavigation();
  const { session } = useSession();
  const account = session?.user.id;
  const { locale } = useOnboardingText();
  const messages = myListingsCopy[locale];
  const copy = lendingCopy[locale];
  const draftCopy = listingDraftCopy[locale];
  const [categoryQuery, setCategoryQuery] = useState<{
    kind: ListingKind;
    version: number;
  }>({ kind: "tool", version: 0 });
  const { kind } = categoryQuery;
  const currentKind = useRef(kind);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [safety, setSafety] = useState("");
  const [parts, setParts] = useState("");
  const [lastSuggested, setLastSuggested] = useState(emptyDraftFields);
  const [suggestedMode, setSuggestedMode] = useState<LendMode | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionMessage, setSuggestionMessage] = useState<string | null>(
    null,
  );
  const currentFields = useRef(emptyDraftFields);
  useLayoutEffect(() => {
    currentFields.current = {
      title: name,
      categoryId: category,
      parts,
      safety,
    };
  }, [name, category, parts, safety]);
  const [availability, setAvailability] = useState("");
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [categoryLoad, setCategoryLoad] = useState<CategoryLoad>({
    state: "loading",
  });
  const [error, setError] = useState<FormError | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const working = useRef(false);
  const [categoryRequests] = useState(createLatestRequest);
  const [formRequests] = useState(createLatestRequest);
  const labelType = localizedType("field-label", locale);
  const bodyType = localizedType("body", locale);
  const buttonType = localizedType("button", locale);
  const tool = kind === "tool";
  const busy = picking || saving || suggesting;

  useLayoutEffect(() => {
    function cancelFormWork() {
      formRequests.cancel();
      working.current = false;
    }
    const unsubscribe = navigation.addListener("blur", () => {
      cancelFormWork();
      setPicking(false);
      setSaving(false);
      setSuggesting(false);
    });
    return () => {
      unsubscribe();
      cancelFormWork();
    };
  }, [account, formRequests, navigation]);

  useEffect(() => {
    if (!account) return;
    const request = categoryRequests.start();
    api
      .listCategories(categoryQuery.kind, {
        authUserId: account,
        signal: request.signal,
      })
      .then((result) => {
        if (request.isCurrent()) {
          setCategoryLoad({
            state: "ready",
            items: flattenCategories(result.items),
            isCurrent: request.isCurrent,
          });
        }
      })
      .catch(() => {
        if (request.isCurrent()) setCategoryLoad({ state: "error" });
      });
    return () => categoryRequests.cancel();
  }, [account, categoryQuery, categoryRequests]);

  function reloadCategories(next: ListingKind) {
    if (working.current) return;
    currentKind.current = next;
    categoryRequests.cancel();
    setCategory("");
    setCategoryLoad({ state: "loading" });
    setCategoryQuery(({ version }) => ({ kind: next, version: version + 1 }));
    setError(null);
    setSuggestionMessage(null);
    setLastSuggested(emptyDraftFields);
    setSuggestedMode(null);
  }

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const request = formRequests.start();
    void ImagePicker.getPendingResultAsync()
      .then((result) => {
        if (!request.isCurrent() || !navigation.isFocused() || !result) return;
        if ("code" in result) setError("photoFailed");
        else if (!result.canceled) {
          setPhoto(result.assets[0]);
          setMediaId(null);
          setSuggestionMessage(null);
        }
      })
      .catch(() => {
        if (request.isCurrent() && navigation.isFocused())
          setError("photoFailed");
      });
  }, [account, formRequests, navigation]);

  async function selectPhoto(source: "camera" | "library") {
    if (working.current || !navigation.isFocused()) return;
    const request = formRequests.start();
    const stillCurrent = () => request.isCurrent() && navigation.isFocused();
    working.current = true;
    setPicking(true);
    setError(null);
    try {
      if (source === "camera" && Platform.OS !== "web") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!stillCurrent()) return;
        if (!permission.granted) {
          setError("cameraPermission");
          return;
        }
      }
      const result = await (source === "camera"
        ? ImagePicker.launchCameraAsync(pickerOptions)
        : ImagePicker.launchImageLibraryAsync(pickerOptions));
      if (stillCurrent() && !result.canceled) {
        setPhoto(result.assets[0]);
        setMediaId(null);
        setSuggestionMessage(null);
      }
    } catch {
      if (stillCurrent()) setError("photoFailed");
    } finally {
      if (request.isCurrent()) {
        working.current = false;
        setPicking(false);
      }
    }
  }

  async function readyMediaId(signal: AbortSignal) {
    if (!photo || !account) return null;
    const options = { authUserId: account, signal };
    return prepareListingMedia({
      mediaId,
      signal,
      upload: async () => {
        const form = new FormData();
        form.append("purpose", "listing");
        if (Platform.OS === "web" && photo.file)
          form.append("file", photo.file);
        else form.append("file", new File(photo.uri));
        return api.uploadListingPhoto(form, options);
      },
      getMedia: (id) => api.getMedia(id, options),
      onAccepted: setMediaId,
    });
  }

  async function suggest() {
    if (
      working.current ||
      !account ||
      !photo ||
      !tool ||
      !navigation.isFocused()
    )
      return;
    const request = formRequests.start();
    const stillCurrent = () => request.isCurrent() && navigation.isFocused();
    working.current = true;
    setSuggesting(true);
    setSuggestionMessage(null);
    let preparing = true;
    try {
      const id = await readyMediaId(request.signal);
      if (!id || !stillCurrent()) return;
      preparing = false;
      const draft = await api.draftListing(
        {
          image_media_id: id,
          language: locale,
          ...(description.trim() || name.trim()
            ? {
                description: [name.trim(), description.trim()]
                  .filter(Boolean)
                  .join("\n")
                  .slice(0, 1000),
              }
            : {}),
        },
        { authUserId: account, signal: request.signal },
      );
      if (!stillCurrent()) return;
      if (!draft.recognized) {
        setSuggestionMessage(draftCopy.unclear);
        return;
      }
      const categories =
        categoryLoad.state === "ready" && categoryLoad.isCurrent()
          ? categoryLoad.items
          : [];
      const next = suggestionFields(draft, categories);
      const merged = mergeSuggestion(
        currentFields.current,
        lastSuggested,
        next,
      );
      setName(merged.title);
      setCategory(merged.categoryId);
      setParts(merged.parts);
      setSafety(merged.safety);
      setLastSuggested(next);
      setSuggestedMode(draft.suggested_lend_mode);
      setSuggestionMessage(
        draft.category_id && !next.categoryId
          ? draftCopy.categoryUnmatched
          : draftCopy.suggestHint,
      );
    } catch (error) {
      if (stillCurrent())
        setSuggestionMessage(
          error instanceof ApiError && error.status === 429
            ? draftCopy.rateLimited
            : preparing || (error instanceof ApiError && error.status === 404)
              ? draftCopy.photoNotReady
              : draftCopy.failed,
        );
    } finally {
      if (request.isCurrent()) {
        working.current = false;
        setSuggesting(false);
      }
    }
  }

  async function submit() {
    if (working.current || !account || !navigation.isFocused()) return;
    if (categoryLoad.state !== "ready" || !categoryLoad.isCurrent()) return;
    if (
      !name.trim() ||
      !categoryLoad.items.some((item) => item.id === category)
    ) {
      setError("required");
      return;
    }

    const request = formRequests.start();
    const stillCurrent = () => request.isCurrent() && navigation.isFocused();
    const options = { authUserId: account, signal: request.signal };
    working.current = true;
    setSaving(true);
    setError(null);
    let preparingPhoto = Boolean(photo);
    let navigating = false;
    try {
      const id = await readyMediaId(request.signal);
      if (!stillCurrent()) return;
      preparingPhoto = false;
      const listing = await api.createListing(
        {
          kind,
          category_id: category,
          title: name.trim(),
          lang: locale,
          lend_mode: listingLendMode(
            kind,
            categoryLoad.items,
            category,
            suggestedMode,
          ),
          ...(tool ? { parts: parseParts(parts) } : {}),
          media_ids: id ? [id] : [],
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(tool && safety.trim() ? { safety_notes: safety.trim() } : {}),
          ...(availability.trim()
            ? { availability_note: availability.trim() }
            : {}),
        },
        options,
      );
      if (!stillCurrent()) return;
      router.replace({
        pathname: "/my-listings",
        params: { listingId: listing.id },
      });
      navigating = true;
    } catch {
      if (stillCurrent()) {
        setError(preparingPhoto ? "attachmentFailed" : "publishFailed");
      }
    } finally {
      if (!navigating && request.isCurrent()) {
        working.current = false;
        setSaving(false);
      }
    }
  }

  return (
    <CommunityScreen
      title={copy.addListing}
      showDemoPreview={false}
      back
      keyboard
      footer={
        <View style={styles.submit}>
          {error ? (
            <ErrorText>
              {error === "attachmentFailed" ? messages.photoError : copy[error]}
            </ErrorText>
          ) : null}
          <Button
            label={copy.publish}
            labelStyle={buttonType}
            busy={saving}
            disabled={
              picking ||
              suggesting ||
              categoryLoad.state !== "ready" ||
              categoryLoad.items.length === 0
            }
            onPress={submit}
          />
        </View>
      }
    >
      <Choice<ListingKind>
        options={[
          { value: "tool", label: copy.toolOrItem },
          { value: "skill", label: copy.oneSkill },
        ]}
        value={kind}
        onChange={(next) => {
          if (next !== currentKind.current) reloadCategories(next);
        }}
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
        editable={!picking && !saving}
        maxLength={120}
      />
      <View style={styles.category}>
        <Text style={[labelType, styles.ink]}>{copy.category}</Text>
        {categoryLoad.state === "loading" ? (
          <Text>{messages.loading}</Text>
        ) : categoryLoad.state === "error" ? (
          <View>
            <Text>{messages.categoriesFailed}</Text>
            <Button
              label={messages.retry}
              variant="text"
              disabled={busy}
              onPress={() => reloadCategories(currentKind.current)}
            />
          </View>
        ) : categoryLoad.items.length === 0 ? (
          <Text>{messages.categoriesEmpty}</Text>
        ) : (
          <Host
            key={categoryQuery.version}
            matchContents
            seedColor={colors.action}
          >
            <Picker<string>
              selectedValue={category}
              onValueChange={(id) => {
                if (
                  !working.current &&
                  categoryLoad.isCurrent() &&
                  (id === "" ||
                    categoryLoad.items.some((item) => item.id === id))
                ) {
                  setCategory(id);
                  if (error === "required") setError(null);
                }
              }}
              enabled={!busy}
              accessibilityLabel={copy.category}
            >
              <Picker.Item label={copy.categoryPrompt} value="" />
              {categoryLoad.items.map((item) => (
                <Picker.Item
                  key={item.id}
                  value={item.id}
                  label={categoryName(item, locale)}
                />
              ))}
            </Picker>
          </Host>
        )}
      </View>
      <Field
        label={copy.description}
        placeholder={
          tool ? copy.toolDescriptionExample : copy.skillDescriptionExample
        }
        value={description}
        onChangeText={setDescription}
        labelStyle={labelType}
        style={[bodyType, styles.multiline]}
        editable={!picking && !saving}
        multiline
        maxLength={2000}
      />
      {tool ? (
        <Field
          label={draftCopy.includedParts}
          value={parts}
          onChangeText={setParts}
          labelStyle={labelType}
          style={[bodyType, styles.multiline]}
          multiline
          editable={!picking && !saving}
          maxLength={4000}
        />
      ) : null}
      <Field
        label={copy.availabilityOptional}
        placeholder={tool ? copy.pickupExample : copy.skillAvailabilityExample}
        value={availability}
        onChangeText={setAvailability}
        labelStyle={labelType}
        style={bodyType}
        editable={!picking && !saving}
        maxLength={2000}
      />
      {tool ? (
        <Field
          label={copy.safetyOptional}
          value={safety}
          onChangeText={setSafety}
          labelStyle={labelType}
          style={bodyType}
          editable={!picking && !saving}
          maxLength={2000}
        />
      ) : null}
      <View style={styles.photos}>
        <Text style={[labelType, styles.ink]}>{copy.photoOptional}</Text>
        {photo ? (
          <LendingPhoto
            photo={{ uri: photo.uri }}
            caption={copy.photoCaption}
            locale={locale}
          />
        ) : null}
        {tool && photo ? (
          <Button
            label={
              suggesting
                ? draftCopy.suggesting
                : lastSuggested.title
                  ? draftCopy.suggestAgain
                  : draftCopy.suggestDetails
            }
            labelStyle={buttonType}
            onPress={suggest}
            busy={suggesting}
            disabled={busy}
            variant="secondary"
          />
        ) : null}
        {suggestionMessage ? (
          <Text style={[bodyType, styles.ink]} accessibilityLiveRegion="polite">
            {suggestionMessage}
          </Text>
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
              onPress={() => {
                setPhoto(null);
                setMediaId(null);
                setSuggestionMessage(null);
              }}
              disabled={busy}
              variant="text"
            />
          ) : null}
        </View>
      </View>
      {tool &&
      (suggestedMode === "help_only" ||
        (categoryLoad.state === "ready" &&
          isRiskyCategory(categoryLoad.items, category))) ? (
        <RequestNotice
          title={draftCopy.riskyTitle}
          detail={
            suggestedMode === "help_only"
              ? draftCopy.suggestedHelpDetail
              : draftCopy.riskyDetail
          }
          locale={locale}
        />
      ) : null}
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  ink: { color: colors.ink },
  submit: { gap: spacing["related-gap"] },
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
