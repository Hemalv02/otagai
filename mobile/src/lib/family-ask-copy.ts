import type { Language } from "./api";

type AskCopy = {
  bannerTitle: (name: string) => string;
  bannerDetail: (name: string, circle: string | null) => string;
  title: string;
  switchToMine: string;
  need: (name: string) => string;
  when: string;
  whenPrefix: string;
  details: string;
  shareWith: string;
  edit: string;
  chooseCircle: string;
  needRequired: string;
  tooLong: string;
  noCircleTitle: (name: string) => string;
  noCircleBody: string;
  notAllowedTitle: (name: string) => string;
  notAllowedGeneric: string;
  notAllowedBody: string;
  loadFailed: string;
  retry: string;
  review: string;
  reviewTitle: string;
  reviewNote: (name: string) => string;
  send: string;
  editRequest: string;
  sentTitle: (name: string) => string;
  sentBody: (name: string) => string;
  requestId: string;
  backToFamily: string;
  revokedTitle: (name: string) => string;
  keptBody: string;
  copyWording: string;
  destinationTitle: string;
  destinationBody: string;
  offline: string;
  session: string;
  failed: string;
};

const en: AskCopy = {
  bannerTitle: (name) => `Acting for ${name}`,
  bannerDetail: (name, circle) => (circle ? `${name} · ${circle}` : name),
  title: "Ask for help",
  switchToMine: "Switch to my account",
  need: (name) => `What does ${name} need?`,
  when: "When is help needed?",
  whenPrefix: "When",
  details: "What should a neighbour know?",
  shareWith: "Share with",
  edit: "Edit",
  chooseCircle: "Choose a circle",
  needRequired: "Say what they need.",
  tooLong: "This is too long. Shorten it a little.",
  noCircleTitle: (name) => `${name} isn’t in an approved circle yet`,
  noCircleBody:
    "Requests go to their neighbourhood circle. Ask a circle leader to approve them, then come back.",
  notAllowedTitle: (name) => `You can’t post for ${name}`,
  notAllowedBody:
    "They need to switch on “Post requests” for you in Permissions.",
  notAllowedGeneric: "You can’t post for this person",
  loadFailed: "Could not load this request form.",
  retry: "Try again",
  review: "Review request",
  reviewTitle: "Check before sending",
  reviewNote: (name) =>
    `This will be posted as ${name}. You’ll be recorded as the person who posted it for them.`,
  send: "Send request",
  editRequest: "Edit request",
  sentTitle: (name) => `Posted for ${name}`,
  sentBody: (name) =>
    `Neighbours in ${name}’s circle can now see this request under ${name}’s name.`,
  requestId: "Request ID",
  backToFamily: "Back to Family",
  revokedTitle: (name) => `You can no longer post for ${name}`,
  keptBody: "Nothing was sent. Your wording is kept so you can copy it.",
  copyWording: "Copy or share wording",
  destinationTitle: "That circle can’t receive this request",
  destinationBody: "Nothing was sent. Choose a circle again and retry.",
  offline:
    "Could not reach Otagai. The request may not have been sent. Check Family before trying again.",
  session: "Sign in again to continue. Nothing was sent.",
  failed: "Could not send. Nothing was sent. Try again.",
};

const ja: AskCopy = {
  bannerTitle: (name) => `${name}の代わりに操作中`,
  bannerDetail: (name, circle) => (circle ? `${name}・${circle}` : name),
  title: "手助けを頼む",
  switchToMine: "自分のアカウントに戻る",
  need: (name) => `${name}は何が必要ですか？`,
  when: "いつ手助けが必要ですか？",
  whenPrefix: "日時",
  details: "ご近所の方に伝えたいこと",
  shareWith: "共有先",
  edit: "変更",
  chooseCircle: "サークルを選ぶ",
  needRequired: "必要なことを入力してください。",
  tooLong: "長すぎます。少し短くしてください。",
  noCircleTitle: (name) => `${name}はまだ承認されたサークルにいません`,
  noCircleBody:
    "依頼は本人の地域のサークルに届きます。サークルのリーダーに承認してもらってから、もう一度お試しください。",
  notAllowedTitle: (name) => `${name}の依頼は出せません`,
  notAllowedBody: "本人が「許可」で「依頼を出す」をオンにする必要があります。",
  notAllowedGeneric: "この方の依頼は出せません",
  loadFailed: "依頼の画面を読み込めませんでした。",
  retry: "もう一度試す",
  review: "依頼を確認する",
  reviewTitle: "送信前の確認",
  reviewNote: (name) =>
    `この依頼は${name}の名前で出されます。代わりに出した人としてあなたが記録されます。`,
  send: "依頼を送る",
  editRequest: "依頼を修正する",
  sentTitle: (name) => `${name}の依頼を出しました`,
  sentBody: (name) =>
    `${name}のサークルのご近所の方が、${name}の名前でこの依頼を見られるようになりました。`,
  requestId: "依頼ID",
  backToFamily: "家族の画面に戻る",
  revokedTitle: (name) => `${name}の依頼はもう出せません`,
  keptBody:
    "何も送信されていません。入力した文章は残っているのでコピーできます。",
  copyWording: "文章をコピー・共有",
  destinationTitle: "そのサークルにはこの依頼を送れません",
  destinationBody: "何も送信されていません。サークルを選び直してください。",
  offline:
    "Otagaiに接続できませんでした。依頼が送信されていない可能性があります。もう一度試す前に「家族」を確認してください。",
  session: "もう一度ログインしてください。何も送信されていません。",
  failed:
    "送信できませんでした。何も送信されていません。もう一度お試しください。",
};

const bn: AskCopy = {
  bannerTitle: (name) => `${name}-এর হয়ে কাজ করছেন`,
  bannerDetail: (name, circle) => (circle ? `${name} · ${circle}` : name),
  title: "সাহায্য চান",
  switchToMine: "আমার অ্যাকাউন্টে ফিরুন",
  need: (name) => `${name}-এর কী দরকার?`,
  when: "কখন সাহায্য দরকার?",
  whenPrefix: "কখন",
  details: "প্রতিবেশীর কী জানা উচিত?",
  shareWith: "কাদের সাথে শেয়ার",
  edit: "বদলান",
  chooseCircle: "একটি সার্কেল বেছে নিন",
  needRequired: "তাদের কী দরকার লিখুন।",
  tooLong: "লেখাটি অনেক বড়। একটু ছোট করুন।",
  noCircleTitle: (name) => `${name} এখনো কোনো অনুমোদিত সার্কেলে নেই`,
  noCircleBody:
    "অনুরোধ তাদের পাড়ার সার্কেলে যায়। একজন সার্কেল লিডারকে অনুমোদন দিতে বলুন, তারপর আবার আসুন।",
  notAllowedTitle: (name) => `আপনি ${name}-এর হয়ে পোস্ট করতে পারবেন না`,
  notAllowedBody: "তাদের অনুমতিতে আপনার জন্য “অনুরোধ পোস্ট করা” চালু করতে হবে।",
  notAllowedGeneric: "আপনি এই ব্যক্তির হয়ে পোস্ট করতে পারবেন না",
  loadFailed: "অনুরোধের ফর্ম লোড করা যায়নি।",
  retry: "আবার চেষ্টা করুন",
  review: "অনুরোধ দেখুন",
  reviewTitle: "পাঠানোর আগে দেখে নিন",
  reviewNote: (name) =>
    `এটি ${name}-এর নামে পোস্ট হবে। তাদের হয়ে পোস্টকারী হিসেবে আপনার নাম রেকর্ড হবে।`,
  send: "অনুরোধ পাঠান",
  editRequest: "অনুরোধ বদলান",
  sentTitle: (name) => `${name}-এর হয়ে পোস্ট করা হয়েছে`,
  sentBody: (name) =>
    `${name}-এর সার্কেলের প্রতিবেশীরা এখন ${name}-এর নামে এই অনুরোধ দেখতে পাবেন।`,
  requestId: "অনুরোধের আইডি",
  backToFamily: "পরিবারে ফিরে যান",
  revokedTitle: (name) => `আপনি আর ${name}-এর হয়ে পোস্ট করতে পারবেন না`,
  keptBody: "কিছুই পাঠানো হয়নি। আপনার লেখা রয়ে গেছে, চাইলে কপি করুন।",
  copyWording: "লেখা কপি বা শেয়ার করুন",
  destinationTitle: "ওই সার্কেল এই অনুরোধ নিতে পারবে না",
  destinationBody: "কিছুই পাঠানো হয়নি। আবার সার্কেল বেছে নিয়ে চেষ্টা করুন।",
  offline:
    "Otagai-তে পৌঁছানো যায়নি। অনুরোধটি হয়তো পাঠানো হয়নি। আবার চেষ্টা করার আগে পরিবার দেখে নিন।",
  session: "চালিয়ে যেতে আবার সাইন ইন করুন। কিছুই পাঠানো হয়নি।",
  failed: "পাঠানো যায়নি। কিছুই পাঠানো হয়নি। আবার চেষ্টা করুন।",
};

export const familyAskCopy: Record<Language, AskCopy> = { en, ja, bn };
