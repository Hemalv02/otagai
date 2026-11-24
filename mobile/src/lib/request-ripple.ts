import {
  actingForHeaders,
  request,
  type Language,
  type RippleStage,
} from "@/lib/api";
import type { RequestStatus } from "@/lib/requests-api";

export type RippleScope = Exclude<RippleStage, "direct">;
type DeliveryStatus =
  "sent" | "no_recipients" | "scheduled" | "pending" | "stopped";
export type DeliveryReceipt = {
  request_id: string;
  request_status: RequestStatus;
  current_stage: RippleStage;
  max_stage: RippleStage;
  next_widen_at: string | null;
  expires_at: string | null;
  stages: {
    stage: RippleStage;
    status: DeliveryStatus;
    recipient_count: number;
    delivered_at: string | null;
  }[];
};

export const rippleScopes: readonly RippleScope[] = [
  "family",
  "han",
  "association",
  "nearby",
];
export function requestNotificationId(type: unknown, id: unknown) {
  return (type === "request_nearby" || type === "request_direct") &&
    typeof id === "string" &&
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)
    ? id
    : null;
}

export const getDeliveryReceipt = (id: string, actingFor?: string) =>
  request<DeliveryReceipt>(`/requests/${id}/receipt`, {
    headers: actingForHeaders(actingFor),
  });

type RippleCopy = {
  delivery: string;
  limit: string;
  startsWithFamily: string;
  next: string;
  expires: string;
  refresh: string;
  stages: Record<RippleStage, string>;
  status: Record<DeliveryStatus, string>;
  delivered: (count: string) => string;
};

export const rippleCopy: Record<Language, RippleCopy> = {
  en: {
    delivery: "Request delivery",
    limit: "Share up to",
    startsWithFamily:
      "Starts with family. If the request stays open, it can reach the groups you allow.",
    next: "Next update",
    expires: "Request expires",
    refresh: "Refresh delivery",
    stages: {
      direct: "Direct request",
      family: "Family",
      han: "Your circle",
      association: "Association",
      nearby: "Nearby within 3 km",
    },
    status: {
      sent: "Delivered to inbox",
      no_recipients: "No eligible recipients",
      scheduled: "Scheduled",
      pending: "Waiting",
      stopped: "Stopped",
    },
    delivered: (count) => `${count} delivered to inbox`,
  },
  ja: {
    delivery: "依頼の配信状況",
    limit: "共有する範囲",
    startsWithFamily:
      "最初は家族に共有します。依頼が募集中の場合は、許可した範囲まで広がります。",
    next: "次回更新",
    expires: "募集期限",
    refresh: "配信状況を再読み込み",
    stages: {
      direct: "個別の依頼",
      family: "家族",
      han: "自分のサークル",
      association: "町内会",
      nearby: "半径3 km以内",
    },
    status: {
      sent: "受信箱に配信済み",
      no_recipients: "対象者なし",
      scheduled: "配信予定",
      pending: "待機中",
      stopped: "停止",
    },
    delivered: (count) => `${count}人の受信箱に配信済み`,
  },
  bn: {
    delivery: "অনুরোধ পৌঁছানোর অবস্থা",
    limit: "যত দূর শেয়ার করবেন",
    startsWithFamily:
      "প্রথমে পরিবারের কাছে যাবে। অনুরোধ খোলা থাকলে আপনার বেছে নেওয়া দলগুলোর কাছে যেতে পারে।",
    next: "পরবর্তী আপডেট",
    expires: "অনুরোধের মেয়াদ শেষ",
    refresh: "অবস্থা আবার দেখুন",
    stages: {
      direct: "সরাসরি অনুরোধ",
      family: "পরিবার",
      han: "আপনার সার্কেল",
      association: "সমিতি",
      nearby: "৩ কিমির মধ্যে",
    },
    status: {
      sent: "ইনবক্সে পৌঁছেছে",
      no_recipients: "যোগ্য প্রাপক নেই",
      scheduled: "সময় ঠিক হয়েছে",
      pending: "অপেক্ষায়",
      stopped: "বন্ধ হয়েছে",
    },
    delivered: (count) => `${count} জনের ইনবক্সে পৌঁছেছে`,
  },
};
