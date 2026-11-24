import type { Language } from "./api";

const en = {
  suggestDetails: "Suggest details",
  suggestAgain: "Suggest again",
  suggesting: "Looking at your photo…",
  suggestHint: "Suggestions fill empty fields. Your edits stay.",
  unclear:
    "We couldn't tell what this is. Fill in the details yourself or try another photo.",
  failed:
    "Suggestions aren't available right now. You can fill in the form yourself.",
  rateLimited:
    "You've requested several suggestions. Try again later or fill in the form yourself.",
  photoNotReady: "The photo isn't ready. Try again or choose another photo.",
  includedParts: "Included parts (one per line)",
  riskyTitle: "Offered as help, not a loan",
  suggestedHelpDetail:
    "The suggestion recommends offering help with this item rather than lending it.",
  riskyDetail:
    "Items in this category are risky to lend. You'll offer your help with it instead.",
  categoryUnmatched: "Choose a category: we couldn't match the suggestion.",
};
export const listingDraftCopy: Record<Language, typeof en> = {
  en,
  ja: {
    suggestDetails: "写真から詳細を提案",
    suggestAgain: "もう一度提案",
    suggesting: "写真を確認しています…",
    suggestHint: "空欄に提案を入力します。編集した内容はそのまま残ります。",
    unclear:
      "写真の品物を確認できませんでした。手動で入力するか、別の写真をお試しください。",
    failed: "現在、提案を利用できません。手動で入力できます。",
    rateLimited:
      "提案の利用回数が多くなっています。後で試すか、手動で入力してください。",
    photoNotReady:
      "写真の準備ができていません。再試行するか、別の写真を選んでください。",
    includedParts: "付属品（1行に1つ）",
    riskyTitle: "貸し出しではなく、お手伝いとして提供",
    suggestedHelpDetail:
      "この品物は貸し出しではなく、使い方を含むお手伝いとして提供することを提案しています。",
    riskyDetail:
      "この分類の品物は貸し出しに危険が伴うため、品物を使ったお手伝いとして提供します。",
    categoryUnmatched:
      "提案に合う分類が見つかりませんでした。分類を選んでください。",
  },
  bn: {
    suggestDetails: "ছবি থেকে বিবরণ দিন",
    suggestAgain: "আবার পরামর্শ নিন",
    suggesting: "ছবি দেখা হচ্ছে…",
    suggestHint: "খালি ঘরে পরামর্শ যোগ হবে। আপনার সম্পাদনা থাকবে।",
    unclear: "ছবির জিনিসটি চেনা যায়নি। নিজে বিবরণ লিখুন বা অন্য ছবি দিন।",
    failed: "এখন পরামর্শ পাওয়া যাচ্ছে না। আপনি নিজেই ফর্ম পূরণ করতে পারেন।",
    rateLimited: "অনেকবার পরামর্শ চাওয়া হয়েছে। পরে চেষ্টা করুন বা নিজে লিখুন।",
    photoNotReady: "ছবি প্রস্তুত নয়। আবার চেষ্টা করুন বা অন্য ছবি বেছে নিন।",
    includedParts: "সঙ্গে থাকা অংশ (প্রতি লাইনে একটি)",
    riskyTitle: "ধার নয়, সাহায্য হিসেবে দেওয়া হবে",
    suggestedHelpDetail:
      "এই জিনিস ধার দেওয়ার বদলে এটি দিয়ে সাহায্য করার পরামর্শ দেওয়া হয়েছে।",
    riskyDetail:
      "এই বিভাগের জিনিস ধার দেওয়া ঝুঁকিপূর্ণ। তাই এটি দিয়ে সাহায্য করার প্রস্তাব দেওয়া হবে।",
    categoryUnmatched: "পরামর্শের সঙ্গে বিভাগ মেলেনি। একটি বিভাগ বেছে নিন।",
  },
};
