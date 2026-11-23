import re
import unicodedata

_MARKDOWN_LINK = re.compile(r"!?\[([^\]\n]{0,200})\]\([^)\s]{0,500}\)")
_ANSI = re.compile(r"\x1b\[[0-9;?]{0,20}[ -/]{0,5}[@-~]")
_TAG = re.compile(r"</?[A-Za-z][^<>\n]{0,200}>")
_SCHEME_URL = re.compile(r"(?i)\b[a-z][a-z0-9+.-]{1,20}://\S*")
_DANGEROUS_SCHEME = re.compile(
    r"(?i)\b(?:javascript|vbscript|data|mailto|file|tel|sms):\S*"
)
_EMAIL = re.compile(r"[\w.+-]{1,64}@[\w.-]{1,255}")
_SCHEMELESS = re.compile(r"(?i)(?<!\S)(?:www\.|//)\S*")
_BARE_DOMAIN = re.compile(
    r"(?i)\b[\w-]{1,63}(?:\.[\w-]{1,63}){0,10}\.[a-z]{2,24}\b(?:[/:?#]\S*)?"
)
_OBFUSCATED_DOT = re.compile(r"\s?[\[({]\s?\.\s?[\])}]\s?")
_EMPHASIS = re.compile(r"\*\*|~~|`")
_HEADING = re.compile(r"^#{1,6}\s+")
_SPACES = re.compile(r"[ \t\f\v]+")
_LINE_BREAKS = "\t\r\n  "


def _strip_unsafe(value: str, keep_newlines: bool) -> str:
    value = unicodedata.normalize("NFKC", value)
    value = _ANSI.sub("", value)
    kept = []
    for char in value:
        if char == "\n" and keep_newlines:
            kept.append(char)
        elif unicodedata.category(char)[0] == "C" or char in _LINE_BREAKS:
            kept.append(" " if char in _LINE_BREAKS else "")
        else:
            kept.append(char)
    return "".join(kept)


def clean_text(value: str | None, limit: int, *, multiline: bool = False) -> str:
    if not value:
        return ""
    value = _strip_unsafe(value[: limit * 4], multiline)
    value = _MARKDOWN_LINK.sub(r"\1", value)
    value = _TAG.sub(" ", value)
    value = _OBFUSCATED_DOT.sub(".", value)
    for pattern in (
        _SCHEME_URL,
        _DANGEROUS_SCHEME,
        _EMAIL,
        _SCHEMELESS,
        _BARE_DOMAIN,
    ):
        value = pattern.sub(" ", value)
    value = _EMPHASIS.sub("", value)
    lines = [
        _HEADING.sub("", _SPACES.sub(" ", line).strip()).strip()
        for line in value.split("\n")
    ]
    if multiline:
        value = "\n".join(line for line in lines if line)
    else:
        value = " ".join(line for line in lines if line)
    return value[:limit].strip()


def clean_list(values: list[str], limit: int, count: int) -> list[str]:
    seen: set[str] = set()
    cleaned: list[str] = []
    for raw in values:
        item = clean_text(raw, limit)
        key = item.casefold()
        if not item or key in seen:
            continue
        seen.add(key)
        cleaned.append(item)
        if len(cleaned) == count:
            break
    return cleaned
