import { router, useLocalSearchParams } from "expo-router";

import { CommunityScreen } from "@/components/community-screen";
import { RequestNotice } from "@/components/request-notice";
import { Button } from "@/components/ui";
import { useCommunityDemo } from "@/lib/community-demo";
import { exchangeCopy } from "@/lib/exchange-copy";
import { localizedType, useOnboardingText } from "@/lib/onboarding-i18n";

export function useExchange() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const demo = useCommunityDemo();
  const { locale } = useOnboardingText();
  const request = demo.requests.find((entry) => entry.id === id);
  const helper = request?.offer?.by;
  const copy = exchangeCopy[locale];
  const exchange =
    request &&
    helper &&
    request.status !== "open" &&
    (demo.actor === request.createdBy || demo.actor === helper)
      ? {
          request,
          helper,
          partner:
            request.createdBy === demo.actor ? helper : request.createdBy,
        }
      : null;

  function viewRequest() {
    if (request) {
      router.dismissTo({
        pathname: "/requests/[id]",
        params: { id: request.id },
      });
    } else {
      router.dismissTo("/");
    }
  }

  return { ...demo, copy, locale, exchange, request, viewRequest };
}

export function ExchangeUnavailable({
  title,
  reason,
  context,
}: {
  title: string;
  reason?: string;
  context: ReturnType<typeof useExchange>;
}) {
  const { request, copy, locale, viewRequest } = context;
  const explanation =
    reason ??
    (!request
      ? copy.missing
      : request.status === "open"
        ? copy.notMatched
        : copy.privateExchange);

  return (
    <CommunityScreen title={title} back>
      <RequestNotice
        title={copy.unavailable}
        detail={explanation}
        locale={locale}
      />
      <Button
        label={request ? copy.viewRequest : copy.home}
        labelStyle={localizedType("button", locale)}
        onPress={viewRequest}
      />
    </CommunityScreen>
  );
}
