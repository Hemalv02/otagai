export type WallMaterial = "masonry" | "wood" | "unsure";

type AskTopic = "shelf" | "lawn" | "general";

type AskCatalogItem = {
  id: string;
  kind: "tool" | "skill";
  fields: readonly string[];
  own?: boolean;
};

const shelf = /\b(shelf|shelves|shelving)\b|棚|তাক/u;
const fitting =
  /\b(put up|hang|mount|attach|install|fit|fix|fitting)\b|取り付け|取付|取りつけ|つけ|লাগা|বসা/u;
const lawn = /\b(mow|mower|mowing|lawn|grass)\b|草刈|芝生|ঘাস/u;
const masonry =
  /\b(concrete|brick|masonry|cement|stone)\b|コンクリート|レンガ|煉瓦|モルタル|コンクリ|কংক্রিট|ইট|সিমেন্ট/u;
const wood =
  /\b(wood|wooden|plasterboard|drywall|stud|timber)\b|木製|木材|石膏|せっこう|কাঠ|প্লাস্টারবোর্ড/u;
const excludedWords = new Set([
  "about",
  "after",
  "also",
  "able",
  "borrow",
  "bring",
  "can",
  "could",
  "doing",
  "find",
  "from",
  "give",
  "hand",
  "have",
  "help",
  "into",
  "just",
  "like",
  "look",
  "need",
  "neighbour",
  "please",
  "some",
  "someone",
  "that",
  "their",
  "there",
  "this",
  "tool",
  "tools",
  "trim",
  "trying",
  "under",
  "using",
  "want",
  "what",
  "when",
  "with",
  "would",
  "your",
  "and",
  "any",
  "for",
  "my",
  "one",
  "our",
  "put",
  "the",
  "you",
]);

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase();
}

function words(value: string) {
  return (value.match(/[\p{L}\p{M}]+/gu) ?? []).filter(
    (word) => word.length >= 3 && !excludedWords.has(word),
  );
}

export function analyzeAsk(
  description: string,
  answer?: WallMaterial,
): {
  topic: AskTopic;
  wall: WallMaterial | undefined;
  needsWall: boolean;
} {
  const text = normalize(description);
  const topic =
    shelf.test(text) && fitting.test(text)
      ? "shelf"
      : lawn.test(text)
        ? "lawn"
        : "general";
  const hasMasonry = masonry.test(text);
  const hasWood = wood.test(text);
  const inferred =
    hasMasonry === hasWood ? undefined : hasMasonry ? "masonry" : "wood";
  const wall = topic === "shelf" ? (answer ?? inferred) : undefined;
  return { topic, wall, needsWall: topic === "shelf" && wall === undefined };
}

export function findAskMatches(
  description: string,
  answer: WallMaterial | undefined,
  catalog: readonly AskCatalogItem[],
) {
  const { topic, wall } = analyzeAsk(description, answer);
  const query = normalize(description.trim());
  const queryWords = new Set(words(query));
  const related =
    topic === "shelf"
      ? [
          "shelf",
          "shelves",
          "shelving",
          "wall",
          "棚",
          "তাক",
          ...(wall === "wood"
            ? ["wood", "stud", "drywall"]
            : ["hammer", "drill", "masonry", "brick"]),
        ]
      : topic === "lawn"
        ? ["grass", "mow", "mower", "lawn", "garden", "草刈", "芝生", "ঘাস"]
        : [];
  const matches = catalog
    .flatMap((item) => {
      if (item.own || !query) return [];
      const fields = item.fields.map(normalize);
      const document = fields.join(" ");
      const tokens = new Set(words(document));
      let score = 0;
      for (const word of queryWords) {
        if (
          tokens.has(word) ||
          (/[^\x00-\x7f]/u.test(word) && document.includes(word))
        )
          score += 3;
      }
      for (const keyword of related) {
        if (
          tokens.has(keyword) ||
          (/[^\x00-\x7f]/u.test(keyword) && document.includes(keyword))
        )
          score += 1;
      }
      if (fields.some((field) => field.length >= 3 && query.includes(field)))
        score += 4;
      return score > 0 ? [{ item, score }] : [];
    })
    .sort((a, b) => b.score - a.score);

  return {
    tools: matches
      .filter(({ item }) => item.kind === "tool")
      .map(({ item }) => item.id),
    skills: matches
      .filter(({ item }) => item.kind === "skill")
      .map(({ item }) => item.id),
  };
}
