import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import type { Language } from "@/lib/api";
import type { Actor } from "@/lib/community-demo";
import { useSession } from "@/lib/session";

export type ListingKind = "tool" | "skill";
export const listingCategories = ["repairs", "garden", "everyday"] as const;
export type ListingCategory = (typeof listingCategories)[number];
export type ListingText = string | Record<Language, string>;
export type ListingPhoto = "drill" | "grass-cutter" | { uri: string };

type ListingDraft = {
  kind: ListingKind;
  category: ListingCategory;
  title: ListingText;
  description: ListingText;
  postedBy?: Actor;
  safetyNote?: string;
  availabilityNote?: string;
  photo?: ListingPhoto;
};

type PublishedListing = ListingDraft & {
  id: string;
};

type SampleListing = PublishedListing & {
  owner: ListingText;
  summary: ListingText;
  availability: "weekend" | "ask";
  keywords: ListingText;
};

export const drillListingId = "hammer-drill";

const sampleListings: SampleListing[] = [
  {
    id: drillListingId,
    kind: "tool",
    category: "repairs",
    postedBy: "neighbour",
    title: {
      en: "Cordless hammer drill",
      ja: "コードレス振動ドリル",
      bn: "কর্ডলেস হ্যামার ড্রিল",
    },
    description: {
      en: "Drill, one battery, charger and a set of masonry bits.",
      ja: "ドリル本体、バッテリー1個、充電器、コンクリート用ビット一式。",
      bn: "ড্রিল, একটি ব্যাটারি, চার্জার ও ইট-কংক্রিট ছিদ্র করার বিটের একটি সেট।",
    },
    owner: { en: "Tanaka-san", ja: "田中さん", bn: "তানাকা" },
    summary: {
      en: "Masonry bits included",
      ja: "コンクリート用ビット付き",
      bn: "ইট-কংক্রিটের বিটসহ",
    },
    keywords: {
      en: "drill holes wall fasten screws masonry brick concrete DIY home repairs",
      ja: "穴あけ 壁 ネジ コンクリート 修理 DIY",
      bn: "ছিদ্র দেয়াল স্ক্রু কংক্রিট ইট মেরামত",
    },
    availability: "weekend",
    photo: "drill",
  },
  {
    id: "put-up-shelves",
    kind: "skill",
    category: "repairs",
    title: {
      en: "Help putting up shelves",
      ja: "棚の取り付けをお手伝い",
      bn: "তাক লাগাতে সাহায্য",
    },
    description: {
      en: "I can help you mark the wall, drill the holes and hang a shelf.",
      ja: "壁に印をつけ、穴を開けて棚を取り付けるお手伝いをします。",
      bn: "দেয়ালে দাগ দিতে, ড্রিল দিয়ে ছিদ্র করতে ও তাক লাগাতে সাহায্য করতে পারি।",
    },
    owner: { en: "Ito-san", ja: "伊藤さん", bn: "ইতো" },
    summary: { en: "Home repairs", ja: "家の修理", bn: "বাড়ির মেরামত" },
    keywords: {
      en: "drill holes wall hanging shelf shelving DIY home repairs",
      ja: "ドリル 穴あけ 壁 棚 DIY 家の修理",
      bn: "ড্রিল ছিদ্র দেয়াল তাক মেরামত",
    },
    availability: "ask",
  },
  {
    id: "grass-cutter",
    kind: "tool",
    category: "garden",
    postedBy: "neighbour",
    title: { en: "Grass cutter", ja: "草刈り機", bn: "ঘাস কাটার যন্ত্র" },
    description: {
      en: "Cordless grass cutter with a battery, charger and blade cover.",
      ja: "充電式草刈り機、バッテリー、充電器、刃のカバー。",
      bn: "কর্ডলেস ঘাস কাটার যন্ত্র, ব্যাটারি, চার্জার ও ব্লেডের ঢাকনা।",
    },
    owner: { en: "Tanaka-san", ja: "田中さん", bn: "তানাকা" },
    summary: { en: "Han 3", ja: "3班", bn: "হান ৩" },
    keywords: {
      en: "grass trim lawn garden gardening yard cordless weed trimmer",
      ja: "草刈り 芝生 園芸 庭 雑草 充電式",
      bn: "ঘাস কাটার বাগান আগাছা ছাঁটাই কর্ডলেস",
    },
    availability: "weekend",
    photo: "grass-cutter",
  },
];

export type DemoListing = PublishedListing | SampleListing;

export function isSampleListing(
  listing: DemoListing,
): listing is SampleListing {
  return "owner" in listing;
}

export function listingText(value: ListingText, locale: Language) {
  return typeof value === "string" ? value : value[locale];
}

const drillPhoto = require("../../assets/images/community/home-drill.png");
const grassCutterPhoto = require("../../assets/images/community/home-grass-cutter.png");

export function listingPhotoSource(photo: ListingPhoto) {
  if (photo === "drill") return drillPhoto;
  if (photo === "grass-cutter") return grassCutterPhoto;
  return photo;
}

type AccountListings = { userId: string; items: PublishedListing[] };

type DemoListingsContextValue = {
  listings: DemoListing[];
  ready: boolean;
  publish: (draft: ListingDraft) => Promise<string>;
};

const DemoListingsContext = createContext<DemoListingsContextValue | null>(
  null,
);

function storageKey(userId: string) {
  return `otagai.demo-listings.v1.${userId}`;
}

export function DemoListingsProvider({ children }: PropsWithChildren) {
  const { session } = useSession();
  const userId = session?.user.id;
  const [account, setAccount] = useState<AccountListings | null>(null);
  const writing = useRef(false);

  useEffect(() => {
    if (!userId) return;
    let current = true;

    async function restore(forUser: string) {
      let items: PublishedListing[] = [];
      try {
        const saved = await AsyncStorage.getItem(storageKey(forUser));
        const parsed: unknown = saved ? JSON.parse(saved) : null;
        if (Array.isArray(parsed)) items = parsed;
      } catch (error) {
        console.warn("Could not restore your tool listings.", error);
      }
      if (current) setAccount({ userId: forUser, items });
    }

    void restore(userId);
    return () => {
      current = false;
    };
  }, [userId]);

  const currentAccount = account?.userId === userId ? account : null;

  const publish = useCallback(
    async (draft: ListingDraft) => {
      if (!currentAccount || writing.current) {
        throw new Error("Could not publish the tool listing.");
      }

      writing.current = true;
      try {
        const id = `local-${Date.now()}-${currentAccount.items.length}`;
        const items = [{ ...draft, id }, ...currentAccount.items];
        await AsyncStorage.setItem(
          storageKey(currentAccount.userId),
          JSON.stringify(items),
        );
        setAccount((previous) =>
          previous?.userId === currentAccount.userId
            ? { ...currentAccount, items }
            : previous,
        );
        return id;
      } finally {
        writing.current = false;
      }
    },
    [currentAccount],
  );

  return (
    <DemoListingsContext.Provider
      value={{
        listings: [...(currentAccount?.items ?? []), ...sampleListings],
        ready: !!currentAccount,
        publish,
      }}
    >
      {children}
    </DemoListingsContext.Provider>
  );
}

export function useDemoListings() {
  const value = useContext(DemoListingsContext);
  if (!value)
    throw new Error(
      "useDemoListings must be used inside DemoListingsProvider.",
    );
  return value;
}
