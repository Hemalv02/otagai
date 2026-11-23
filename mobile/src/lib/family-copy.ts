import type { Language, RequestKind, RippleStage } from "./api";
import type { StatusLinkStanding } from "./family-state";

type FamilyCopy = {
  title: string;
  subtitle: string;
  chooseWho: string;
  yourAccount: string;
  active: string;
  switchTo: string;
  canView: string;
  activityHidden: string;
  linkStatus: { pending: string; noAccess: string };
  linkDetail: Record<StatusLinkStanding, string>;
  yourRequests: string;
  theirRequests: (name: string) => string;
  noFamilyTitle: string;
  noFamilyBody: string;
  noRequestsSelf: string;
  noRequestsOther: (name: string) => string;
  checkLater: string;
  noPermissionTitle: (name: string) => string;
  noPermissionBody: string;
  loadError: string;
  requestsError: string;
  retry: string;
  refresh: string;
  refreshFailed: string;
  lostAccess: (name: string) => string;
  kinds: Record<RequestKind, string>;
  open: string;
  anyTime: string;
  posted: string;
  audience: string;
  ripple: Record<RippleStage, string>;
  showDetails: string;
  hideDetails: string;
  loading: string;
};

const en: FamilyCopy = {
  title: "Your family",
  subtitle: "Help someone you trust with everyday requests.",
  chooseWho: "Choose who you’re helping",
  yourAccount: "Your account",
  active: "Active",
  switchTo: "Switch",
  canView: "Can see requests",
  activityHidden: "Requests hidden",
  linkStatus: { pending: "Pending", noAccess: "No access" },
  linkDetail: {
    "pending-outgoing": "Waiting for them to accept",
    "pending-incoming": "Asked to link with you",
    "no-permission": "Linked · no permission to help yet",
  },
  yourRequests: "Your open requests",
  theirRequests: (name) => `${name}'s open requests`,
  noFamilyTitle: "No family linked yet",
  noFamilyBody:
    "When a family member links with you or lets you help them, they will appear here.",
  noRequestsSelf: "You have no open requests.",
  noRequestsOther: (name) => `${name} has no open requests.`,
  checkLater: "Check again later, or refresh now.",
  noPermissionTitle: (name) => `You can't see ${name}'s requests`,
  noPermissionBody:
    "They can turn on “See activity” for you in their proxy permissions.",
  loadError: "Could not load your family.",
  requestsError: "Could not load these requests.",
  retry: "Try again",
  refresh: "Refresh",
  refreshFailed: "Could not refresh. Showing the requests we loaded before.",
  lostAccess: (name) => `You can no longer see ${name}'s requests.`,
  kinds: {
    help: "Help",
    borrow: "Borrow",
    borrow_with_help: "Borrow with help",
  },
  open: "Open",
  anyTime: "Any time",
  posted: "Posted",
  audience: "Who can see it",
  ripple: {
    direct: "One neighbour",
    family: "Family",
    han: "Your han",
    association: "Neighbourhood association",
    nearby: "Nearby neighbours",
  },
  showDetails: "Show details",
  hideDetails: "Hide details",
  loading: "Loading requests",
};

const ja: FamilyCopy = {
  title: "あなたの家族",
  subtitle: "信頼できる人の日々の依頼を手伝いましょう。",
  chooseWho: "お手伝いする相手を選ぶ",
  yourAccount: "あなたのアカウント",
  active: "選択中",
  switchTo: "切り替え",
  canView: "依頼を見られます",
  activityHidden: "依頼は非公開",
  linkStatus: { pending: "承認待ち", noAccess: "権限なし" },
  linkDetail: {
    "pending-outgoing": "相手の承認を待っています",
    "pending-incoming": "つながりの申請が届いています",
    "no-permission": "つながり済み・代理の許可はまだありません",
  },
  yourRequests: "自分の募集中の依頼",
  theirRequests: (name) => `${name}の募集中の依頼`,
  noFamilyTitle: "まだ家族とつながっていません",
  noFamilyBody:
    "家族とつながったり、代理の許可をもらったりすると、ここに表示されます。",
  noRequestsSelf: "募集中の依頼はありません。",
  noRequestsOther: (name) => `${name}の募集中の依頼はありません。`,
  checkLater: "しばらくしてから確認するか、今すぐ更新してください。",
  noPermissionTitle: (name) => `${name}の依頼は見られません`,
  noPermissionBody:
    "相手が代理の設定で「活動を見る」を許可すると表示されます。",
  loadError: "家族の情報を読み込めませんでした。",
  requestsError: "依頼を読み込めませんでした。",
  retry: "もう一度試す",
  refresh: "更新",
  refreshFailed: "更新できませんでした。前回読み込んだ依頼を表示しています。",
  lostAccess: (name) => `${name}の依頼は見られなくなりました。`,
  kinds: {
    help: "手助け",
    borrow: "借りたい",
    borrow_with_help: "借りて手伝ってほしい",
  },
  open: "募集中",
  anyTime: "いつでも",
  posted: "投稿日",
  audience: "公開範囲",
  ripple: {
    direct: "特定のご近所さん",
    family: "家族",
    han: "班",
    association: "自治会",
    nearby: "近所の方",
  },
  showDetails: "詳しく見る",
  hideDetails: "閉じる",
  loading: "依頼を読み込み中",
};

const bn: FamilyCopy = {
  title: "আপনার পরিবার",
  subtitle: "আপনার বিশ্বস্ত কাউকে দৈনন্দিন অনুরোধে সাহায্য করুন।",
  chooseWho: "কাকে সাহায্য করছেন বেছে নিন",
  yourAccount: "আপনার অ্যাকাউন্ট",
  active: "সক্রিয়",
  switchTo: "বদলান",
  canView: "অনুরোধ দেখা যাবে",
  activityHidden: "অনুরোধ লুকানো",
  linkStatus: { pending: "অপেক্ষমাণ", noAccess: "অনুমতি নেই" },
  linkDetail: {
    "pending-outgoing": "তাদের সম্মতির অপেক্ষায়",
    "pending-incoming": "আপনার সাথে যুক্ত হতে চেয়েছেন",
    "no-permission": "যুক্ত · এখনো সাহায্যের অনুমতি নেই",
  },
  yourRequests: "আপনার খোলা অনুরোধ",
  theirRequests: (name) => `${name}-এর খোলা অনুরোধ`,
  noFamilyTitle: "এখনো কোনো পরিবারের সদস্য যুক্ত হয়নি",
  noFamilyBody:
    "কোনো পরিবারের সদস্য আপনার সাথে যুক্ত হলে বা সাহায্যের অনুমতি দিলে এখানে দেখা যাবে।",
  noRequestsSelf: "আপনার কোনো খোলা অনুরোধ নেই।",
  noRequestsOther: (name) => `${name}-এর কোনো খোলা অনুরোধ নেই।`,
  checkLater: "পরে আবার দেখুন, অথবা এখনই রিফ্রেশ করুন।",
  noPermissionTitle: (name) => `আপনি ${name}-এর অনুরোধ দেখতে পারবেন না`,
  noPermissionBody:
    "তারা প্রক্সি অনুমতিতে “কার্যকলাপ দেখা” চালু করলে দেখা যাবে।",
  loadError: "আপনার পরিবারের তথ্য লোড করা যায়নি।",
  requestsError: "এই অনুরোধগুলো লোড করা যায়নি।",
  retry: "আবার চেষ্টা করুন",
  refresh: "রিফ্রেশ",
  refreshFailed: "রিফ্রেশ করা যায়নি। আগে লোড হওয়া অনুরোধ দেখানো হচ্ছে।",
  lostAccess: (name) => `আপনি আর ${name}-এর অনুরোধ দেখতে পারবেন না।`,
  kinds: {
    help: "সাহায্য",
    borrow: "ধার",
    borrow_with_help: "ধার ও সাহায্য",
  },
  open: "খোলা",
  anyTime: "যেকোনো সময়",
  posted: "পোস্ট করা হয়েছে",
  audience: "কারা দেখতে পাবে",
  ripple: {
    direct: "একজন প্রতিবেশী",
    family: "পরিবার",
    han: "আপনার হান",
    association: "পাড়া সমিতি",
    nearby: "কাছের প্রতিবেশী",
  },
  showDetails: "বিস্তারিত দেখুন",
  hideDetails: "লুকান",
  loading: "অনুরোধ লোড হচ্ছে",
};

export const familyCopy: Record<Language, FamilyCopy> = { en, ja, bn };
