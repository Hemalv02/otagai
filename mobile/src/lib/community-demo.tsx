import {
  createContext,
  type PropsWithChildren,
  useContext,
  useMemo,
  useReducer,
  useState,
} from "react";

import {
  type Actor,
  applyCommunityAction,
  type DemoRequest,
  type RequestDraft,
  requestSeed,
} from "@/lib/community-demo-state";
import { useOnboardingText } from "@/lib/onboarding-i18n";

export type {
  Actor,
  DemoMessage,
  DemoRequest,
  RequestDraft,
} from "@/lib/community-demo-state";

type CommunityDemo = {
  actor: Actor;
  people: Record<Actor, { name: string }>;
  requests: DemoRequest[];
  askDraft: Pick<RequestDraft, "title" | "description" | "listingId"> | null;
  setAskDraft: (
    draft: Pick<RequestDraft, "title" | "description" | "listingId"> | null,
  ) => void;
  switchActor: () => void;
  createRequest: (draft: RequestDraft) => string;
  offerHelp: (id: string) => void;
  acceptOffer: (id: string) => void;
  sendMessage: (id: string, text: string) => void;
  confirmHelp: (id: string) => void;
  sendThanks: (id: string, note: string) => void;
};

let demoId = 0;
const CommunityDemoContext = createContext<CommunityDemo | null>(null);

export function CommunityDemoProvider({
  children,
  memberName,
}: PropsWithChildren<{ memberName: string }>) {
  const [actor, setActor] = useState<Actor>("member");
  const [askDraft, setAskDraft] = useState<CommunityDemo["askDraft"]>(null);
  const [records, dispatch] = useReducer(applyCommunityAction, [requestSeed]);
  const { locale } = useOnboardingText();

  const value = useMemo<CommunityDemo>(() => {
    const neighbourNames = {
      en: "Tanaka-san",
      ja: "田中さん",
      bn: "তানাকা-সান",
    };
    const requests = records.map((request) => {
      if (request.id !== requestSeed.id || locale === "en") return request;
      const copy =
        locale === "ja"
          ? {
              title: "お米を階段の上まで運ぶ",
              description:
                "道から玄関まで、5キロのお米を運んでいただけませんか。10分ほどで終わります。",
              timing: "午後5時",
            }
          : {
              title: "সিঁড়ি দিয়ে চালের বস্তা তুলে দিন",
              description:
                "রাস্তা থেকে দরজা পর্যন্ত ৫ কেজি চাল নিয়ে যেতে একটু সাহায্য করবেন? প্রায় ১০ মিনিট লাগবে।",
              timing: "বিকেল ৫টা",
            };
      return { ...request, ...copy };
    });
    return {
      actor,
      people: {
        member: { name: memberName },
        neighbour: { name: neighbourNames[locale] },
      },
      requests,
      askDraft,
      setAskDraft,
      switchActor: () =>
        setActor((current) => (current === "member" ? "neighbour" : "member")),
      createRequest(draft) {
        const id = `request-${++demoId}`;
        dispatch({
          type: "create",
          request: {
            ...draft,
            id,
            createdBy: actor,
            status: "open",
            messages: [],
            confirmedBy: [],
          },
        });
        return id;
      },
      offerHelp: (id) => dispatch({ type: "offer", id, actor }),
      acceptOffer: (id) => dispatch({ type: "accept", id, actor }),
      sendMessage: (id, text) =>
        dispatch({
          type: "message",
          id,
          message: { id: `message-${++demoId}`, by: actor, text },
        }),
      confirmHelp: (id) => dispatch({ type: "confirm", id, actor }),
      sendThanks: (id, note) => dispatch({ type: "thanks", id, actor, note }),
    };
  }, [actor, askDraft, locale, memberName, records]);

  return (
    <CommunityDemoContext.Provider value={value}>
      {children}
    </CommunityDemoContext.Provider>
  );
}

export function useCommunityDemo() {
  const value = useContext(CommunityDemoContext);
  if (!value) throw new Error("CommunityDemoProvider is missing.");
  return value;
}
