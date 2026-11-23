import type { Language } from "@/lib/api";

const en = {
  askToBorrow: "Ask to borrow",
  askForHelp: "Ask for help",
  reviewTitle: "Review your request",
  to: "To",
  about: "Listing",
  messageLabel: "Message",
  defaultBorrow: (title: string) =>
    `Hello! Could I borrow your "${title}"? Thank you.`,
  defaultHelp: (title: string) =>
    `Hello! Could you help me with "${title}"? Thank you.`,
  nothingSent: "Nothing is sent until you tap Send.",
  send: "Send",
  sending: "Sending",
  ownListing: "This is your listing.",
  pausedReadOnly: "The owner has paused this listing.",
  lentOutReadOnly: "This item is lent out right now.",
  noOwner: "This listing has no owner to ask.",
  unavailable: "This listing isn't available any more. Your message is kept.",
  invalid: "Check your message and try again.",
  transient:
    "Couldn't send. Check your connection and try again. Your message is kept.",
  auth: "Sign in again to send your request.",
  error: "Couldn't send your request. Your message is kept.",
  retry: "Try again",
  backToListing: "Back to listing",
  requestedListing: "About",
};

const ja: typeof en = {
  askToBorrow: "借りたいと伝える",
  askForHelp: "手伝いをお願いする",
  reviewTitle: "依頼内容の確認",
  to: "宛先",
  about: "掲載",
  messageLabel: "メッセージ",
  defaultBorrow: (title) =>
    `こんにちは。「${title}」をお借りできますか？よろしくお願いします。`,
  defaultHelp: (title) =>
    `こんにちは。「${title}」について手伝っていただけますか？よろしくお願いします。`,
  nothingSent: "送信を押すまでは、何も送られません。",
  send: "送信する",
  sending: "送信中",
  ownListing: "これはあなたの掲載です。",
  pausedReadOnly: "持ち主がこの掲載を一時停止しています。",
  lentOutReadOnly: "このアイテムは現在貸し出し中です。",
  noOwner: "この掲載には依頼できる持ち主がいません。",
  unavailable:
    "この掲載は現在依頼を受け付けられません。もう一度試すか、掲載に戻ってください。",
  invalid: "メッセージを確認して、もう一度お試しください。",
  transient:
    "送信できませんでした。接続を確認して、もう一度お試しください。メッセージは残してあります。",
  auth: "依頼を送るには、もう一度ログインしてください。",
  error: "依頼を送信できませんでした。メッセージは残してあります。",
  retry: "もう一度試す",
  backToListing: "掲載に戻る",
  requestedListing: "対象の掲載",
};

const bn: typeof en = {
  askToBorrow: "ধার চাইতে অনুরোধ করুন",
  askForHelp: "সাহায্য চান",
  reviewTitle: "আপনার অনুরোধ দেখে নিন",
  to: "প্রাপক",
  about: "তালিকা",
  messageLabel: "বার্তা",
  defaultBorrow: (title) =>
    `হ্যালো! আমি কি আপনার "${title}" ধার নিতে পারি? ধন্যবাদ।`,
  defaultHelp: (title) =>
    `হ্যালো! আপনি কি "${title}" নিয়ে আমাকে সাহায্য করতে পারবেন? ধন্যবাদ।`,
  nothingSent: "পাঠান চাপার আগে কিছুই পাঠানো হবে না।",
  send: "পাঠান",
  sending: "পাঠানো হচ্ছে",
  ownListing: "এটি আপনার নিজের তালিকা।",
  pausedReadOnly: "মালিক এই তালিকাটি বিরতিতে রেখেছেন।",
  lentOutReadOnly: "এই জিনিসটি এখন ধার দেওয়া আছে।",
  noOwner: "এই তালিকায় অনুরোধ করার মতো মালিক নেই।",
  unavailable: "এই তালিকাটি আর পাওয়া যাচ্ছে না। আপনার বার্তা রাখা আছে।",
  invalid: "আপনার বার্তাটি দেখে আবার চেষ্টা করুন।",
  transient: "পাঠানো যায়নি। সংযোগ দেখে আবার চেষ্টা করুন। আপনার বার্তা রাখা আছে।",
  auth: "অনুরোধ পাঠাতে আবার সাইন ইন করুন।",
  error: "অনুরোধ পাঠানো যায়নি। আপনার বার্তা রাখা আছে।",
  retry: "আবার চেষ্টা করুন",
  backToListing: "তালিকায় ফিরুন",
  requestedListing: "যে তালিকা সম্পর্কে",
};

export const listingRequestCopy: Record<Language, typeof en> = { en, ja, bn };
