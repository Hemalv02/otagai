import { createInstance } from "i18next";
import { useTranslation } from "react-i18next";

import { accountCopy } from "@/lib/account-copy";
import type { Language } from "@/lib/api";
import { useOnboarding } from "@/lib/onboarding";
import { fonts, typography } from "@/theme/tokens.json";

const en = {
  preferences: "Language & region",
  location: "Nagasaki, Japan",
  welcomeTitle: "Help is close by.",
  welcomeBody:
    "Borrow a tool, ask for a hand, or help out in your local circle.",
  next: "Next",
  getStarted: "Get started",
  backToWelcome: "Back to welcome",
  featuresTitle: "Share what you have.",
  featuresBody:
    "Join a local circle to ask for help or share something useful.",
  askForHelp: "Ask for help",
  askForHelpBody: "Get a hand with an everyday task.",
  lendATool: "Lend a tool",
  lendAToolBody: "Share a tool you already own.",
  joinWithInvite: "Join with an invite",
  joinWithInviteBody:
    "Your circle is the people in your building or neighbourhood group.",
  heroDescription:
    "Two neighbours passing a shopping bag on a hillside in Nagasaki",
  storyTitle: "A favour across languages",
  storyBody: "Tanaka-san asks for help. Rahim reads her request in Bengali.",
  storyPlace: "One morning in Nagasaki",
  tanaka: "Tanaka-san",
  rahim: "Rahim",
  request: "Could someone help me carry rice up the steps?",
  reply: "I can help after work.",
  back: "Back",
  preferencesBody: "Choose your app language and where to look for a circle.",
  appLanguage: "App language",
  region: "Region",
  japan: "Nagasaki, Japan",
  bangladesh: "Cumilla, Bangladesh",
  save: "Save preferences",
  saveError: "Could not save your choices. Try again.",
  signIn: "Sign in",
  email: "Email",
  aboutYou: "About you",
  profileBody: "Your neighbours will see this name.",
  name: "Name",
  nameExample: "Tanaka Hanako",
  language: "Language",
  whereYouLive: "Where you live",
  japanCountry: "Japan",
  bangladeshCountry: "Bangladesh",
  helpWith: "Happy to help with (optional)",
  helpWithExample: "Gardening, carrying shopping, Japanese forms",
  introLabel: "Introduction (optional)",
  introHint: "Neighbours see this on your profile.",
  suggestIntro: "Suggest an intro",
  suggestAnotherIntro: "Suggest another",
  introPlaceholder: "A warm hello to your neighbours…",
  addSkillsFirst: "Add what you’re happy to help with, then we can suggest one.",
  introDraftError: "Couldn’t draft an intro. You can still write your own.",
  continue: "Continue",
  signOut: "Sign out",
};

const ja: typeof en = {
  preferences: "言語と地域",
  location: "日本・長崎",
  welcomeTitle: "助け合いは、すぐそばに。",
  welcomeBody:
    "道具を借りたり、手助けを頼んだり。ご近所の仲間とできることを分かち合いましょう。",
  next: "次へ",
  getStarted: "はじめる",
  backToWelcome: "最初の画面へ",
  featuresTitle: "持っているものを分かち合おう。",
  featuresBody:
    "地域のサークルに参加して、手助けを頼んだり、道具を貸したりできます。",
  askForHelp: "手助けを頼む",
  askForHelpBody: "日々のちょっとした困りごとを手伝ってもらいましょう。",
  lendATool: "道具を貸す",
  lendAToolBody: "持っている道具を、ご近所の方に貸せます。",
  joinWithInvite: "招待を受けて参加",
  joinWithInviteBody: "サークルは、同じ建物や地域に住む人たちのグループです。",
  heroDescription: "長崎の坂道で買い物袋を手渡すご近所の二人",
  storyTitle: "言葉をこえた助け合い",
  storyBody:
    "田中さんが手助けを頼み、ラヒムさんはベンガル語でそのお願いを読みます。",
  storyPlace: "長崎のある朝",
  tanaka: "田中さん",
  rahim: "ラヒムさん",
  request: "階段の上までお米を運ぶのを手伝っていただけませんか？",
  reply: "仕事のあとならお手伝いできます。",
  back: "戻る",
  preferencesBody:
    "アプリの表示言語と、参加するサークルを探す地域を選んでください。",
  appLanguage: "表示言語",
  region: "地域",
  japan: "日本・長崎",
  bangladesh: "バングラデシュ・クミッラ",
  save: "設定を保存",
  saveError: "設定を保存できませんでした。もう一度お試しください。",
  signIn: "ログイン",
  email: "メール",
  aboutYou: "プロフィール",
  profileBody: "ここで入力した名前は、ご近所の方に表示されます。",
  name: "名前",
  nameExample: "田中 花子",
  language: "言語",
  whereYouLive: "お住まいの地域",
  japanCountry: "日本",
  bangladeshCountry: "バングラデシュ",
  helpWith: "お手伝いできること（任意）",
  helpWithExample: "園芸、買い物袋を運ぶこと、書類の記入",
  introLabel: "自己紹介（任意）",
  introHint: "ご近所の方のプロフィールに表示されます。",
  suggestIntro: "自己紹介を提案",
  suggestAnotherIntro: "別の案を提案",
  introPlaceholder: "ご近所の方への一言…",
  addSkillsFirst: "お手伝いできることを書くと、自己紹介を提案できます。",
  introDraftError: "自己紹介を作成できませんでした。ご自身で書くこともできます。",
  continue: "続ける",
  signOut: "ログアウト",
};

const bn: typeof en = {
  preferences: "ভাষা ও এলাকা",
  location: "নাগাসাকি, জাপান",
  welcomeTitle: "সাহায্য আছে কাছেই।",
  welcomeBody:
    "যন্ত্রপাতি ধার নিন, সাহায্য চান, কিংবা আপনার এলাকার কাউকে সাহায্য করুন।",
  next: "পরের ধাপ",
  getStarted: "শুরু করুন",
  backToWelcome: "প্রথম পর্দায় ফিরুন",
  featuresTitle: "আপনার যা আছে, ভাগ করে নিন।",
  featuresBody:
    "সাহায্য চাইতে বা দরকারি কিছু ভাগ করে নিতে আপনার এলাকার দলে যোগ দিন।",
  askForHelp: "সাহায্য চান",
  askForHelpBody: "দৈনন্দিন কোনো কাজে সাহায্য নিন।",
  lendATool: "যন্ত্রপাতি ধার দিন",
  lendAToolBody: "আপনার যন্ত্রপাতি প্রতিবেশীকে ধার দিন।",
  joinWithInvite: "আমন্ত্রণ পেয়ে যোগ দিন",
  joinWithInviteBody: "একই ভবন বা এলাকার প্রতিবেশীদের নিয়ে আপনার দল।",
  heroDescription: "নাগাসাকির পাহাড়ি পথে দুই প্রতিবেশী বাজারের ব্যাগ হাতবদল করছেন",
  storyTitle: "ভাষা পেরিয়ে সাহায্য",
  storyBody: "তানাকা সাহায্য চান। রহিম তাঁর অনুরোধটি বাংলায় পড়েন।",
  storyPlace: "নাগাসাকির এক সকাল",
  tanaka: "তানাকা",
  rahim: "রহিম",
  request: "সিঁড়ি দিয়ে চালের বস্তা তুলতে কেউ কি সাহায্য করবেন?",
  reply: "কাজের পর আমি সাহায্য করতে পারব।",
  back: "ফিরে যান",
  preferencesBody: "অ্যাপের ভাষা ও প্রতিবেশীদের দল খোঁজার এলাকা বেছে নিন।",
  appLanguage: "অ্যাপের ভাষা",
  region: "এলাকা",
  japan: "নাগাসাকি, জাপান",
  bangladesh: "কুমিল্লা, বাংলাদেশ",
  save: "সেটিংস সংরক্ষণ করুন",
  saveError: "আপনার পছন্দ সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
  signIn: "সাইন ইন",
  email: "ইমেইল",
  aboutYou: "আপনার পরিচয়",
  profileBody: "আপনার প্রতিবেশীরা এই নামটি দেখতে পাবেন।",
  name: "নাম",
  nameExample: "রহিম আহমেদ",
  language: "ভাষা",
  whereYouLive: "আপনি কোথায় থাকেন",
  japanCountry: "জাপান",
  bangladeshCountry: "বাংলাদেশ",
  helpWith: "যে কাজে সাহায্য করতে চান (ঐচ্ছিক)",
  helpWithExample: "বাগান করা, বাজারের ব্যাগ বহন করা, ফর্ম পূরণ",
  introLabel: "পরিচিতি (ঐচ্ছিক)",
  introHint: "প্রতিবেশীরা এটি আপনার প্রোফাইলে দেখতে পাবেন।",
  suggestIntro: "একটি পরিচিতি প্রস্তাব করুন",
  suggestAnotherIntro: "আরেকটি প্রস্তাব করুন",
  introPlaceholder: "প্রতিবেশীদের জন্য উষ্ণ অভিবাদন…",
  addSkillsFirst: "যে কাজে সাহায্য করতে চান লিখুন, তাহলে পরিচিতি প্রস্তাব করা যাবে।",
  introDraftError: "পরিচিতি তৈরি করা যায়নি। আপনি নিজেই লিখতে পারেন।",
  continue: "এগিয়ে যান",
  signOut: "সাইন আউট",
};

const i18n = createInstance();
void i18n.init({
  lng: "en",
  fallbackLng: "en",
  defaultNS: "onboarding",
  initAsync: false,
  interpolation: { escapeValue: false },
  resources: {
    en: { onboarding: { ...en, ...accountCopy.en } },
    ja: { onboarding: { ...ja, ...accountCopy.ja } },
    bn: { onboarding: { ...bn, ...accountCopy.bn } },
  },
});

export function useOnboardingText(language?: Language) {
  const { state } = useOnboarding();
  const locale = language ?? state.language;
  const { t } = useTranslation("onboarding", { i18n, lng: locale });
  return { t, locale };
}

export function localizedType(
  role: Exclude<keyof typeof typography, "wordmark">,
  locale: Language,
) {
  const spec = typography[role];
  return {
    fontFamily: fonts[locale][spec.weight as keyof typeof fonts.en],
    fontSize: spec.size,
    lineHeight: spec.lineHeight[locale],
  };
}
