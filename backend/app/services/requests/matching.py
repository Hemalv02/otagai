import uuid
from dataclasses import replace
from math import inf
from unicodedata import category, normalize

from app.database.models.enums import RequestKind
from app.repositories.request_ripple import ListingMatch, RippleCandidate
from app.repositories.requests import RecipientMatch

EQUIVALENT_TERMS = (
    (
        "pressure washer",
        "power washer",
        "high pressure cleaner",
        "高圧洗浄機",
        "প্রেশার ওয়াশার",
    ),
    (
        "grass cutter",
        "brush cutter",
        "strimmer",
        "weed trimmer",
        "草刈り機",
        "ঘাস কাটার যন্ত্র",
    ),
    ("drill", "power drill", "電動ドリル", "ড্রিল"),
    ("ladder", "stepladder", "step ladder", "脚立", "はしご", "মই"),
    ("drain snake", "drain auger", "排水管クリーナー", "ড্রেন স্নেক"),
    ("carry", "carrying", "lift", "lifting", "運ぶ", "運ん", "運搬", "বহন", "বয়ে"),
    ("gardening", "gardener", "園芸", "বাগান"),
    ("carpentry", "carpenter", "木工", "কাঠমিস্ত্রি"),
    ("tutoring", "tutor", "家庭教師", "টিউশন"),
)
COMMON_WORDS = frozenset(
    [
        "about",
        "again",
        "any",
        "borrow",
        "borrowing",
        "can",
        "could",
        "for",
        "from",
        "have",
        "help",
        "helping",
        "how",
        "into",
        "just",
        "lend",
        "like",
        "need",
        "needed",
        "please",
        "something",
        "that",
        "the",
        "their",
        "them",
        "then",
        "there",
        "this",
        "use",
        "using",
        "want",
        "was",
        "what",
        "when",
        "where",
        "which",
        "who",
        "will",
        "with",
        "would",
        "you",
        "your",
        "জন্য",
        "দরকার",
        "চাই",
        "করতে",
        "এবং",
    ]
)


def _normalize(value: str) -> str:
    return " ".join(
        "".join(
            char if char.isalnum() or category(char).startswith("M") else " "
            for char in normalize("NFKC", value).casefold()
        ).split()
    )


def _contains(text: str, term: str) -> bool:
    return f" {term} " in f" {text} " if term.isascii() else term in text


def matching_terms(text: str) -> list[str]:
    normalized = _normalize(text)
    aliases = [
        term
        for group in EQUIVALENT_TERMS
        if any(_contains(normalized, _normalize(term)) for term in group)
        for term in group
    ]
    keywords = [
        word
        for word in normalized.split()
        if word not in COMMON_WORDS
        and len(word) >= (3 if word.isascii() else 2)
        and not word.isdigit()
    ]
    return list(dict.fromkeys(aliases or keywords))[:16]


def rank_candidates(
    candidates: list[RippleCandidate],
    listings: dict[uuid.UUID, ListingMatch],
    terms: list[str],
    kind: str,
) -> list[RecipientMatch]:
    matches = []
    for candidate in candidates:
        listing = listings.get(candidate.user_id, ListingMatch())
        skills = _normalize(candidate.skills or "")
        profile_match = kind != RequestKind.BORROW and any(
            _contains(skills, _normalize(term)) for term in terms
        )
        availability = "unknown"
        if listing.available_score:
            score = 200 + 10 * listing.available_score
            availability = "available"
        elif profile_match:
            score = 100
        elif listing.unavailable_score:
            score = -200
            availability = "unavailable"
        else:
            score = 0
        score += 2 * max(-10, min(candidate.pair_balance, 10))
        distance = (
            round(candidate.distance_m) if candidate.distance_m is not None else None
        )
        reasons = {
            "listing_availability": availability,
            "listing_match": max(listing.available_score, listing.unavailable_score),
            "profile_skill_match": profile_match,
            "pair_balance": candidate.pair_balance,
            "distance_m": distance,
        }
        matches.append(
            (
                (-score, distance if distance is not None else inf, candidate.user_id),
                RecipientMatch(candidate.user_id, score, reasons),
            )
        )
    matches.sort(key=lambda match: match[0])
    return [
        replace(match, reasons={**match.reasons, "rank": rank})
        for rank, (_, match) in enumerate(matches, start=1)
    ]
