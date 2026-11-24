from enum import StrEnum


class UserKind(StrEnum):
    SELF = "self"
    MANAGED = "managed"


class UserStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    DELETED = "deleted"


class Region(StrEnum):
    JP = "jp"
    BD = "bd"


class Language(StrEnum):
    JA = "ja"
    EN = "en"
    BN = "bn"


class AgeBand(StrEnum):
    UNDER_30 = "under_30"
    THIRTIES = "30s"
    FORTIES = "40s"
    FIFTIES = "50s"
    SIXTIES = "60s"
    SEVENTIES = "70s"
    EIGHTY_PLUS = "80_plus"


class Platform(StrEnum):
    IOS = "ios"
    ANDROID = "android"
    WEB = "web"


class CircleUnitType(StrEnum):
    CITY = "city"
    ASSOCIATION = "association"
    HAN = "han"
    PARA = "para"
    MOHOLLA = "moholla"
    BUILDING = "building"


class CircleStatus(StrEnum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class MembershipRole(StrEnum):
    MEMBER = "member"
    LEADER = "leader"
    COORDINATOR = "coordinator"


class MembershipStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    REMOVED = "removed"
    LEFT = "left"


class JoinMethod(StrEnum):
    INVITE = "invite"
    QR = "qr"
    SEARCH = "search"
    SEEDED = "seeded"
    COORDINATOR = "coordinator"


class FamilyRelation(StrEnum):
    PARENT = "parent"
    CHILD = "child"
    SIBLING = "sibling"
    SPOUSE = "spouse"
    GRANDPARENT = "grandparent"
    GRANDCHILD = "grandchild"
    OTHER = "other"


class LinkStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REVOKED = "revoked"


class CaretakerRole(StrEnum):
    FAMILY = "family"
    WELFARE_VOLUNTEER = "welfare_volunteer"
    COORDINATOR = "coordinator"


class ConsentMethod(StrEnum):
    IN_PERSON = "in_person"
    VIA_COORDINATOR = "via_coordinator"
    PHONE_CALL = "phone_call"


class ListingKind(StrEnum):
    TOOL = "tool"
    SKILL = "skill"


class LendMode(StrEnum):
    LEND = "lend"
    HELP_ONLY = "help_only"
    LEND_OR_HELP = "lend_or_help"


class ListingStatus(StrEnum):
    ACTIVE = "active"
    PAUSED = "paused"
    LENT_OUT = "lent_out"
    DELETED = "deleted"


class ListingVisibility(StrEnum):
    HAN = "han"
    ASSOCIATION = "association"
    NEARBY = "nearby"


class MediaKind(StrEnum):
    IMAGE = "image"
    AUDIO = "audio"


class MediaPurpose(StrEnum):
    AVATAR = "avatar"
    LISTING = "listing"
    ASK = "ask"
    REQUEST = "request"
    HANDOVER = "handover"
    CHAT = "chat"
    VOICE = "voice"


class MediaStatus(StrEnum):
    PROCESSING = "processing"
    READY = "ready"
    REJECTED = "rejected"
    DELETED = "deleted"


class MediaVariantName(StrEnum):
    THUMB = "thumb"
    DISPLAY = "display"
    AUDIO = "audio"


class StoredMimeType(StrEnum):
    WEBP = "image/webp"
    JPEG = "image/jpeg"
    PNG = "image/png"
    MP4_AUDIO = "audio/mp4"


class AskInputMode(StrEnum):
    TEXT = "text"
    VOICE = "voice"
    PHOTO = "photo"


class AskStatus(StrEnum):
    CLARIFYING = "clarifying"
    RESULTS = "results"
    DRAFTED = "drafted"
    SENT = "sent"
    ABANDONED = "abandoned"


class RequestKind(StrEnum):
    BORROW = "borrow"
    HELP = "help"
    BORROW_WITH_HELP = "borrow_with_help"


class RippleStage(StrEnum):
    DIRECT = "direct"
    FAMILY = "family"
    HAN = "han"
    ASSOCIATION = "association"
    NEARBY = "nearby"


class RequestTone(StrEnum):
    KEIGO = "keigo"
    POLITE = "polite"
    CASUAL = "casual"


class RequestStatus(StrEnum):
    OPEN = "open"
    MATCHED = "matched"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class ResponseKind(StrEnum):
    OFFER = "offer"
    QUESTION = "question"
    COUNTER_TIME = "counter_time"


class ResponseStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    SUPERSEDED = "superseded"
    WITHDRAWN = "withdrawn"
    EXPIRED = "expired"


class ExchangeMode(StrEnum):
    LOAN = "loan"
    HELP = "help"


class ExchangeStatus(StrEnum):
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    RETURNED = "returned"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    DISPUTED = "disputed"


class DecisionStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"


class HandoverPhase(StrEnum):
    PICKUP = "pickup"
    RETURN = "return"


class ChecklistItemSource(StrEnum):
    LISTING_PART = "listing_part"
    AI = "ai"
    MANUAL = "manual"


class ConversationKind(StrEnum):
    REQUEST = "request"
    LISTING = "listing"
    DIRECT = "direct"


class ConversationStatus(StrEnum):
    OPEN = "open"
    CLOSED = "closed"
    LOCKED = "locked"


class ParticipantRole(StrEnum):
    REQUESTER = "requester"
    RESPONDER = "responder"
    OWNER = "owner"
    ASKER = "asker"
    MEMBER = "member"


class MessageKind(StrEnum):
    TEXT = "text"
    IMAGE = "image"
    VOICE = "voice"
    SYSTEM = "system"
    CARD = "card"


class CardType(StrEnum):
    TIME_PROPOSAL = "time_proposal"
    EXTENSION_REQUEST = "extension_request"
    HANDOVER_CHECK = "handover_check"
    THANK_YOU = "thank_you"


class TranslationStatus(StrEnum):
    NONE = "none"
    PENDING = "pending"
    DONE = "done"
    FAILED = "failed"


class GiftType(StrEnum):
    NOTE = "note"
    SWEETS = "sweets"
    POINTS = "points"
    MONEY = "money"


class MoneyStatus(StrEnum):
    NONE = "none"
    OFFERED = "offered"
    DECLINED = "declined"
    PAID = "paid"
    FAILED = "failed"


class Currency(StrEnum):
    JPY = "JPY"
    BDT = "BDT"


class PaymentProvider(StrEnum):
    STRIPE = "stripe"
    BKASH_MOCK = "bkash_mock"
    NAGAD_MOCK = "nagad_mock"
    CASH = "cash"


class PaymentStatus(StrEnum):
    REQUIRES_PAYMENT = "requires_payment"
    PROCESSING = "processing"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


class PointsReason(StrEnum):
    THANK_YOU = "thank_you"
    WELCOME = "welcome"
    ADJUSTMENT = "adjustment"


class NotificationType(StrEnum):
    REQUEST_NEARBY = "request_nearby"
    REQUEST_DIRECT = "request_direct"
    RESPONSE_RECEIVED = "response_received"
    RESPONSE_ACCEPTED = "response_accepted"
    RESPONSE_SUPERSEDED = "response_superseded"
    MESSAGE = "message"
    REMINDER = "reminder"
    EXTENSION = "extension"
    THANK_YOU = "thank_you"
    MEMBERSHIP_DECIDED = "membership_decided"
    PROXY_GRANTED = "proxy_granted"


class ReportTargetType(StrEnum):
    USER = "user"
    LISTING = "listing"
    MESSAGE = "message"
    REQUEST = "request"


class ReportReason(StrEnum):
    SPAM = "spam"
    HARASSMENT = "harassment"
    UNSAFE = "unsafe"
    SCAM = "scam"
    OTHER = "other"


class ReportStatus(StrEnum):
    OPEN = "open"
    REVIEWING = "reviewing"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class AiFeature(StrEnum):
    POLITE_WRITER = "polite_writer"
    TASK_TO_TOOLS = "task_to_tools"
    PHOTO_LISTING = "photo_listing"
    HANDOVER_CHECKLIST = "handover_checklist"
    THANK_YOU = "thank_you"
    EXTENSION_DRAFT = "extension_draft"
    TRANSLATE = "translate"
    TRANSCRIBE = "transcribe"
    INTRO_CARD = "intro_card"
    TOOL_GUIDE = "tool_guide"


class AiRunStatus(StrEnum):
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class EventStatus(StrEnum):
    SCHEDULED = "scheduled"
    CANCELLED = "cancelled"


class CheckInStatus(StrEnum):
    SAFE = "safe"
    NEED_HELP = "need_help"


class AlertSeverity(StrEnum):
    INFO = "info"
    WARNING = "warning"
    EMERGENCY = "emergency"
