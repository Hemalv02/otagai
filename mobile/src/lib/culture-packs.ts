import type { CircleUnitType, ContentLanguage, Region } from "@/lib/api";

type CulturePack = {
  aiPack: "japan" | "bangladesh";
  units: readonly [CircleUnitType, ...CircleUnitType[]];
  languages: readonly ContentLanguage[];
  currency: "JPY" | "BDT";
  demoProvider: "Stripe" | "bKash";
  demoAmount: number;
};

const packs: Record<Region, CulturePack> = {
  jp: {
    aiPack: "japan",
    units: ["han", "association", "building"],
    languages: ["ja", "en", "vi", "bn"],
    currency: "JPY",
    demoProvider: "Stripe",
    demoAmount: 500,
  },
  bd: {
    aiPack: "bangladesh",
    units: ["para", "moholla", "building"],
    languages: ["bn", "en"],
    currency: "BDT",
    demoProvider: "bKash",
    demoAmount: 50,
  },
};

export function culturePackFor(region: Region) {
  return packs[region];
}
