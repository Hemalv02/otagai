import { File } from "expo-file-system";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useCallback, useRef, useState, type PropsWithChildren } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { ActivityStatus } from "@/components/activity-ui";
import { ActivityToggle } from "@/components/activity-toggle";
import { CommunityScreen } from "@/components/community-screen";
import { NeighbourConfirmation } from "@/components/neighbour-ui";
import { Button, Choice, Field } from "@/components/ui";
import { ApiError, api, type UserProfile } from "@/lib/api";
import { prepareListingMedia } from "@/lib/listing-workflow";
import { useLiveResource } from "@/lib/live-resource";
import { useMemberships } from "@/lib/memberships";
import { neighbourCopy } from "@/lib/neighbour-copy";
import {
  localizedType,
  useLocalizedType,
  useOnboardingText,
} from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { buildProfilePatch, textSizeOptions } from "@/lib/settings";
import { settingsCopy } from "@/lib/settings-copy";
import { colors, controls, spacing } from "@/theme/tokens.json";

type PhotoChange =
  | { kind: "remove" }
  | {
      kind: "picked";
      asset: ImagePicker.ImagePickerAsset;
      mediaId: string | null;
    };
type Action = "picker" | "profile" | "text" | "privacy" | "delete";
type Message = keyof typeof settingsCopy.en;

const failureCopy: Record<Action, Message> = {
  picker: "pickerFailed",
  profile: "profileFailed",
  text: "textSizeFailed",
  privacy: "privacyFailed",
  delete: "deleteFailed",
};

export default function SettingsScreen() {
  const { locale } = useOnboardingText();
  const { session, profile, reloadProfile } = useSession();
  const memberships = useMemberships();
  const inCommunity = memberships.access === "approved";
  const backHref = inCommunity
    ? "/"
    : memberships.state.status === "error"
      ? "/account-status"
      : "/find-circle";
  return (
    <CommunityScreen
      design
      back
      backHref={backHref}
      settingsMenu={false}
      keyboard
      title={settingsCopy[locale].title}
    >
      {session && profile.status === "ready" ? (
        <AccountSettings
          key={session.user.id}
          authUserId={session.user.id}
          profile={profile.profile}
          inCommunity={inCommunity}
        />
      ) : (
        <ActivityStatus
          loading={profile.status === "loading"}
          error={profile.status === "error"}
          retry={reloadProfile}
        />
      )}
    </CommunityScreen>
  );
}

function AccountSettings({
  authUserId,
  profile,
  inCommunity,
}: {
  authUserId: string;
  profile: UserProfile;
  inCommunity: boolean;
}) {
  const { locale } = useOnboardingText();
  const type = useLocalizedType();
  const { setProfile, deleteAccount } = useSession();
  const copy = settingsCopy[locale];
  const avatarId = profile.avatar_media_id;
  const avatar = useLiveResource(
    useCallback(async () => {
      if (!avatarId) return null;
      const media = await api.getMedia(avatarId, { authUserId });
      const url = media.urls.thumb ?? media.urls.display;
      if (!url) throw new Error("Profile photo unavailable.");
      return { id: media.id, url };
    }, [authUserId, avatarId]),
  );
  const [draft, setDraft] = useState({
    displayName: profile.display_name,
    intro: profile.intro ?? "",
    helpWith: profile.happy_to_help_with ?? "",
    hobbies: profile.hobbies ?? "",
  });
  const [savedProfile, setSavedProfile] = useState(profile);
  const [photoChange, setPhotoChange] = useState<PhotoChange | null>(null);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [textSizeDraft, setTextSizeDraft] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [working, setWorking] = useState<Action | null>(null);
  const [saved, setSaved] = useState<Action | null>(null);
  const [error, setError] = useState<{
    action: Action;
    message: Message;
  } | null>(null);
  const lock = useRef(false);
  const textSize = profile.text_scale_percent;
  const previewPercent = textSizeDraft ?? textSize;
  const profilePatch = buildProfilePatch(savedProfile, draft);
  const imageUrl =
    photoChange?.kind === "picked"
      ? photoChange.asset.uri
      : !photoChange && avatar.data?.id === avatarId
        ? avatar.data.url
        : null;
  const imageFailed = Boolean(imageUrl && failedAvatarUrl === imageUrl);
  const hasPhoto =
    photoChange?.kind === "picked" || (!photoChange && Boolean(avatarId));
  const disabled = working !== null;

  function resetFeedback() {
    setError(null);
    setSaved(null);
  }

  async function run(
    action: Action,
    operation: () => Promise<void>,
    mapError?: (error: unknown) => Message,
  ) {
    if (lock.current) return;
    lock.current = true;
    setWorking(action);
    resetFeedback();
    try {
      await operation();
      setSaved(action);
    } catch (failure) {
      setError({
        action,
        message:
          failure instanceof ApiError && failure.status === 401
            ? "sessionExpired"
            : (mapError?.(failure) ?? failureCopy[action]),
      });
    } finally {
      lock.current = false;
      setWorking(null);
    }
  }

  function pickPhoto() {
    return run("picker", async () => {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (!picked.canceled && picked.assets[0]) {
        setFailedAvatarUrl(null);
        setPhotoChange({
          kind: "picked",
          asset: picked.assets[0],
          mediaId: null,
        });
      }
    });
  }

  function saveProfile() {
    if (!draft.displayName.trim()) {
      setError({ action: "profile", message: "nameRequired" });
      return;
    }
    let uploading = photoChange?.kind === "picked";
    return run(
      "profile",
      async () => {
        if (photoChange?.kind === "picked") {
          const { asset, mediaId } = photoChange;
          profilePatch.avatar_media_id = await prepareListingMedia({
            mediaId,
            upload: () =>
              api.uploadAvatar(asset.file ?? new File(asset.uri), {
                authUserId,
              }),
            getMedia: (id) => api.getMedia(id, { authUserId }),
            onAccepted: (id) =>
              setPhotoChange({ kind: "picked", asset, mediaId: id }),
          });
        } else if (photoChange?.kind === "remove") {
          profilePatch.avatar_media_id = null;
        }
        uploading = false;
        const updated = await api.updateMyProfile(profilePatch, { authUserId });
        setProfile(updated);
        setSavedProfile(updated);
        setDraft({
          displayName: updated.display_name,
          intro: updated.intro ?? "",
          helpWith: updated.happy_to_help_with ?? "",
          hobbies: updated.hobbies ?? "",
        });
        setPhotoChange(null);
      },
      (failure) => {
        if (!uploading) return "profileFailed";
        if (failure instanceof ApiError) {
          if (failure.status === 413) return "photoTooLarge";
          if (failure.status === 415) return "photoUnsupported";
        }
        return "photoUploadFailed";
      },
    );
  }

  function changeField(field: keyof typeof draft, value: string) {
    setDraft((previous) => ({ ...previous, [field]: value }));
    resetFeedback();
  }

  const labelStyle = type("field-label", locale);
  const bodyStyle = type("body", locale);
  const buttonStyle = type("button", locale);
  const percentFormat = new Intl.NumberFormat(locale, { style: "percent" });
  const photoLabel = hasPhoto ? copy.changePhoto : copy.choosePhoto;
  const profileError =
    error?.action === "profile" || error?.action === "picker";

  return (
    <>
      <Section title={copy.profile}>
        <View style={styles.photoRow}>
          {imageUrl && !imageFailed ? (
            <Image
              source={imageUrl}
              accessibilityLabel={copy.photo}
              cachePolicy="none"
              style={styles.avatar}
              onError={() => setFailedAvatarUrl(imageUrl)}
            />
          ) : (
            <View
              accessible={false}
              aria-hidden
              style={[styles.avatar, styles.initial]}
            >
              {!photoChange && avatarId && avatar.loading ? (
                <ActivityIndicator color={colors.action} />
              ) : (
                <Text style={[type("card-title", locale), styles.ink]}>
                  {Array.from(draft.displayName.trim())[0]?.toLocaleUpperCase(
                    locale,
                  )}
                </Text>
              )}
            </View>
          )}
          <View style={styles.photoActions}>
            <Text style={[labelStyle, styles.ink]}>{copy.photo}</Text>
            <View style={styles.buttons}>
              <Button
                label={photoLabel}
                labelStyle={labelStyle}
                variant="text"
                busy={working === "picker"}
                disabled={disabled}
                onPress={pickPhoto}
              />
              {hasPhoto ? (
                <Button
                  label={copy.removePhoto}
                  labelStyle={labelStyle}
                  variant="text"
                  disabled={disabled}
                  onPress={() => {
                    resetFeedback();
                    setPhotoChange(avatarId ? { kind: "remove" } : null);
                  }}
                />
              ) : null}
            </View>
          </View>
        </View>
        {imageFailed || (!photoChange && avatarId && avatar.error) ? (
          <>
            <Feedback message="photoFailed" failed />
            {!photoChange ? (
              <Button
                label={copy.retry}
                labelStyle={labelStyle}
                variant="text"
                disabled={disabled}
                onPress={() => {
                  setFailedAvatarUrl(null);
                  void avatar.reload();
                }}
              />
            ) : null}
          </>
        ) : null}
        <Field
          label={copy.name}
          labelStyle={labelStyle}
          style={bodyStyle}
          value={draft.displayName}
          onChangeText={(value) => changeField("displayName", value)}
          autoComplete="name"
          maxLength={80}
          editable={!disabled}
        />
        <Field
          label={copy.intro}
          labelStyle={labelStyle}
          style={[bodyStyle, styles.multiline]}
          value={draft.intro}
          onChangeText={(value) => changeField("intro", value)}
          maxLength={1000}
          multiline
          editable={!disabled}
        />
        <Field
          label={copy.helpWith}
          labelStyle={labelStyle}
          style={[bodyStyle, styles.multiline]}
          value={draft.helpWith}
          onChangeText={(value) => changeField("helpWith", value)}
          maxLength={500}
          multiline
          editable={!disabled}
        />
        <Field
          label={copy.hobbies}
          labelStyle={labelStyle}
          style={[bodyStyle, styles.multiline]}
          value={draft.hobbies}
          onChangeText={(value) => changeField("hobbies", value)}
          maxLength={500}
          multiline
          editable={!disabled}
        />
        <Feedback
          failed={profileError}
          message={
            profileError
              ? error.message
              : saved === "profile"
                ? "profileSaved"
                : undefined
          }
        />
        <Button
          label={copy.saveProfile}
          labelStyle={buttonStyle}
          busy={working === "profile"}
          disabled={
            disabled || (!Object.keys(profilePatch).length && !photoChange)
          }
          onPress={saveProfile}
        />
      </Section>

      <Section title={copy.textSize}>
        <Choice
          options={textSizeOptions(textSize).map((percent) => ({
            label: percentFormat.format(percent / 100),
            value: String(percent),
          }))}
          value={String(previewPercent)}
          disabled={disabled}
          labelStyle={() => labelStyle}
          onChange={(value) => {
            resetFeedback();
            setTextSizeDraft(Number(value));
          }}
        />
        <View style={styles.preview}>
          <Text style={[labelStyle, styles.secondary]}>{copy.preview}</Text>
          <Text
            style={[localizedType("body", locale, previewPercent), styles.ink]}
          >
            {copy.previewText}
          </Text>
        </View>
        <Feedback
          failed={error?.action === "text"}
          message={
            error?.action === "text"
              ? error.message
              : saved === "text"
                ? "textSizeSaved"
                : undefined
          }
        />
        <Button
          label={copy.saveTextSize}
          labelStyle={buttonStyle}
          variant="outline"
          busy={working === "text"}
          disabled={disabled || previewPercent === textSize}
          onPress={() =>
            run("text", async () => {
              const updated = await api.updateMyProfile(
                { text_scale_percent: previewPercent },
                { authUserId },
              );
              setProfile(updated);
              setTextSizeDraft(null);
            })
          }
        />
      </Section>

      <Section title={copy.privacy}>
        <View style={styles.privacyRow}>
          <Text style={[labelStyle, styles.ink, styles.flex]}>
            {copy.visibility}
          </Text>
          <ActivityToggle
            label={copy.visibility}
            value={profile.profile_details_visible}
            disabled={disabled}
            onChange={(show) =>
              run("privacy", async () => {
                const updated = await api.updateMyProfile(
                  { profile_details_visible: show },
                  { authUserId },
                );
                setProfile(updated);
              })
            }
          />
        </View>
        <Text style={[type("supporting", locale), styles.secondary]}>
          {copy.visibilityDetail}
        </Text>
        <Feedback
          failed={error?.action === "privacy"}
          message={
            error?.action === "privacy"
              ? error.message
              : saved === "privacy"
                ? "privacySaved"
                : undefined
          }
        />
        {inCommunity ? (
          <Button
            label={neighbourCopy[locale].blockedPeople}
            labelStyle={labelStyle}
            variant="text"
            disabled={disabled}
            onPress={() => router.push("/blocked-people")}
          />
        ) : null}
      </Section>

      <Section title={copy.account}>
        <Button
          label={copy.deleteAccount}
          labelStyle={[labelStyle, styles.danger]}
          variant="text"
          disabled={disabled}
          onPress={() => {
            resetFeedback();
            setConfirmDelete(true);
          }}
        />
      </Section>
      {confirmDelete ? (
        <NeighbourConfirmation
          title={copy.deleteQuestion}
          confirmLabel={copy.confirmDelete}
          cancelLabel={copy.cancel}
          busy={working === "delete"}
          destructive
          onConfirm={() =>
            run("delete", deleteAccount, (failure) =>
              failure instanceof ApiError && failure.status === 409
                ? "unresolvedExchanges"
                : "deleteFailed",
            )
          }
          onCancel={() => setConfirmDelete(false)}
        >
          <Text style={[type("supporting", locale), styles.secondary]}>
            {copy.deleteDetail}
          </Text>
          <Text style={[labelStyle, styles.ink]}>{copy.deletePermanent}</Text>
          <Feedback
            failed
            message={error?.action === "delete" ? error.message : undefined}
          />
        </NeighbourConfirmation>
      ) : null}
    </>
  );
}

function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  const { locale } = useOnboardingText();
  const type = useLocalizedType();
  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        style={[type("section-heading", locale), styles.ink]}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function Feedback({
  message,
  failed,
}: {
  message?: Message;
  failed?: boolean;
}) {
  const { locale } = useOnboardingText();
  const type = useLocalizedType();
  if (!message) return null;
  return (
    <Text
      accessibilityLiveRegion={failed ? "assertive" : "polite"}
      accessibilityRole={failed ? "alert" : undefined}
      style={[
        type("supporting", locale),
        failed ? styles.danger : styles.saved,
      ]}
    >
      {settingsCopy[locale][message]}
    </Text>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing["control-gap"],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.rule,
    paddingTop: spacing["card-inset"],
    paddingBottom: spacing["related-gap"],
  },
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["card-inset"],
  },
  photoActions: { flex: 1 },
  buttons: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: spacing["card-inset"],
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.wash,
  },
  initial: { alignItems: "center", justifyContent: "center" },
  multiline: { minHeight: 72 },
  preview: {
    backgroundColor: colors.paper,
    borderRadius: controls.radius,
    padding: spacing["card-inset"],
    gap: spacing["related-gap"],
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["control-gap"],
  },
  flex: { flex: 1 },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
  danger: { color: colors.clay },
  saved: { color: colors.action },
});
