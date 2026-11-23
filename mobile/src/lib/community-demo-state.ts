import type { Language } from "./api";

export type Actor = "member" | "neighbour";
export type RequestDraft = {
  title: string;
  description: string;
  timing: string;
  audience: "circle" | "direct" | "ripple";
  listingId?: string;
};

export type DemoMessage = {
  id: string;
  by: Actor;
  text: string;
  language?: Language;
  translation?: Partial<Record<Language, string>>;
};

export type DemoRequest = RequestDraft & {
  id: string;
  createdBy: Actor;
  status: "open" | "matched" | "completed";
  offer?: { by: Actor };
  messages: DemoMessage[];
  confirmedBy: Actor[];
  thankYou?: string;
};

export const requestSeed: DemoRequest = {
  id: "carry-rice",
  title: "Carry rice up the stairs",
  description:
    "Could someone carry a 5 kg bag of rice from the lane to my front door? It should take about ten minutes.",
  timing: "5:00 PM",
  audience: "circle",
  createdBy: "neighbour",
  status: "open",
  messages: [],
  confirmedBy: [],
};

type CommunityAction =
  | { type: "create"; request: DemoRequest }
  | { type: "offer" | "accept" | "confirm"; id: string; actor: Actor }
  | { type: "message"; id: string; message: DemoMessage }
  | { type: "thanks"; id: string; actor: Actor; note: string };

function isParticipant(request: DemoRequest, actor: Actor) {
  return actor === request.createdBy || actor === request.offer?.by;
}

function updateRequest(
  request: DemoRequest,
  action: Exclude<CommunityAction, { type: "create" }>,
): DemoRequest {
  switch (action.type) {
    case "offer":
      return request.status === "open" &&
        action.actor !== request.createdBy &&
        !request.offer
        ? { ...request, offer: { by: action.actor } }
        : request;
    case "accept":
      if (
        request.status !== "open" ||
        action.actor !== request.createdBy ||
        !request.offer
      ) {
        return request;
      }
      return {
        ...request,
        status: "matched",
        messages:
          request.id === requestSeed.id
            ? [
                {
                  id: "rice-meeting",
                  by: "neighbour",
                  text: "ありがとうございます。坂の下の階段でお会いできますか？",
                  language: "ja",
                  translation: {
                    en: "Thank you. Could we meet at the steps at the bottom of the hill?",
                    bn: "ধন্যবাদ। পাহাড়ের নিচের সিঁড়ির কাছে দেখা করতে পারি?",
                  },
                },
              ]
            : request.messages,
      };
    case "message": {
      const text = action.message.text.trim();
      return request.status === "matched" &&
        isParticipant(request, action.message.by) &&
        text
        ? {
            ...request,
            messages: [...request.messages, { ...action.message, text }],
          }
        : request;
    }
    case "confirm": {
      if (
        request.status !== "matched" ||
        !isParticipant(request, action.actor) ||
        request.confirmedBy.includes(action.actor)
      ) {
        return request;
      }
      const confirmedBy = [...request.confirmedBy, action.actor];
      return {
        ...request,
        confirmedBy,
        status: confirmedBy.length === 2 ? "completed" : "matched",
      };
    }
    case "thanks": {
      const note = action.note.trim();
      return request.status === "completed" &&
        action.actor === request.createdBy &&
        !request.thankYou &&
        note
        ? { ...request, thankYou: note }
        : request;
    }
  }
}

export function applyCommunityAction(
  requests: DemoRequest[],
  action: CommunityAction,
) {
  if (action.type === "create") return [action.request, ...requests];
  const index = requests.findIndex((request) => request.id === action.id);
  if (index === -1) return requests;
  const request = updateRequest(requests[index], action);
  if (request === requests[index]) return requests;
  const next = [...requests];
  next[index] = request;
  return next;
}
