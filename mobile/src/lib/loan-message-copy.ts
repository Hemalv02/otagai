import type { Language } from "@/lib/api";

const en = {
  messagePartner: (name: string) => `Message ${name}`,
  neighbour: "your neighbour",
  unavailable: "The conversation for this loan is not available yet.",
  earlier: "Load earlier messages",
  deleted: "Message deleted",
  attachment: "Attachment",
  closed: "This conversation is closed. You can still read your messages.",
};

export const loanMessageCopy: Record<Language, typeof en> = {
  en,
  ja: {
    messagePartner: (name) => `${name}にメッセージ`,
    neighbour: "ご近所の人",
    unavailable: "この貸し借りのチャットはまだ利用できません。",
    earlier: "以前のメッセージを表示",
    deleted: "削除されたメッセージ",
    attachment: "添付ファイル",
    closed: "このチャットは終了しました。以前のメッセージは確認できます。",
  },
  bn: {
    messagePartner: (name) => `${name}-কে বার্তা পাঠান`,
    neighbour: "আপনার প্রতিবেশী",
    unavailable: "এই ধার দেওয়ার কথোপকথন এখনও পাওয়া যাচ্ছে না।",
    earlier: "আগের বার্তা দেখুন",
    deleted: "বার্তা মুছে ফেলা হয়েছে",
    attachment: "সংযুক্তি",
    closed: "এই কথোপকথন বন্ধ। আগের বার্তাগুলো পড়তে পারবেন।",
  },
};
