import { Host, Picker } from "@expo/ui";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { StyleSheet, Text, View } from "react-native";
import { CommunityScreen } from "@/components/community-screen";
import { ListingKindFilter } from "@/components/listing-kind-filter";
import { Button, ErrorText, Field } from "@/components/ui";
import {
  api,
  ApiError,
  type ListingDetail,
  type ListingStatus,
  type ListingSummary,
} from "@/lib/api";
import {
  buildListingPatch,
  createLatestRequest,
  mergeListingPages,
  rebaseListingDraft,
  reconcileListingRows,
  type KindFilter,
} from "@/lib/listing-workflow";
import { myListingsCopy } from "@/lib/my-listings-copy";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, controls, spacing } from "@/theme/tokens.json";

type StatusFilter = "all" | ListingStatus;
type DetailError = "titleRequired" | "conflict" | "offline" | "error";

export default function MyListingsScreen() {
  const localizedType = useLocalizedType();
  const { locale } = useOnboardingText();
  const copy = myListingsCopy[locale];
  const { session, profile } = useSession();
  const account = session?.user.id;
  const ownerId = profile.status === "ready" ? profile.profile.id : null;
  const { listingId } = useLocalSearchParams<{ listingId?: string }>();
  const [kind, setKind] = useState<KindFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [rows, setRows] = useState<ListingSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<
    "loading" | "ready" | "error" | "reloadError"
  >("loading");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ListingDetail | null>(null);
  const [detailReadFailed, setDetailReadFailed] = useState(false);
  const [detailError, setDetailError] = useState<DetailError | null>(null);
  const [title, setTitle] = useState("");
  const [availability, setAvailability] = useState("");
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [confirm, setConfirm] = useState(false);
  const [requests] = useState(createLatestRequest);
  const [detailRequests] = useState(createLatestRequest);
  const contextKey = `${account}:${ownerId}:${kind}:${status}`;
  const contextRef = useRef(contextKey);
  useLayoutEffect(() => {
    contextRef.current = contextKey;
    return () => {
      requests.cancel();
      detailRequests.cancel();
      working.current = false;
    };
  }, [contextKey, requests, detailRequests]);
  const label = localizedType("field-label", locale);
  const body = localizedType("body", locale);
  const supporting = localizedType("supporting", locale);

  const load = useCallback(
    async (nextCursor?: string, afterWrite = false) => {
      if (!account || !ownerId || contextRef.current !== contextKey) return;
      const request = requests.start();
      if (!nextCursor) {
        setState("loading");
        setCursor(null);
      }
      try {
        const result = await api.listMyListings(
          {
            ...(kind !== "all" ? { kind } : {}),
            ...(status !== "all" ? { status } : {}),
            ...(nextCursor ? { cursor: nextCursor } : {}),
            limit: 30,
          },
          request.signal,
          account,
        );
        if (!request.isCurrent() || contextRef.current !== contextKey) return;
        const own = result.items.filter((row) => row.owner_user_id === ownerId);
        setRows((current) =>
          nextCursor ? mergeListingPages(current, own) : own,
        );
        setCursor(result.next_cursor);
        setState("ready");
      } catch {
        if (request.isCurrent() && contextRef.current === contextKey)
          setState(afterWrite ? "reloadError" : "error");
      }
    },
    [account, ownerId, kind, status, requests, contextKey],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows([]);
    setCursor(null);
    setDetailId(null);
    setDetail(null);
    setDetailReadFailed(false);
    setDetailError(null);
    setConfirm(false);
    setBusy(false);
    if (account && ownerId) void load();
    else setState("loading");
  }, [account, ownerId, load]);

  function changeFilters(nextKind: KindFilter, nextStatus: StatusFilter) {
    if (working.current || (nextKind === kind && nextStatus === status)) return;
    contextRef.current = `${account}:${ownerId}:${nextKind}:${nextStatus}`;
    requests.cancel();
    setKind(nextKind);
    setStatus(nextStatus);
  }

  function reconcileRow(value: ListingDetail) {
    setRows((current) => reconcileListingRows(current, value, kind, status));
  }

  function showDetail(
    value: ListingDetail,
    draft = { title: value.title, availability: value.availability_note ?? "" },
  ) {
    reconcileRow(value);
    setDetail(value);
    setTitle(draft.title);
    setAvailability(draft.availability);
  }

  async function readOwnedDetail(id: string, signal: AbortSignal) {
    try {
      const value = await api.getListing(id, signal, account);
      return ownerId && value.owner?.id === ownerId ? value : null;
    } catch {
      return null;
    }
  }

  async function open(id: string) {
    if (
      !account ||
      !ownerId ||
      working.current ||
      contextRef.current !== contextKey
    )
      return;
    const request = detailRequests.start();
    const stillCurrent = () =>
      request.isCurrent() && contextRef.current === contextKey;
    working.current = true;
    setDetailId(id);
    setDetail(null);
    setDetailReadFailed(false);
    setDetailError(null);
    setBusy(true);
    setConfirm(false);

    const value = await readOwnedDetail(id, request.signal);
    if (!stillCurrent()) return;
    if (value) showDetail(value);
    else setDetailReadFailed(true);
    working.current = false;
    setBusy(false);
  }

  async function change(
    action: "save" | "pause" | "resume" | "delete",
    rowId?: string,
  ) {
    const id = rowId ?? detail?.id;
    if (
      !id ||
      !account ||
      !ownerId ||
      working.current ||
      contextRef.current !== contextKey
    )
      return;
    const request = detailRequests.start();
    const stillCurrent = () =>
      request.isCurrent() && contextRef.current === contextKey;
    const options = { authUserId: account, signal: request.signal };
    working.current = true;
    setBusy(true);
    setDetailError(null);
    if (rowId && (rowId !== detailId || !detail)) {
      setDetailId(null);
      setDetail(null);
      setDetailReadFailed(false);
      setConfirm(false);
    }
    try {
      if (action === "save") {
        if (!detail) return;
        const patch = buildListingPatch(detail, title, availability);
        if (patch.title === "") {
          setDetailError("titleRequired");
          return;
        }
        if (!Object.keys(patch).length) return;
        const updated = await api.updateListing(id, patch, options);
        if (!stillCurrent()) return;
        showDetail(updated);
      } else if (action === "pause" || action === "resume") {
        const updateStatus =
          action === "pause" ? api.pauseListing : api.resumeListing;
        const updated = await updateStatus(id, options);
        if (!stillCurrent()) return;
        if (detail?.id === id) {
          showDetail(
            updated,
            rebaseListingDraft(detail, updated, { title, availability }),
          );
        } else {
          reconcileRow(updated);
        }
      } else if (action === "delete") {
        await api.deleteListing(id, options);
        if (!stillCurrent()) return;
        setRows((current) => current.filter((row) => row.id !== id));
        setDetailId(null);
        setDetail(null);
        setConfirm(false);
      }
      await load(undefined, true);
    } catch (error) {
      if (!stillCurrent()) return;
      setDetailId(id);
      if (error instanceof ApiError && error.status === 409) {
        setConfirm(false);
        setDetail(null);
        setDetailReadFailed(false);
        setDetailError("conflict");
        const latest = await readOwnedDetail(id, request.signal);
        if (!stillCurrent()) return;
        if (latest) showDetail(latest);
        else setDetailReadFailed(true);
        await load();
      } else {
        setDetailError(
          error instanceof ApiError && error.status === 0 ? "offline" : "error",
        );
      }
    } finally {
      if (stillCurrent()) {
        working.current = false;
        setBusy(false);
      }
    }
  }

  const listError =
    state === "error" || state === "reloadError" ? (
      <View>
        <ErrorText>
          {state === "reloadError" ? copy.reload : copy.failed}
        </ErrorText>
        <Button
          label={copy.retry}
          variant="text"
          disabled={busy}
          onPress={() => void load(undefined, state === "reloadError")}
        />
      </View>
    ) : null;
  const detailPanel = detailId ? (
    <View style={styles.detail}>
      {detailError ? <ErrorText>{copy[detailError]}</ErrorText> : null}
      {detailReadFailed ? (
        <View>
          <ErrorText>{copy.detailFailed}</ErrorText>
          <Button
            label={copy.retry}
            variant="text"
            disabled={busy}
            onPress={() => void open(detailId)}
          />
        </View>
      ) : null}
      {!detail && busy && !detailReadFailed ? (
        <Text style={body}>{copy.loading}</Text>
      ) : null}
      {detail ? (
        <>
          <Text style={label}>{copy[detail.status]}</Text>
          {detail.photos[0]?.display_url ? (
            <Image
              source={{ uri: detail.photos[0].display_url }}
              style={styles.largePhoto}
              contentFit="contain"
            />
          ) : null}
          {detail.status === "lent_out" ? (
            <>
              <Text style={body}>{detail.title}</Text>
              <Text style={body}>{detail.availability_note}</Text>
            </>
          ) : (
            <>
              <Field
                label={copy.name}
                value={title}
                onChangeText={setTitle}
                maxLength={120}
                editable={!busy}
              />
              <Field
                label={copy.availability}
                value={availability}
                onChangeText={setAvailability}
                maxLength={2000}
                editable={!busy}
              />
              <Button
                label={copy.save}
                disabled={busy}
                onPress={() => void change("save")}
              />
              <Button
                label={detail.status === "paused" ? copy.resume : copy.pause}
                variant="secondary"
                disabled={busy}
                onPress={() =>
                  void change(detail.status === "paused" ? "resume" : "pause")
                }
              />
              {confirm ? (
                <>
                  <Text style={body}>{copy.confirm}</Text>
                  <Button
                    label={copy.delete}
                    disabled={busy}
                    onPress={() => void change("delete")}
                  />
                  <Button
                    label={copy.cancel}
                    variant="text"
                    onPress={() => setConfirm(false)}
                  />
                </>
              ) : (
                <Button
                  label={copy.delete}
                  variant="text"
                  disabled={busy}
                  onPress={() => setConfirm(true)}
                />
              )}
            </>
          )}
        </>
      ) : null}
      {listError}
      <Button
        label={copy.close}
        disabled={busy}
        variant="text"
        onPress={() => {
          if (working.current) return;
          setDetailId(null);
          setDetail(null);
          setDetailError(null);
          setDetailReadFailed(false);
          setConfirm(false);
        }}
      />
    </View>
  ) : null;

  return (
    <CommunityScreen title={copy.title} back keyboard>
      <ListingKindFilter
        value={kind}
        onChange={(next) => changeFilters(next, status)}
        disabled={busy}
      />
      <View style={styles.statusFilter}>
        <Text style={[label, styles.statusLabel]}>{copy.statusFilter}</Text>
        <Host matchContents seedColor={colors.action}>
          <Picker<StatusFilter>
            selectedValue={status}
            onValueChange={(next) => changeFilters(kind, next)}
            enabled={!busy}
            accessibilityLabel={copy.statusFilter}
          >
            <Picker.Item value="all" label={copy.all} />
            <Picker.Item value="active" label={copy.active} />
            <Picker.Item value="paused" label={copy.paused} />
            <Picker.Item value="lent_out" label={copy.lent_out} />
          </Picker>
        </Host>
      </View>
      {state === "loading" ? <Text style={body}>{copy.loading}</Text> : null}
      {!detailId ? listError : null}
      {detailId && !rows.some((row) => row.id === detailId)
        ? detailPanel
        : null}
      {state === "ready" && rows.length === 0 ? (
        <Text style={body}>{copy.empty}</Text>
      ) : null}
      {rows.map((row) => (
        <Fragment key={row.id}>
          <View style={styles.row}>
            {row.photo_url ? (
              <Image source={{ uri: row.photo_url }} style={styles.photo} />
            ) : (
              <View
                style={[styles.photo, styles.placeholder]}
                accessible={false}
              >
                <SymbolView
                  name={
                    row.kind === "skill"
                      ? {
                          ios: "hand.raised",
                          android: "volunteer_activism",
                          web: "volunteer_activism",
                        }
                      : { ios: "wrench", android: "build", web: "build" }
                  }
                  size={22}
                  tintColor={colors.action}
                />
              </View>
            )}
            <View style={styles.rowBody}>
              <Text style={label}>{row.title}</Text>
              <Text style={[supporting, styles.statusLabel]}>
                {copy[row.status]}
                {row.id === listingId ? ` · ${copy.published}` : ""}
              </Text>
            </View>
            <Button
              label={row.status === "lent_out" ? copy.view : copy.manage}
              labelStyle={label}
              variant="text"
              disabled={busy}
              onPress={() => void open(row.id)}
            />
          </View>
          {row.id === detailId ? detailPanel : null}
        </Fragment>
      ))}
      {state === "ready" && cursor ? (
        <Button
          label={copy.more}
          variant="secondary"
          disabled={busy}
          onPress={() => void load(cursor)}
        />
      ) : null}
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  statusFilter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    minHeight: controls["touch-target"],
    gap: spacing["related-gap"],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
  },
  statusLabel: { color: colors.secondary },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing["related-gap"],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
    paddingVertical: spacing["control-gap"],
  },
  rowBody: { flex: 1, minWidth: 0 },
  photo: { width: 56, height: 56, borderRadius: controls.radius },
  placeholder: {
    backgroundColor: colors.wash,
    justifyContent: "center",
    alignItems: "center",
  },
  detail: { gap: spacing["control-gap"] },
  largePhoto: { width: "100%", height: 200 },
});
