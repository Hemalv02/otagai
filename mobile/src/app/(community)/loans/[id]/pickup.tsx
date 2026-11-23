import { File } from "expo-file-system";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { ActivityStatus, ActivityText } from "@/components/activity-ui";
import { AssistantSheet } from "@/components/assistant-widgets";
import { CommunityScreen } from "@/components/community-screen";
import { Button, Choice, ErrorText, Field } from "@/components/ui";
import { ApiError, api, type Language } from "@/lib/api";
import {
  livePickupCopy,
  pickupApi,
  type Part,
  type PickupItem,
} from "@/lib/live-pickup";
import { useLiveResource } from "@/lib/live-resource";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, spacing } from "@/theme/tokens.json";

const photoOptions: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  quality: 0.8,
  preferredAssetRepresentationMode:
    ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
};

export default function PickupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile } = useSession();
  const { locale } = useOnboardingText();
  return (
    <LivePickup
      key={`${session?.user.id ?? ""}:${id}`}
      id={id}
      authId={session?.user.id ?? ""}
      profileId={profile.status === "ready" ? profile.profile.id : null}
      locale={locale}
    />
  );
}

function LivePickup({
  id,
  authId,
  profileId,
  locale,
}: {
  id: string;
  authId: string;
  profileId: string | null;
  locale: Language;
}) {
  const copy = livePickupCopy[locale];
  const client = useMemo(() => pickupApi(authId), [authId]);
  const load = useCallback(async () => {
    const exchange = await client.exchange(id);
    if (exchange.mode !== "loan") throw new ApiError(404, copy.failure);
    const [check, listing] = await Promise.all([
      client.find(id),
      exchange.listing_id
        ? api
            .getListing(exchange.listing_id, undefined, authId)
            .catch(() => null)
        : null,
    ]);
    const photos = await Promise.allSettled(
      (check?.media_ids ?? []).map(async (mediaId) => {
        const { urls } = await client.media(mediaId);
        const uri = urls.display ?? urls.thumb;
        if (!uri) throw new Error("Image unavailable");
        return { id: mediaId, uri };
      }),
    );
    return { exchange, check, photos, title: listing?.title };
  }, [authId, client, copy.failure, id]);
  const resource = useLiveResource(load);
  const { exchange, check, photos, title } = resource.data ?? {};
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Part[] | null>(null);
  const [editor, setEditor] = useState<PickupItem | "new" | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const locked = useRef(false);
  const lender = profileId === exchange?.helper_user_id;
  const borrower = profileId === exchange?.requester_user_id;
  const editable = (lender || borrower) && exchange?.status === "scheduled";
  const yourConfirmation = lender
    ? check?.lender_confirmed_at
    : check?.borrower_confirmed_at;
  const otherConfirmation = lender
    ? check?.borrower_confirmed_at
    : check?.lender_confirmed_at;
  const bothConfirmed = Boolean(yourConfirmation && otherConfirmation);
  const mutable = editable && !bothConfirmed;
  const ready = Boolean(
    check?.items.length &&
      check.items.every((item) => item.present && !item.disputed_by_user_id),
  );
  const disabled = Boolean(busy || resource.loading || resource.error);
  const labelStyle = localizedType("field-label", locale);
  const bodyStyle = localizedType("body", locale);
  const canAddPhoto = mutable && (check?.media_ids.length ?? 0) < 8;

  async function perform(
    key: string,
    action: () => Promise<void>,
    message = copy.failure,
    refresh = true,
  ) {
    if (locked.current || disabled) return;
    locked.current = true;
    setBusy(key);
    setError(null);
    try {
      await action();
      if (refresh) await resource.reload();
    } catch {
      setError(message);
      if (refresh) await resource.reload();
    } finally {
      locked.current = false;
      setBusy(null);
    }
  }

  function attach(mediaId: string) {
    return (check ? Promise.resolve(check) : client.start(id))
      .then((target) => client.attach(target.id, mediaId))
      .then(() => {
        setPendingPhoto(null);
        setSuggestions(null);
      });
  }

  function pick(camera: boolean) {
    void perform(
      "photo",
      async () => {
        if (camera && Platform.OS !== "web") {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            setError(copy.permission);
            return;
          }
        }
        const result = await (camera
          ? ImagePicker.launchCameraAsync(photoOptions)
          : ImagePicker.launchImageLibraryAsync(photoOptions));
        if (result.canceled) return;
        const asset = result.assets[0];
        if (!asset) return;
        const body = new FormData();
        body.append("purpose", "handover");
        body.append("file", asset.file ?? new File(asset.uri));
        const media = await client.upload(body);
        setPendingPhoto(media.id);
        await attach(media.id);
      },
      copy.changedPhoto,
    );
  }

  const confirmation =
    editable && check ? (
      <Button
        label={bothConfirmed ? copy.record : copy.confirm}
        labelStyle={labelStyle}
        busy={busy === "confirm"}
        disabled={
          disabled || !ready || (!bothConfirmed && Boolean(yourConfirmation))
        }
        onPress={() =>
          void perform("confirm", async () => {
            if (!bothConfirmed) {
              const latest = await client
                .confirm(check.id, check.revision)
                .catch((failure: unknown) => {
                  if (failure instanceof ApiError && failure.status === 409) {
                    setError(copy.reviewChanged);
                    return null;
                  }
                  throw failure;
                });
              if (!latest?.lender_confirmed_at || !latest.borrower_confirmed_at)
                return;
            }
            await client.record(id);
          })
        }
      />
    ) : undefined;

  return (
    <CommunityScreen
      design
      back
      showDemoPreview={false}
      eyebrow={title}
      title={copy.title}
      subtitle={copy.intro}
      footer={
        confirmation && (
          <View style={styles.confirmation}>
            {error === copy.reviewChanged ? (
              <ErrorText>{error}</ErrorText>
            ) : null}
            {confirmation}
          </View>
        )
      }
    >
      <ActivityStatus
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
      />
      {error && error !== copy.reviewChanged && !editor ? (
        <ErrorText>{error}</ErrorText>
      ) : null}
      {exchange?.handed_over_at ? (
        <View style={styles.panel}>
          <ActivityText strong>{copy.complete}</ActivityText>
        </View>
      ) : null}
      {photos?.some((photo) => photo.status === "rejected") ? (
        <ErrorText>{copy.photoError}</ErrorText>
      ) : null}
      {photos?.map((photo) =>
        photo.status === "fulfilled" ? (
          <Image
            key={photo.value.id}
            source={{ uri: photo.value.uri, cacheKey: photo.value.id }}
            cachePolicy="memory"
            accessibilityLabel={copy.photo}
            accessible
            style={styles.photo}
            contentFit="contain"
          />
        ) : null,
      )}
      {canAddPhoto ? (
        pendingPhoto ? (
          <Button
            label={copy.retryPhoto}
            variant="secondary"
            busy={busy === "photo"}
            disabled={disabled}
            onPress={() =>
              void perform(
                "photo",
                () => attach(pendingPhoto),
                copy.changedPhoto,
              )
            }
          />
        ) : (
          <View style={styles.row}>
            {Platform.OS !== "web" ? (
              <Button
                label={copy.camera}
                variant="secondary"
                labelStyle={labelStyle}
                style={styles.flex}
                disabled={disabled}
                onPress={() => pick(true)}
              />
            ) : null}
            <Button
              label={copy.library}
              variant="secondary"
              labelStyle={labelStyle}
              style={styles.flex}
              busy={busy === "photo"}
              disabled={disabled}
              onPress={() => pick(false)}
            />
          </View>
        )
      ) : null}
      {!check && editable ? (
        <Button
          label={copy.start}
          labelStyle={labelStyle}
          disabled={disabled}
          busy={busy === "start"}
          onPress={() =>
            void perform("start", async () => {
              await client.start(id);
            })
          }
        />
      ) : null}
      {check ? (
        <>
          {mutable && check.media_ids.length > 0 ? (
            <Button
              label={copy.suggest}
              variant="text"
              labelStyle={labelStyle}
              disabled={disabled}
              busy={busy === "suggest"}
              onPress={() =>
                void perform(
                  "suggest",
                  async () => {
                    const { items } = await client.suggest(check.id, locale);
                    const known = new Set(
                      check.items.map(({ label }) =>
                        label.trim().toLocaleLowerCase(),
                      ),
                    );
                    setSuggestions(
                      items.filter(({ label }) => {
                        const normalized = label.trim().toLocaleLowerCase();
                        if (known.has(normalized)) return false;
                        known.add(normalized);
                        return true;
                      }),
                    );
                  },
                  copy.aiFailure,
                  false,
                )
              }
            />
          ) : null}
          {mutable && suggestions ? (
            <View style={styles.panel}>
              <ActivityText strong>{copy.suggestions}</ActivityText>
              <ActivityText>
                {suggestions.length ? copy.review : copy.emptySuggestions}
              </ActivityText>
              {suggestions.map((part) => (
                <View key={part.label} style={styles.row}>
                  <View style={styles.flex}>
                    <ActivityText>
                      {part.label} × {part.quantity}
                    </ActivityText>
                  </View>
                  <Button
                    label={`${copy.use} · ${part.label}`}
                    variant="text"
                    labelStyle={labelStyle}
                    disabled={disabled}
                    onPress={() =>
                      void perform("add", async () => {
                        await client.add(check.id, part);
                        setSuggestions(
                          (items) =>
                            items?.filter(
                              (item) => item.label !== part.label,
                            ) ?? null,
                        );
                      })
                    }
                  />
                </View>
              ))}
            </View>
          ) : null}
          <ActivityText strong>{copy.items}</ActivityText>
          {check.items.length === 0 ? (
            <ActivityText>{copy.empty}</ActivityText>
          ) : null}
          <View style={styles.list}>
            {check.items.map((item) => (
              <View key={item.id} style={styles.item}>
                <View style={styles.row}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel={`${item.label}, ${item.present === true ? copy.present : item.present === false ? copy.missing : copy.unchecked}`}
                    accessibilityState={{
                      checked: item.present === true,
                      disabled: disabled || !mutable,
                    }}
                    disabled={disabled || !mutable}
                    style={[styles.row, styles.flex]}
                    onPress={() =>
                      void perform(item.id, async () => {
                        await client.edit(check.id, item.id, {
                          present: item.present === true ? null : true,
                        });
                      })
                    }
                  >
                    <View
                      style={[
                        styles.square,
                        item.present === true && styles.checked,
                      ]}
                    >
                      <ActivityText strong>
                        {item.present === true ? "✓" : ""}
                      </ActivityText>
                    </View>
                    <View style={styles.flex}>
                      <ActivityText strong>
                        {item.label} × {item.quantity}
                      </ActivityText>
                      <ActivityText>
                        {item.present === true
                          ? copy.present
                          : item.present === false
                            ? copy.missing
                            : copy.unchecked}
                      </ActivityText>
                    </View>
                  </Pressable>
                  {mutable ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${copy.edit} · ${item.label}`}
                      accessibilityState={{ disabled }}
                      disabled={disabled}
                      style={styles.edit}
                      onPress={() => {
                        setError(null);
                        setEditor(item);
                      }}
                    >
                      <Text style={[labelStyle, styles.green]}>
                        {copy.edit}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                {item.dispute_note ? (
                  <ErrorText>{item.dispute_note}</ErrorText>
                ) : null}
              </View>
            ))}
          </View>
          {mutable ? (
            <Button
              label={copy.add}
              variant="secondary"
              labelStyle={labelStyle}
              disabled={disabled}
              onPress={() => {
                setError(null);
                setEditor("new");
              }}
            />
          ) : null}
          <View style={styles.row}>
            <View style={[styles.pill, yourConfirmation && styles.checked]}>
              <ActivityText>
                {copy.you} · {yourConfirmation ? copy.confirmed : copy.waiting}
              </ActivityText>
            </View>
            <View style={[styles.pill, otherConfirmation && styles.checked]}>
              <ActivityText>
                {copy.neighbour} ·{" "}
                {otherConfirmation ? copy.confirmed : copy.waiting}
              </ActivityText>
            </View>
          </View>
          {editable ? (
            <Button
              label={copy.refresh}
              variant="text"
              labelStyle={labelStyle}
              disabled={disabled}
              onPress={() => {
                setError(null);
                void resource.reload();
              }}
            />
          ) : null}
        </>
      ) : null}
      {mutable && editor && check ? (
        <ItemEditor
          copy={copy}
          locale={locale}
          item={editor === "new" ? undefined : editor}
          profileId={profileId}
          labelStyle={labelStyle}
          bodyStyle={bodyStyle}
          busy={busy !== null}
          error={error}
          close={() => {
            if (!busy) {
              setEditor(null);
              setError(null);
            }
          }}
          save={(part, present, dispute_note) =>
            void perform("save", async () => {
              if (editor === "new") await client.add(check.id, part);
              else
                await client.edit(check.id, editor.id, {
                  ...(part.label !== editor.label ? { label: part.label } : {}),
                  ...(part.quantity !== editor.quantity
                    ? { quantity: part.quantity }
                    : {}),
                  ...(present !== editor.present ? { present } : {}),
                  ...(dispute_note !== undefined ? { dispute_note } : {}),
                });
              setEditor(null);
            })
          }
          remove={
            editor === "new"
              ? undefined
              : () =>
                  void perform("remove", async () => {
                    await client.remove(check.id, editor.id);
                    setEditor(null);
                  })
          }
        />
      ) : null}
    </CommunityScreen>
  );
}

function ItemEditor({
  copy,
  locale,
  item,
  profileId,
  labelStyle,
  bodyStyle,
  busy,
  error,
  close,
  save,
  remove,
}: {
  copy: (typeof livePickupCopy)[Language];
  locale: Language;
  item?: PickupItem;
  profileId: string | null;
  labelStyle: ReturnType<typeof localizedType>;
  bodyStyle: ReturnType<typeof localizedType>;
  busy: boolean;
  error: string | null;
  close: () => void;
  save: (part: Part, present: boolean | null, note?: string | null) => void;
  remove?: () => void;
}) {
  const [label, setLabel] = useState(item?.label ?? "");
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1));
  const [presence, setPresence] = useState<"present" | "missing" | "unchecked">(
    item?.present === true
      ? "present"
      : item?.present === false
        ? "missing"
        : "unchecked",
  );
  const [note, setNote] = useState(item?.dispute_note ?? "");
  const [removing, setRemoving] = useState(false);
  const otherNote =
    item?.disputed_by_user_id && item.disputed_by_user_id !== profileId;
  const count = Number(quantity);
  const valid =
    label.trim().length > 0 && /^\d{1,3}$/.test(quantity) && count > 0;

  return (
    <AssistantSheet
      title={removing ? copy.discard : item ? copy.edit : copy.add}
      locale={locale}
      close={close}
      footer={
        <Button
          label={removing ? copy.discard : copy.save}
          labelStyle={labelStyle}
          busy={busy}
          disabled={!removing && !valid}
          onPress={() =>
            removing
              ? remove?.()
              : save(
                  { label: label.trim(), quantity: count },
                  presence === "unchecked" ? null : presence === "present",
                  otherNote || note.trim() === (item?.dispute_note ?? "")
                    ? undefined
                    : note.trim() || null,
                )
          }
        />
      }
    >
      {removing ? (
        <ActivityText>{item?.label}</ActivityText>
      ) : (
        <>
          <Field
            label={copy.label}
            labelStyle={labelStyle}
            style={bodyStyle}
            maxLength={120}
            editable={!busy}
            value={label}
            onChangeText={setLabel}
          />
          <Field
            label={copy.amount}
            labelStyle={labelStyle}
            style={bodyStyle}
            keyboardType="number-pad"
            maxLength={3}
            editable={!busy}
            value={quantity}
            onChangeText={setQuantity}
          />
          {item ? (
            <>
              <Choice
                options={(["unchecked", "present", "missing"] as const).map(
                  (value) => ({ value, label: copy[value] }),
                )}
                disabled={busy}
                value={presence}
                onChange={setPresence}
                labelStyle={() => labelStyle}
              />
              {otherNote ? (
                <ActivityText>
                  {copy.note} · {item.dispute_note}
                </ActivityText>
              ) : (
                <Field
                  label={copy.dispute}
                  labelStyle={labelStyle}
                  style={bodyStyle}
                  maxLength={500}
                  editable={!busy}
                  value={note}
                  onChangeText={setNote}
                  multiline
                />
              )}
              <ActivityText>{copy.change}</ActivityText>
              {remove && !otherNote ? (
                <Button
                  variant="text"
                  label={copy.discard}
                  labelStyle={labelStyle}
                  disabled={busy}
                  onPress={() => setRemoving(true)}
                />
              ) : null}
            </>
          ) : null}
        </>
      )}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </AssistantSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing["related-gap"],
  },
  flex: { flex: 1, minWidth: 0 },
  confirmation: { gap: spacing["related-gap"] },
  edit: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  green: { color: colors.action },
  photo: {
    width: "100%",
    aspectRatio: 1.8,
    borderRadius: 12,
    backgroundColor: colors.paper,
  },
  panel: {
    padding: spacing["card-inset"],
    gap: spacing["related-gap"],
    backgroundColor: colors.paper,
    borderRadius: 12,
  },
  list: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.rule },
  item: {
    paddingVertical: spacing["related-gap"],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
    gap: spacing["related-gap"],
  },
  square: {
    width: 27,
    height: 27,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.control,
    borderRadius: 5,
  },
  checked: { backgroundColor: colors.wash, borderColor: colors.action },
  pill: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 18,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
});
