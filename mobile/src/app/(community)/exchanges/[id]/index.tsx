import {
  Redirect,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { CommunityScreen } from "@/components/community-screen";
import { HelpExchangeActions } from "@/components/help-exchange-actions";
import { Button, ErrorText } from "@/components/ui";
import { assistantError } from "@/lib/assistant-api";
import { assistantCopy } from "@/lib/assistant-copy";
import { exchangeMessageCopy } from "@/lib/exchange-message-copy";
import { liveRequestCopy } from "@/lib/live-request-copy";
import { useLocalizedType, useOnboardingText } from "@/lib/onboarding-i18n";
import {
  type ExchangeDetail,
  type RequestDetail,
  requestsApi,
} from "@/lib/requests-api";
import { useSession } from "@/lib/session";
import { colors, controls, spacing } from "@/theme/tokens.json";

type Summary = {
  exchange: ExchangeDetail;
  request: RequestDetail;
  name?: string;
};

export default function LiveExchangeScreen() {
  const localizedType = useLocalizedType();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useSession();
  const viewer = profile.status === "ready" ? profile.profile.id : null;
  const { locale, t } = useOnboardingText();
  const live = liveRequestCopy[locale];
  const words = assistantCopy[locale];
  const chat = exchangeMessageCopy[locale];
  const [summary, setSummary] = useState<Summary>();
  const [error, setError] = useState<string>();
  const version = useRef(0);

  const load = useCallback(
    async (keepSummary = false) => {
      const current = ++version.current;
      if (!keepSummary) setSummary(undefined);
      setError(undefined);
      try {
        const exchange = await requestsApi.exchange(id);
        const other =
          exchange.requester_user_id === viewer
            ? exchange.helper_user_id
            : exchange.requester_user_id;
        const [request, person] = await Promise.all([
          requestsApi.detail(exchange.request_id),
          requestsApi.person(other).catch(() => null),
        ]);
        if (current === version.current)
          setSummary({ exchange, request, name: person?.display_name });
      } catch (cause) {
        if (current === version.current)
          setError(assistantError(cause, locale));
      }
    },
    [id, locale, viewer],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        version.current += 1;
      };
    }, [load]),
  );

  const label = localizedType("field-label", locale);
  const body = localizedType("body", locale);
  const supporting = localizedType("supporting", locale);
  if (summary?.exchange.mode === "loan") {
    return <Redirect href={{ pathname: "/loans/[id]", params: { id } }} />;
  }
  return (
    <CommunityScreen
      back
      title={live.exchange}
      subtitle={
        summary
          ? `${live.exchangeStatus[summary.exchange.status]} · ${live.exchangeMode[summary.exchange.mode]}`
          : undefined
      }
    >
      {summary ? (
        <>
          <View style={styles.card}>
            {summary.name ? (
              <Text style={[label, styles.green]}>
                {live.withNeighbour(summary.name)}
              </Text>
            ) : null}
            <Text style={[body, styles.ink]}>
              {summary.request.polite_text}
            </Text>
          </View>
          <View style={styles.card}>
            <Text style={[label, styles.ink]}>{live.scheduled}</Text>
            <Text style={[supporting, styles.secondary]}>
              {summary.exchange.scheduled_at
                ? new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(summary.exchange.scheduled_at))
                : live.noTime}
            </Text>
            {summary.exchange.meet_place_note ? (
              <Text style={[supporting, styles.secondary]}>
                {summary.exchange.meet_place_note}
              </Text>
            ) : null}
          </View>
          <Button
            label={chat.messagePartner(summary.name ?? chat.neighbour)}
            labelStyle={label}
            onPress={() =>
              router.push({
                pathname: "/exchanges/[id]/messages",
                params: { id },
              })
            }
          />
          {viewer ? (
            <HelpExchangeActions
              exchange={summary.exchange}
              viewerId={viewer}
              onReload={() => load(true)}
            />
          ) : null}
          {error ? (
            <>
              <ErrorText>{error}</ErrorText>
              <Button
                variant="text"
                label={t("tryAgain")}
                onPress={() => void load(true)}
              />
            </>
          ) : null}
          <Button
            variant="text"
            label={words.viewRequest}
            labelStyle={label}
            onPress={() =>
              router.dismissTo({
                pathname: "/requests/[id]",
                params: { id: summary.request.id },
              })
            }
          />
        </>
      ) : error ? (
        <>
          <ErrorText>{error}</ErrorText>
          <Button
            variant="text"
            label={t("tryAgain")}
            onPress={() => void load()}
          />
        </>
      ) : (
        <ActivityIndicator
          accessibilityLabel={words.loading}
          color={colors.action}
        />
      )}
    </CommunityScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: controls.radius,
    padding: spacing["card-inset"],
    gap: 8,
  },
  ink: { color: colors.ink },
  secondary: { color: colors.secondary },
  green: { color: colors.action },
});
