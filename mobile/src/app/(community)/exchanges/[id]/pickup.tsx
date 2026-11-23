import { Image } from "expo-image";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { ExchangeUnavailable, useExchange } from "@/components/exchange-ui";
import { RequestNotice } from "@/components/request-notice";
import { Button, Field } from "@/components/ui";
import { isPickupConfirmed, type PickupItem } from "@/lib/community-demo-state";
import {
  drillListingId,
  listingPhotoSource,
  listingText,
  type DemoListing,
  useDemoListings,
} from "@/lib/demo-listings";
import { localizedType } from "@/lib/onboarding-i18n";
import { pickupCopy } from "@/lib/pickup-copy";
import { colors, controls, spacing } from "@/theme/tokens.json";

const drillPhoto = require("../../../../../assets/images/community/pickup-drill.png");
const drillChecklist: PickupItem[] = [
  {
    id: "drill",
    label: {
      en: "Blue hammer drill",
      ja: "青い振動ドリル",
      bn: "নীল হ্যামার ড্রিল",
    },
    detail: { en: "One drill", ja: "ドリル1台", bn: "একটি ড্রিল" },
  },
  {
    id: "power",
    label: {
      en: "Battery and charger",
      ja: "バッテリーと充電器",
      bn: "ব্যাটারি ও চার্জার",
    },
    detail: { en: "One of each", ja: "各1個", bn: "একটি করে" },
  },
  {
    id: "bits",
    label: {
      en: "Masonry bits",
      ja: "コンクリート用ビット",
      bn: "ইট-কংক্রিটের বিট",
    },
    detail: { en: "Two bits", ja: "ビット2本", bn: "দুটি বিট" },
  },
];

type ExchangeContext = ReturnType<typeof useExchange>;
type Exchange = NonNullable<ExchangeContext["exchange"]>;
type Mode = "check" | "edit" | "report";

export default function PickupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) {
    return (
      <Redirect href={{ pathname: "/loans/[id]/pickup", params: { id } }} />
    );
  }
  return <DemoPickupScreen />;
}

function DemoPickupScreen() {
  const context = useExchange();
  const { exchange, locale, request } = context;
  const { listings, ready } = useDemoListings();
  const title = pickupCopy[locale].title;
  const listing = listings.find((item) => item.id === request?.listingId);
  if (exchange && request?.listingId && !listing && !ready) {
    return (
      <CommunityScreen title={title} back>
        <ActivityIndicator color={colors.action} />
      </CommunityScreen>
    );
  }
  if (!exchange || listing?.kind !== "tool") {
    return (
      <ExchangeUnavailable
        title={title}
        context={context}
        reason={exchange ? pickupCopy[locale].invalid : undefined}
      />
    );
  }
  return (
    <PickupChecklist
      key={`${exchange.request.id}:${context.actor}`}
      context={context}
      exchange={exchange}
      listing={listing}
    />
  );
}

function PickupChecklist({
  context,
  exchange,
  listing,
}: {
  context: ExchangeContext;
  exchange: Exchange;
  listing: DemoListing;
}) {
  const {
    actor,
    locale,
    people,
    savePickup,
    flagPickup,
    confirmPickup,
    viewRequest,
  } = context;
  const { request, partner } = exchange;
  const copy = pickupCopy[locale];
  const partnerName = people[partner].name;
  const sample = listing.id === drillListingId;
  const title = sample ? copy.checkDrill : copy.checkItems;
  const starterItems = useMemo(
    () =>
      sample
        ? drillChecklist
        : [
            {
              id: "tool",
              label: listing.title,
              detail: listing.description,
            },
          ],
    [listing.description, listing.title, sample],
  );
  const items = request.pickup?.items ?? starterItems;
  const confirmed = request.pickup?.confirmedBy.includes(actor) ?? false;
  const partnerConfirmed =
    request.pickup?.confirmedBy.includes(partner) ?? false;
  const pickedUp = isPickupConfirmed(request);
  const locked = pickedUp || request.status !== "matched";
  const issue = request.pickup?.issue;
  const photo = sample
    ? drillPhoto
    : listing.photo
      ? listingPhotoSource(listing.photo)
      : null;
  const [mode, setMode] = useState<Mode>("check");
  const [checks, setChecks] = useState<{
    items: PickupItem[];
    ids: string[];
  }>();
  const [draftItems, setDraftItems] = useState<PickupItem[]>([]);
  const [note, setNote] = useState("");
  const nextId = useRef(0);
  const checked = checks?.items === items ? checks.ids : [];
  const allChecked = items.every(({ id }) => checked.includes(id));

  const label = localizedType("field-label", locale);
  const supporting = localizedType("supporting", locale);
  const body = localizedType("body", locale);
  const button = localizedType("button", locale);

  function edit() {
    setDraftItems(items);
    setMode("edit");
  }

  function changeField(id: string, key: "label" | "detail", value: string) {
    setDraftItems((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, [key]: value } : item,
      ),
    );
  }

  function save() {
    savePickup(
      request.id,
      draftItems.map((item) => ({
        ...item,
        label: typeof item.label === "string" ? item.label.trim() : item.label,
        detail:
          typeof item.detail === "string" ? item.detail.trim() : item.detail,
      })),
    );
    setMode("check");
  }

  function report() {
    flagPickup(request.id, items, note);
    setChecks(undefined);
    setMode("check");
  }

  function toggle(id: string) {
    setChecks({
      items,
      ids: checked.includes(id)
        ? checked.filter((value) => value !== id)
        : [...checked, id],
    });
  }

  const modeAction =
    mode === "edit" ? (
      <Button
        label={copy.save}
        labelStyle={button}
        disabled={
          draftItems.length === 0 ||
          draftItems.some((item) => !listingText(item.label, locale).trim())
        }
        onPress={save}
      />
    ) : mode === "report" ? (
      <Button
        label={copy.saveNote}
        labelStyle={button}
        disabled={!note.trim()}
        onPress={report}
      />
    ) : locked || confirmed ? (
      <Button
        label={context.copy.viewRequest}
        labelStyle={button}
        onPress={viewRequest}
      />
    ) : issue ? (
      <Button label={copy.save} labelStyle={button} onPress={edit} />
    ) : (
      <Button
        label={copy.confirm}
        labelStyle={button}
        disabled={!allChecked}
        onPress={() => confirmPickup(request.id, items, checked)}
      />
    );

  return (
    <CommunityScreen
      title={title}
      subtitle={[copy.withNeighbour(partnerName), request.timing]
        .filter(Boolean)
        .join(" · ")}
      back
      keyboard={mode !== "check"}
      footer={modeAction}
    >
      {mode === "edit" ? (
        <>
          <Text style={[supporting, styles.secondary]}>{copy.editing}</Text>
          {draftItems.map((item, index) => (
            <View style={styles.itemEdit} key={item.id}>
              <Field
                label={copy.item(index + 1)}
                value={listingText(item.label, locale)}
                onChangeText={(value) => changeField(item.id, "label", value)}
                labelStyle={label}
                style={body}
                maxLength={90}
              />
              <Field
                label={copy.quantity}
                value={item.detail ? listingText(item.detail, locale) : ""}
                onChangeText={(value) => changeField(item.id, "detail", value)}
                labelStyle={label}
                style={body}
                maxLength={160}
              />
              {draftItems.length > 1 ? (
                <Button
                  label={copy.remove(index + 1)}
                  labelStyle={label}
                  variant="text"
                  onPress={() =>
                    setDraftItems((previous) =>
                      previous.filter(({ id }) => id !== item.id),
                    )
                  }
                />
              ) : null}
            </View>
          ))}
          <Button
            label={copy.add}
            labelStyle={label}
            variant="secondary"
            onPress={() => {
              const id = `part-${Date.now()}-${++nextId.current}`;
              setDraftItems((previous) => [...previous, { id, label: "" }]);
            }}
          />
          <Button
            label={copy.cancel}
            labelStyle={label}
            variant="text"
            onPress={() => setMode("check")}
          />
        </>
      ) : mode === "report" ? (
        <>
          <Field
            label={copy.report}
            labelStyle={label}
            style={[body, styles.multiline]}
            placeholder={copy.noteExample}
            value={note}
            onChangeText={setNote}
            maxLength={300}
            multiline
          />
          <Button
            label={copy.cancel}
            labelStyle={label}
            variant="text"
            onPress={() => setMode("check")}
          />
        </>
      ) : (
        <>
          {photo ? (
            <View style={styles.photoGroup}>
              <Image
                source={photo}
                style={styles.photo}
                contentFit="contain"
                accessible={false}
              />
              <Text style={[supporting, styles.secondary]}>
                {sample ? copy.samplePhoto : copy.listingPhoto}
              </Text>
            </View>
          ) : null}
          {issue ? (
            <RequestNotice
              title={copy.issue}
              detail={`${people[issue.by].name} · ${issue.note}`}
              locale={locale}
            />
          ) : pickedUp ? (
            <RequestNotice
              title={copy.done}
              detail={copy.doneDetail}
              locale={locale}
            />
          ) : (
            <RequestNotice
              title={copy.suggested}
              detail={copy.checkEach}
              locale={locale}
            />
          )}
          <View style={styles.checklist}>
            {items.map((item) => {
              const itemLabel = listingText(item.label, locale);
              const detail = item.detail
                ? listingText(item.detail, locale)
                : "";
              const selected = confirmed || checked.includes(item.id);
              const disabled = locked || confirmed || Boolean(issue);
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="checkbox"
                  accessibilityLabel={itemLabel}
                  accessibilityHint={detail || undefined}
                  accessibilityState={{ checked: selected, disabled }}
                  disabled={disabled}
                  style={styles.checkboxRow}
                  onPress={() => toggle(item.id)}
                >
                  <View
                    style={[styles.checkbox, selected && styles.checked]}
                    accessible={false}
                  >
                    {selected ? <Text style={styles.tick}>✓</Text> : null}
                  </View>
                  <View style={styles.itemCopy}>
                    <Text style={[label, styles.ink]}>{itemLabel}</Text>
                    {detail ? (
                      <Text style={[supporting, styles.secondary]}>
                        {detail}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          {!locked ? (
            <View>
              {!issue ? (
                <>
                  <Button
                    label={copy.edit}
                    labelStyle={label}
                    variant="text"
                    onPress={edit}
                  />
                  <Button
                    label={copy.difference}
                    labelStyle={label}
                    variant="text"
                    onPress={() => {
                      setNote("");
                      setMode("report");
                    }}
                  />
                </>
              ) : (
                <Button
                  label={copy.message(partnerName)}
                  labelStyle={label}
                  variant="text"
                  onPress={() =>
                    router.navigate({
                      pathname: "/exchanges/[id]/chat",
                      params: { id: request.id },
                    })
                  }
                />
              )}
            </View>
          ) : null}
          <View style={styles.statuses}>
            <View style={styles.status}>
              <Text style={[label, styles.ink]}>
                {partnerConfirmed
                  ? copy.confirmed(partnerName)
                  : copy.checking(partnerName)}
              </Text>
            </View>
            <View style={styles.status}>
              <Text style={[label, styles.ink]}>
                {confirmed ? copy.youConfirmed : copy.yourTurn}
              </Text>
            </View>
          </View>
        </>
      )}
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  photoGroup: { gap: 4 },
  photo: { width: "100%", aspectRatio: 1.57, borderRadius: controls.radius },
  checklist: { gap: 4 },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["control-gap"],
    minHeight: 65,
    paddingVertical: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderRadius: 4,
    borderColor: colors.control,
    alignItems: "center",
    justifyContent: "center",
  },
  checked: { backgroundColor: colors.action, borderColor: colors.action },
  tick: { color: colors["on-action"], fontSize: 15 },
  itemCopy: { flex: 1 },
  statuses: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing["control-gap"],
  },
  status: {
    flex: 1,
    padding: spacing["control-gap"],
    borderRadius: controls.radius,
    backgroundColor: colors.wash,
  },
  itemEdit: { gap: spacing["related-gap"] },
  multiline: { minHeight: 92 },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
});
