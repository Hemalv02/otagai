from dataclasses import dataclass
from typing import Literal

from app.database.models.enums import CircleUnitType, Currency, Language, Region


@dataclass(frozen=True)
class CulturePack:
    name: Literal["japan", "bangladesh"]
    timezone: str
    circle_units: tuple[CircleUnitType, ...]
    languages: tuple[Language, ...]
    currency: Currency
    demo_payment_provider: str
    asking_style: str
    thank_you_custom: str
    intermediaries: tuple[str, ...]
    local_events: tuple[str, ...]


CULTURE_PACKS = {
    Region.JP: CulturePack(
        name="japan",
        timezone="Asia/Tokyo",
        circle_units=(
            CircleUnitType.HAN,
            CircleUnitType.ASSOCIATION,
            CircleUnitType.BUILDING,
        ),
        languages=(Language.JA, Language.EN, Language.VI, Language.BN),
        currency=Currency.JPY,
        demo_payment_provider="Stripe",
        asking_style="Keep requests low-pressure, with keigo for elders and familiar wording for close family.",
        thank_you_custom="A modest orei such as a note or sweets.",
        intermediaries=(
            "association leader",
            "welfare volunteer",
            "life-support coordinator",
        ),
        local_events=("matsuri", "neighbourhood cleaning", "disaster drill"),
    ),
    Region.BD: CulturePack(
        name="bangladesh",
        timezone="Asia/Dhaka",
        circle_units=(
            CircleUnitType.PARA,
            CircleUnitType.MOHOLLA,
            CircleUnitType.BUILDING,
        ),
        languages=(Language.BN, Language.EN),
        currency=Currency.BDT,
        demo_payment_provider="bKash",
        asking_style="Be direct and respectful. In Bengali use appropriate respectful address without guessing someone's age or gender.",
        thank_you_custom="A warm thank-you or optional mishti.",
        intermediaries=("building secretary", "samaj committee", "ward member"),
        local_events=("Eid", "Pohela Boishakh", "Shab-e-Barat"),
    ),
}


def culture_pack_for(region: str) -> CulturePack:
    return CULTURE_PACKS[Region(region)]
