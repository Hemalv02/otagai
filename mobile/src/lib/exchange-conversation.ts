import type { api, Conversation } from "@/lib/api";

type ConversationApi = Pick<
  typeof api,
  "getExchange" | "listConversations" | "getPublicProfile"
>;

export async function loadExchangeConversation(
  client: ConversationApi,
  id: string,
  profileId: string,
  mode: "loan" | "help",
) {
  const exchange = await client.getExchange(id);
  const { requester_user_id: requester, helper_user_id: helper } = exchange;
  if (exchange.mode !== mode || ![requester, helper].includes(profileId)) {
    throw new Error("Exchange unavailable.");
  }

  const partnerId = profileId === requester ? helper : requester;
  let cursor: string | null = null;
  let conversation: Conversation | null = null;
  do {
    const page = await client.listConversations(cursor);
    conversation =
      page.items.find(
        (item) =>
          item.request_id === exchange.request_id &&
          item.response_id === exchange.response_id &&
          [profileId, partnerId].every((id) =>
            item.participants.some((participant) => participant.user_id === id),
          ),
      ) ?? null;
    cursor = page.next_cursor;
  } while (!conversation && cursor);

  let partnerName: string | null = null;
  try {
    partnerName = (await client.getPublicProfile(partnerId)).display_name;
  } catch (error) {
    if (
      !(error instanceof Error && "status" in error && error.status === 404)
    ) {
      throw error;
    }
  }
  return { conversation, partnerName };
}
