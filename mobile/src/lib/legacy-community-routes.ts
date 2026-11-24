import type { Exchange } from "@/lib/api";
import { isUuid } from "@/lib/uuid";

const requests = "/requests";

export function legacyReceiptHref(id: unknown) {
  return isUuid(id)
    ? { pathname: "/requests/[id]/ripple" as const, params: { id } }
    : requests;
}

const exchangeRoutes = {
  help: {
    chat: "/exchanges/[id]/messages",
    complete: "/exchanges/[id]",
    pickup: "/exchanges/[id]",
    "thank-you": "/exchanges/[id]",
  },
  loan: {
    chat: "/loans/[id]/messages",
    complete: "/loans/[id]",
    pickup: "/loans/[id]/pickup",
    "thank-you": "/loans/[id]/thank-you",
  },
} as const;

export type LegacyExchangeScreen = keyof (typeof exchangeRoutes)["help"];

type RouteExchange = Pick<
  Exchange,
  "mode" | "requester_user_id" | "helper_user_id"
>;

export async function resolveLegacyExchangeHref(
  screen: LegacyExchangeScreen,
  id: unknown,
  profileId: string | null,
  loadExchange: (id: string) => Promise<RouteExchange | null>,
) {
  if (!isUuid(id) || !profileId) return requests;

  const exchange = await loadExchange(id);
  if (!exchange) return requests;
  const {
    mode,
    requester_user_id: requester,
    helper_user_id: helper,
  } = exchange;
  if (
    (mode !== "help" && mode !== "loan") ||
    ![requester, helper].includes(profileId)
  ) {
    return requests;
  }
  return { pathname: exchangeRoutes[mode][screen], params: { id } };
}
