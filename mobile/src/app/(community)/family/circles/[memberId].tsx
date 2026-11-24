import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { AccountSkeleton, FamilyNotice } from "@/components/family-ui";
import { Button, ErrorText, Field } from "@/components/ui";
import { ApiError, api, type Circle, type Language } from "@/lib/api";
import { circleCopy } from "@/lib/circle-copy";
import { inviteCodeFromQr } from "@/lib/circle-invite";
import { familyApi, type ManagedMemberships } from "@/lib/family-api";
import { isUnconfirmedWrite, normalizeMemberId } from "@/lib/family-consent";
import { managedCircleCopy } from "@/lib/managed-circle-copy";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { colors, controls, spacing } from "@/theme/tokens.json";

type AccessError = "unavailable" | "session";
type InviteError =
  | "invalidInvite"
  | "duplicate"
  | "previewFailed"
  | "submitFailed"
  | "unconfirmed";
type Load =
  | { status: "loading" }
  | { status: "error"; error: AccessError | "loadFailed" }
  | { status: "ready"; page: ManagedMemberships; refreshFailed: boolean };
type Busy = "refresh" | "more" | "preview" | "join";
type Preview = { circle: Circle; inviteCode: string };

function accessError(status: number): AccessError | null {
  if (status === 401) return "session";
  if (status === 403) return "unavailable";
  return null;
}

function circleTitle(circle: Circle, locale: Language) {
  const translated = circle.name_translations[locale];
  return typeof translated === "string" && translated.trim()
    ? translated
    : circle.name;
}

export default function ManagedCirclesScreen() {
  const { memberId: param } = useLocalSearchParams<{ memberId: string }>();
  const memberId = typeof param === "string" ? normalizeMemberId(param) : null;
  const { session } = useSession();
  const { locale } = useOnboardingText();
  const copy = managedCircleCopy[locale];
  const authUserId = session?.user.id;

  if (!authUserId || !memberId) {
    return (
      <CommunityScreen back backHref="/family" title={copy.title}>
        <FamilyNotice
          title={authUserId ? copy.unavailable : copy.session}
          locale={locale}
        />
      </CommunityScreen>
    );
  }
  return (
    <ManagedMembershipsScreen
      key={`${authUserId}:${memberId}`}
      authUserId={authUserId}
      memberId={memberId}
      locale={locale}
    />
  );
}

function ManagedMembershipsScreen({
  authUserId,
  memberId,
  locale,
}: {
  authUserId: string;
  memberId: string;
  locale: Language;
}) {
  const copy = managedCircleCopy[locale];
  const localizedType = useLocalizedType();
  const label = localizedType("field-label", locale);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<InviteError | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const working = useRef(false);

  const loadPage = useCallback(
    async (cursor?: string) => {
      try {
        const page = await familyApi.managedMemberships(
          memberId,
          authUserId,
          cursor,
        );
        setLoad((previous) => {
          if (!cursor || previous.status !== "ready") {
            return { status: "ready", page, refreshFailed: false };
          }
          const byCircle = new Map(
            [...previous.page.items, ...page.items].map((item) => [
              item.circle_id,
              item,
            ]),
          );
          return {
            status: "ready",
            page: { ...page, items: [...byCircle.values()] },
            refreshFailed: false,
          };
        });
      } catch (cause) {
        const status = cause instanceof ApiError ? cause.status : 0;
        const denied =
          accessError(status) ?? (status === 404 ? "unavailable" : null);
        if (denied) {
          setPreview(null);
          setLoad({ status: "error", error: denied });
        } else {
          setLoad((previous) =>
            previous.status === "ready"
              ? { ...previous, refreshFailed: true }
              : { status: "error", error: "loadFailed" },
          );
        }
      }
    },
    [authUserId, memberId],
  );

  const refresh = useCallback(
    async (cursor?: string) => {
      if (working.current) return;
      working.current = true;
      setBusy(cursor ? "more" : "refresh");
      try {
        await loadPage(cursor);
      } finally {
        working.current = false;
        setBusy(null);
      }
    },
    [loadPage],
  );

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  function changeCode(value: string) {
    setCode(value);
    setPreview(null);
    setError(null);
  }

  async function previewInvite() {
    if (working.current || load.status !== "ready") return;
    const inviteCode = inviteCodeFromQr(code);
    setPreview(null);
    setError(null);
    if (!inviteCode) {
      setError("invalidInvite");
      return;
    }
    working.current = true;
    setBusy("preview");
    try {
      const { circle } = await api.previewCircleInvite(inviteCode, authUserId);
      setPreview({ circle, inviteCode });
    } catch (cause) {
      const status = cause instanceof ApiError ? cause.status : 0;
      const denied = accessError(status);
      if (denied) setLoad({ status: "error", error: denied });
      else {
        setError(
          status === 404 || status === 422 ? "invalidInvite" : "previewFailed",
        );
      }
    } finally {
      working.current = false;
      setBusy(null);
    }
  }

  async function join() {
    if (working.current || !preview || load.status !== "ready") return;
    working.current = true;
    setBusy("join");
    setError(null);
    try {
      const membership = await familyApi.joinManagedCircle(
        memberId,
        preview.inviteCode,
        { authUserId },
      );
      const item = {
        ...membership,
        circle: membership.circle ?? preview.circle,
      };
      setLoad({
        status: "ready",
        refreshFailed: false,
        page: {
          ...load.page,
          items: [
            item,
            ...load.page.items.filter((row) => row.circle_id !== item.circle_id),
          ],
        },
      });
      changeCode("");
      await loadPage();
    } catch (cause) {
      const status = cause instanceof ApiError ? cause.status : 0;
      const denied = accessError(status);
      if (denied) {
        setPreview(null);
        setLoad({ status: "error", error: denied });
      } else if (status === 404 || status === 422) {
        setPreview(null);
        setError("invalidInvite");
        if (status === 404) await loadPage();
      } else if (status === 409 || isUnconfirmedWrite(status)) {
        setPreview(null);
        setError(status === 409 ? "duplicate" : "unconfirmed");
        await loadPage();
      } else {
        setError("submitFailed");
      }
    } finally {
      working.current = false;
      setBusy(null);
    }
  }

  const page = load.status === "ready" ? load.page : null;
  const name = page?.member.display_name;

  return (
    <CommunityScreen
      back
      backHref="/family"
      keyboard
      title={name ? copy.titleFor(name) : copy.title}
      refreshControl={
        <RefreshControl
          refreshing={busy === "refresh"}
          onRefresh={() => void refresh()}
          tintColor={colors.action}
          colors={[colors.action]}
        />
      }
    >
      {load.status === "loading" ? <AccountSkeleton /> : null}
      {load.status === "error" ? (
        <FamilyNotice
          title={copy[load.error]}
          actionLabel={copy.check}
          onAction={() => void refresh()}
          tone="alert"
          locale={locale}
        />
      ) : null}
      {load.status === "ready" ? (
        <>
          <View style={styles.card}>
            <Field
              label={copy.invite}
              labelStyle={label}
              value={code}
              onChangeText={changeCode}
              editable={busy === null}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
            />
            {error ? <ErrorText>{copy[error]}</ErrorText> : null}
            {preview ? (
              <>
                <Text style={[localizedType("card-title", locale), styles.ink]}>
                  {circleTitle(preview.circle, locale)}
                </Text>
                <Text
                  style={[localizedType("supporting", locale), styles.secondary]}
                >
                  {copy.review(load.page.member.display_name)}
                </Text>
                <Button
                  label={copy.confirm}
                  busy={busy === "join"}
                  disabled={busy !== null}
                  onPress={() => void join()}
                />
              </>
            ) : (
              <Button
                label={copy.preview}
                busy={busy === "preview"}
                disabled={busy !== null || !code.trim()}
                onPress={() => void previewInvite()}
              />
            )}
          </View>
          <View style={styles.list} accessibilityLiveRegion="polite">
            <Text
              accessibilityRole="header"
              style={[localizedType("section-heading", locale), styles.ink]}
            >
              {copy.statusHeading}
            </Text>
            {load.refreshFailed ? <ErrorText>{copy.loadFailed}</ErrorText> : null}
            {load.page.items.length ? (
              load.page.items.map((item) => (
                <FamilyNotice
                  key={item.circle_id}
                  title={
                    item.circle
                      ? circleTitle(item.circle, locale)
                      : copy.unknownCircle
                  }
                  body={copy.statuses[item.status]}
                  locale={locale}
                />
              ))
            ) : (
              <FamilyNotice title={copy.empty} locale={locale} />
            )}
          </View>
          <Button
            label={copy.check}
            labelStyle={label}
            variant="outline"
            busy={busy === "refresh"}
            disabled={busy !== null}
            onPress={() => void refresh()}
          />
          {load.page.next_cursor ? (
            <Button
              label={circleCopy[locale].loadMore}
              labelStyle={label}
              variant="text"
              busy={busy === "more"}
              disabled={busy !== null}
              onPress={() => void refresh(load.page.next_cursor ?? undefined)}
            />
          ) : null}
        </>
      ) : null}
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing["control-gap"],
    padding: spacing["card-inset"],
    borderRadius: controls.radius,
    backgroundColor: colors.paper,
  },
  list: { gap: spacing["related-gap"] },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
});
