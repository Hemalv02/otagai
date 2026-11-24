import * as Location from "expo-location";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState, Text, View } from "react-native";

import {
  OnboardingLink,
  OnboardingScreen,
} from "@/components/onboarding-screen";
import { Button, Choice, ErrorText, Field } from "@/components/ui";
import { ApiError, api, type Circle, type CircleJoin } from "@/lib/api";
import { useMemberships } from "@/lib/memberships";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import { useSession } from "@/lib/session";
import { settingsCopy } from "@/lib/settings-copy";

type Method = "invite" | "nearby";
type Match = { circle: Circle; target: CircleJoin };
type Position = { latitude: number; longitude: number };
type ErrorKey =
  | "invalidInvite"
  | "locationDenied"
  | "locationUnavailable"
  | "circleLoadFailed"
  | "joinFailed";

export default function FindCircle() {
  const localizedType = useLocalizedType();
  const { signOut } = useSession();
  const { access, state, record, refresh, refreshing } = useMemberships();
  const { t, locale } = useOnboardingText();
  const [method, setMethod] = useState<Method>("invite");
  const [code, setCode] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [searchingAgain, setSearchingAgain] = useState(false);
  const [busy, setBusy] = useState<"search" | "join" | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<ErrorKey | null>(null);
  const working = useRef(false);

  const waiting = access === "pending";
  const rejected = access === "rejected" && !searchingAgain;
  const title = localizedType("screen-title", locale);
  const body = localizedType("body", locale);
  const supporting = localizedType("supporting", locale);
  const button = localizedType("button", locale);
  const invite = code.trim();

  useEffect(() => {
    if (!waiting) return;
    const refreshWhenActive = () => {
      if (AppState.currentState === "active") void refresh();
    };
    const timer = setInterval(refreshWhenActive, 12000);
    return () => clearInterval(timer);
  }, [refresh, waiting]);

  function switchMethod(next: Method) {
    if (next === method || working.current) return;
    setMethod(next);
    setMatches(null);
    setCursor(null);
    setPosition(null);
    setError(null);
  }

  async function search(more = false) {
    if (working.current) return;
    working.current = true;
    setBusy("search");
    setError(null);
    if (!more) {
      setMatches(null);
      setCursor(null);
    }
    try {
      if (method === "invite") {
        const { circle } = await api.previewCircleInvite(invite);
        setMatches([{ circle, target: { invite_code: invite } }]);
        return;
      }
      let current = position;
      if (!more || !current) {
        try {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (!permission.granted) {
            setError("locationDenied");
            return;
          }
          current = (
            await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            })
          ).coords;
          setPosition(current);
        } catch {
          setError("locationUnavailable");
          return;
        }
      }
      const page = await api.findNearbyCircles(
        current.latitude,
        current.longitude,
        more ? (cursor ?? undefined) : undefined,
      );
      const additions = page.items.map((circle) => ({
        circle,
        target: { circle_id: circle.id },
      }));
      setMatches((previous) =>
        more ? [...(previous ?? []), ...additions] : additions,
      );
      setCursor(page.next_cursor);
    } catch (failure) {
      setError(
        method === "invite" &&
          failure instanceof ApiError &&
          [404, 422].includes(failure.status)
          ? "invalidInvite"
          : "circleLoadFailed",
      );
    } finally {
      working.current = false;
      setBusy(null);
    }
  }

  async function join({ circle, target }: Match) {
    if (working.current) return;
    working.current = true;
    setBusy("join");
    setJoiningId(circle.id);
    setError(null);
    try {
      const membership = await api.joinCircle(target);
      setSearchingAgain(false);
      record(circle, membership);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        await refresh();
        setSearchingAgain(false);
      } else if (
        "invite_code" in target &&
        failure instanceof ApiError &&
        failure.status === 404
      ) {
        setMatches(null);
        setError("invalidInvite");
      } else {
        setError("joinFailed");
      }
    } finally {
      working.current = false;
      setBusy(null);
      setJoiningId(null);
    }
  }

  function circleName(circle: Circle | null) {
    const translation = circle?.name_translations[locale];
    return typeof translation === "string" && translation.trim()
      ? translation
      : (circle?.name ?? t("circleNameFallback"));
  }

  const statuses =
    state.status === "ready"
      ? state.items.filter(({ status }) =>
          waiting
            ? status === "pending"
            : status === "rejected" || status === "removed",
        )
      : [];

  return (
    <OnboardingScreen
      keyboard={!waiting && !rejected}
      action={
        <OnboardingLink
          label={t("signOut")}
          onPress={signOut}
          disabled={busy !== null}
        />
      }
      footer={
        waiting ? (
          <Button
            label={t("checkStatus")}
            labelStyle={button}
            busy={refreshing}
            onPress={refresh}
          />
        ) : rejected ? (
          <Button
            label={t("findAnother")}
            labelStyle={button}
            onPress={() => {
              setMatches(null);
              setError(null);
              setSearchingAgain(true);
            }}
          />
        ) : null
      }
    >
      <View className="gap-related-gap">
        <Text accessibilityRole="header" className="text-ink" style={title}>
          {t(
            waiting
              ? "pendingTitle"
              : rejected
                ? "rejectedTitle"
                : "findCircle",
          )}
        </Text>
        <Text className="text-secondary" style={body}>
          {t(
            waiting
              ? "pendingDescription"
              : rejected
                ? "rejectedDescription"
                : "circleIntro",
          )}
        </Text>
      </View>
      {waiting || rejected ? (
        <>
          {statuses.map(({ circle, circle_id }) => (
            <View
              key={circle_id}
              className="gap-related-gap rounded-control bg-paper p-card-inset"
            >
              <Text
                className="text-ink"
                style={localizedType("card-title", locale)}
              >
                {circleName(circle)}
              </Text>
              {waiting ? (
                <Text className="text-action" style={supporting}>
                  {t("pendingLabel")}
                </Text>
              ) : null}
            </View>
          ))}
          {state.status === "ready" && state.refreshFailed ? (
            <ErrorText>{t("circleLoadFailed")}</ErrorText>
          ) : null}
        </>
      ) : (
        <>
          <Choice
            options={[
              { value: "invite", label: t("byInvite") },
              { value: "nearby", label: t("nearby") },
            ]}
            value={method}
            onChange={switchMethod}
            labelStyle={() => button}
            disabled={busy !== null}
          />
          <View className="gap-control-gap rounded-control bg-paper p-card-inset">
            {method === "invite" ? (
              <Field
                label={t("byInvite")}
                value={code}
                onChangeText={(value) => {
                  setCode(value);
                  setMatches(null);
                  setError(null);
                }}
                maxLength={32}
                editable={busy === null}
                autoCapitalize="none"
                autoCorrect={false}
                style={body}
                labelStyle={localizedType("field-label", locale)}
              />
            ) : null}
            <Text className="text-secondary" style={supporting}>
              {t(method === "invite" ? "inviteHint" : "locationHint")}
            </Text>
            <Button
              label={t(method === "invite" ? "lookUpInvite" : "useLocation")}
              labelStyle={button}
              busy={busy === "search"}
              disabled={
                busy === "join" || (method === "invite" && invite.length < 8)
              }
              onPress={() => search()}
            />
          </View>
          {error ? <ErrorText>{t(error)}</ErrorText> : null}
          {method === "nearby" && matches?.length === 0 ? (
            <Text className="text-secondary" style={body}>
              {t("noNearby")}
            </Text>
          ) : null}
          {matches?.map((match) => (
            <View
              key={match.circle.id}
              className="gap-control-gap rounded-control border border-rule p-card-inset"
            >
              <Text
                className="text-ink"
                style={localizedType("card-title", locale)}
              >
                {circleName(match.circle)}
              </Text>
              <Text className="text-secondary" style={supporting}>
                {t(
                  match.circle.region === "jp"
                    ? "japanCountry"
                    : "bangladeshCountry",
                )}
              </Text>
              <Button
                label={t("joinCircle")}
                labelStyle={button}
                busy={joiningId === match.circle.id}
                disabled={busy !== null}
                onPress={() => join(match)}
              />
            </View>
          ))}
          {cursor ? (
            <OnboardingLink
              label={t("showMoreCircles")}
              disabled={busy !== null}
              onPress={() => search(true)}
            />
          ) : null}
        </>
      )}
      <OnboardingLink
        label={settingsCopy[locale].title}
        disabled={busy !== null}
        onPress={() => router.push("/settings")}
      />
    </OnboardingScreen>
  );
}
