import { api, ApiError, type Conversation } from "@/lib/api";

export async function loadLoanConversation(id: string, profileId: string) {
  const exchange = await api.getExchange(id);
  if (
    exchange.mode !== "loan" ||
    ![exchange.requester_user_id, exchange.helper_user_id].includes(profileId)
  ) {
    throw new ApiError(404, "Loan unavailable.");
  }
  let cursor: string | null = null;
  let conversation: Conversation | null = null;
  do {
    const page = await api.listConversations(cursor);
    conversation =
      page.items.find(
        (item) =>
          item.request_id === exchange.request_id &&
          item.response_id === exchange.response_id &&
          item.participants.some(
            (participant) => participant.user_id === profileId,
          ) &&
          item.participants.some(
            (participant) =>
              participant.user_id ===
              (profileId === exchange.requester_user_id
                ? exchange.helper_user_id
                : exchange.requester_user_id),
          ),
      ) ?? null;
    cursor = page.next_cursor;
  } while (!conversation && cursor);
  const partnerId =
    profileId === exchange.requester_user_id
      ? exchange.helper_user_id
      : exchange.requester_user_id;
  let partnerName: string | null = null;
  try {
    partnerName = (await api.getPublicProfile(partnerId)).display_name;
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }
  return { conversation, partnerName };
}
