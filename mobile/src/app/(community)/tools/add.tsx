import { Host, Picker } from "@expo/ui";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { router, useNavigation } from "expo-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { LendingPhoto } from "@/components/lending-photo";
import { ListingPartsEditor } from "@/components/listing-parts-editor";
import { Button, Choice, ErrorText, Field } from "@/components/ui";
import { api, ApiError, type CategoryNode, type ListingKind } from "@/lib/api";
import { RequestNotice } from "@/components/request-notice";
import { draftCopy } from "@/lib/listing-draft-copy";
import {
  composeDescription,
  emptyDraftFields,
  visibleExtras,
  type ExtraKey,
  isRiskyCategory,
  listingLendMode,
  MAX_LISTING_DESCRIPTION,
  mergeSuggestion,
  parseParts,
  partsKeptOnPhotoChange,
  suggestionFields,
  unsureKeys,
  type DraftFields,
  type DraftKey,
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
  | "attachmentFailed"
  | "partsRequired"
  | "descriptionTooLong";
type SuggestNote =
  | "unclear"
  | "failed"
  | "rateLimited"
  | "photoNotReady"
  | "categoryUnmatched";
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
  const suggestCopy = draftCopy[locale];
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
  const [extras, setExtras] = useState({
    brand: "",
    model: "",
    condition: "",
    details: "",
  });
  const [lastSuggested, setLastSuggested] =
    useState<DraftFields>(emptyDraftFields);
  const [dismissed, setDismissed] = useState<ReadonlySet<DraftKey>>(new Set());
  const [unsure, setUnsure] = useState<ReadonlySet<DraftKey>>(new Set());
  const [suggestNote, setSuggestNote] = useState<SuggestNote | null>(null);
  const [suggested, setSuggested] = useState(false);
  const [photoHelpOnly, setPhotoHelpOnly] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
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
  const supportingType = localizedType("supporting", locale);
  const tool = kind === "tool";
  const shownExtras = visibleExtras(
    {
      ...emptyDraftFields,
      brand: extras.brand || lastSuggested.brand,
      model: extras.model || lastSuggested.model,
      condition: extras.condition || lastSuggested.condition,
      details: extras.details || lastSuggested.details,
    },
    dismissed,
  );
  const busy = picking || saving || suggesting;
  const risky = tool && isRiskyCategory(categoryItems(categoryLoad), category);

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
          setSuggestNote(null);
        }
      })
      .catch(() => {
        if (request.isCurrent() && navigation.isFocused())
          setError("photoFailed");
      });
  }, [account, formRequests, navigation]);

  function applyDraftFields(fields: DraftFields) {
    setName(fields.title);
    setCategory(fields.categoryId);
    setParts(fields.parts);
    setSafety(fields.safety);
    setExtras({
      brand: fields.brand,
      model: fields.model,
      condition: fields.condition,
      details: fields.details,
    });
  }

  function replacePhoto(next: ImagePicker.ImagePickerAsset | null) {
    if (photo?.uri === next?.uri) return;
    setPhoto(next);
    setMediaId(null);
    setSuggestNote(null);
    const preserved = mergeSuggestion(
      { title: name, categoryId: category, parts, safety, ...extras },
      lastSuggested,
      emptyDraftFields,
      dismissed,
    );
    preserved.parts = partsKeptOnPhotoChange(parts, lastSuggested.parts);
    applyDraftFields(preserved);
    setLastSuggested(emptyDraftFields);
    setUnsure(new Set());
    setSuggested(false);
    setPhotoHelpOnly(false);
  }

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
        replacePhoto(result.assets[0]);
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

  function readyMediaId(
    request: { signal: AbortSignal },
    options: { authUserId: string; signal: AbortSignal },
  ) {
    if (!photo) return Promise.resolve(null);
    return prepareListingMedia({
      mediaId,
      signal: request.signal,
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
      !navigation.isFocused() ||
      categoryLoad.state !== "ready" ||
      !categoryLoad.isCurrent()
    )
      return;
    const request = formRequests.start();
    const stillCurrent = () => request.isCurrent() && navigation.isFocused();
    const options = { authUserId: account, signal: request.signal };
    working.current = true;
    setSuggesting(true);
    setSuggestNote(null);
    setError(null);
    let preparingPhoto = true;
    try {
      const id = await readyMediaId(request, options);
      if (!stillCurrent() || !id) return;
      preparingPhoto = false;
      const result = await api.draftListing(
        {
          image_media_id: id,
          language: locale,
          ...(name.trim() ? { description: name.trim() } : {}),
        },
        options,
      );
      if (!stillCurrent()) return;
      if (!result.recognized) {
        setSuggestNote("unclear");
        return;
      }
      const items = categoryItems(categoryLoad);
      const ready = categoryLoad.state === "ready" && categoryLoad.isCurrent();
      const next = suggestionFields(result, ready ? items : []);
      const merged = mergeSuggestion(
        {
          title: name,
          categoryId: category,
          parts,
          safety,
          ...extras,
        },
        lastSuggested,
        next,
        dismissed,
      );
      applyDraftFields(merged);
      setPhotoHelpOnly(
        (previous) => previous || result.suggested_lend_mode === "help_only",
      );
      setLastSuggested(next);
      setUnsure(unsureKeys(result));
      setSuggested(true);
      if (result.category_id && !next.categoryId) {
        setSuggestNote("categoryUnmatched");
      }
    } catch (failure) {
      if (!stillCurrent()) return;
      if (preparingPhoto) setError("attachmentFailed");
      else if (failure instanceof ApiError && failure.status === 429)
        setSuggestNote("rateLimited");
      else if (failure instanceof ApiError && failure.status === 404)
        setSuggestNote("photoNotReady");
      else setSuggestNote("failed");
    } finally {
      if (request.isCurrent()) {
        working.current = false;
        setSuggesting(false);
      }
    }
  }

  function dismissExtra(key: ExtraKey) {
    setExtras((current) => ({ ...current, [key]: "" }));
    setDismissed((current) => new Set(current).add(key));
  }

  function unsureHint(key: DraftKey, value: string) {
    return unsure.has(key) && value !== "" && value === lastSuggested[key] ? (
      <Text style={[supportingType, styles.unsure]}>{suggestCopy.unsure}</Text>
    ) : null;
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

    const reviewedParts = tool ? parseParts(parts) : [];
    if (reviewedParts.some(({ quantity }) => quantity === null)) {
      setError("partsRequired");
      return;
    }
    const includedParts = reviewedParts.filter(
      (part): part is { label: string; quantity: number } =>
        part.quantity !== null,
    );

    const composedDescription = tool
      ? composeDescription(
          description,
          { ...emptyDraftFields, ...extras },
          suggestCopy,
          dismissed,
        )
      : description.trim();
    if (composedDescription.length > MAX_LISTING_DESCRIPTION) {
      setError("descriptionTooLong");
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
      const id = await readyMediaId(request, options);
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
            photoHelpOnly ? "help_only" : undefined,
          ),
          media_ids: id ? [id] : [],
          ...(composedDescription ? { description: composedDescription } : {}),
          ...(includedParts.length > 0 ? { parts: includedParts } : {}),
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
          {risky ? (
            <RequestNotice
              title={suggestCopy.riskyTitle}
              detail={suggestCopy.riskyDetail}
              locale={locale}
            />
          ) : null}
          {error ? (
            <ErrorText>
              {error === "attachmentFailed"
                ? messages.photoError
                : error === "partsRequired"
                  ? suggestCopy.partsRequired
                  : error === "descriptionTooLong"
                    ? suggestCopy.descriptionTooLong
                    : copy[error]}
            </ErrorText>
          ) : null}
          <Button
            label={copy.publish}
            labelStyle={buttonType}
            busy={saving}
            disabled={
              picking ||
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
      <View style={styles.photos}>
        <Text style={[labelType, styles.ink]}>{copy.photoOptional}</Text>
        {photo ? (
          <LendingPhoto
            photo={{ uri: photo.uri }}
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
          {tool && photo ? (
            <Button
              label={
                suggested
                  ? suggestCopy.suggestAgain
                  : suggestCopy.suggestDetails
              }
              labelStyle={labelType}
              onPress={suggest}
              busy={suggesting}
              disabled={busy || categoryLoad.state !== "ready"}
              variant="text"
            />
          ) : null}
          {photo ? (
            <Button
              label={copy.removePhoto}
              labelStyle={labelType}
              onPress={() => replacePhoto(null)}
              disabled={busy}
              variant="text"
            />
          ) : null}
        </View>
        {tool && photo ? (
          <Text style={[supportingType, styles.ink]}>
            {suggesting ? suggestCopy.suggesting : suggestCopy.suggestHint}
          </Text>
        ) : null}
        {suggestNote ? <ErrorText>{suggestCopy[suggestNote]}</ErrorText> : null}
      </View>
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
        maxLength={120}
      />
      {unsureHint("title", name)}
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
      {unsureHint("categoryId", category)}
      {tool && photoHelpOnly && !risky ? (
        <Text style={[supportingType, styles.ink]}>
          {suggestCopy.photoHelpOnly}
        </Text>
      ) : null}
      <Field
        label={copy.description}
        placeholder={
          tool ? copy.toolDescriptionExample : copy.skillDescriptionExample
        }
        value={description}
        onChangeText={setDescription}
        labelStyle={labelType}
        style={[bodyType, styles.multiline]}
        editable={!busy}
        multiline
        maxLength={2000}
      />
      {tool ? (
        <>
          <ListingPartsEditor
            value={parts}
            locale={locale}
            disabled={busy}
            onChange={(value) => {
              setParts(value);
              if (error === "partsRequired") setError(null);
            }}
          />
          {unsureHint("parts", parts)}
        </>
      ) : null}
      {tool && shownExtras.length > 0 ? (
        <View style={styles.extras}>
          <Text style={[labelType, styles.ink]}>
            {suggestCopy.suggestedDetails}
          </Text>
          {shownExtras.map((key) => (
            <View key={key} style={styles.extraRow}>
              <Field
                label={
                  key === "details" ? suggestCopy.moreDetails : suggestCopy[key]
                }
                value={extras[key]}
                onChangeText={(next) =>
                  setExtras((current) => ({ ...current, [key]: next }))
                }
                labelStyle={labelType}
                style={bodyType}
                editable={!busy}
                multiline={key === "details"}
                maxLength={key === "details" ? 1000 : 200}
              />
              {unsureHint(key, extras[key])}
              <Button
                label={suggestCopy.dismiss}
                labelStyle={labelType}
                variant="text"
                disabled={busy}
                onPress={() => dismissExtra(key)}
              />
            </View>
          ))}
        </View>
      ) : null}
      <Field
        label={copy.availabilityOptional}
        placeholder={tool ? copy.pickupExample : copy.skillAvailabilityExample}
        value={availability}
        onChangeText={setAvailability}
        labelStyle={labelType}
        style={bodyType}
        editable={!busy}
        maxLength={2000}
      />
      {tool ? (
        <Field
          label={copy.safetyOptional}
          value={safety}
          onChangeText={setSafety}
          labelStyle={labelType}
          style={bodyType}
          editable={!busy}
          maxLength={2000}
        />
      ) : null}
      {tool ? unsureHint("safety", safety) : null}
    </CommunityScreen>
  );
}

function categoryItems(load: CategoryLoad): CategoryNode[] {
  return load.state === "ready" ? load.items : [];
}

const styles = StyleSheet.create({
  ink: { color: colors.ink },
  unsure: { color: colors.ink },
  extras: { gap: spacing["related-gap"] },
  extraRow: { gap: spacing["related-gap"] },
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
