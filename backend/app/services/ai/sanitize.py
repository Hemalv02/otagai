import re
import unicodedata

_MARKDOWN_LINK = re.compile(r"!?\[([^\]]*)\]\([^)]*\)")
_TAG = re.compile(r"<[^>]*>?")
_URL = re.compile(r"(?i)\b(?:[a-z][a-z0-9+.-]*://|www\.)\S*")
_ANSI = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")
_SPACES = re.compile(r"[ \t\f\v]+")


def _strip_unsafe(value: str, keep_newlines: bool) -> str:
    value = unicodedata.normalize("NFKC", value)
    value = _ANSI.sub("", value)
    kept = []
    for char in value:
        if char == "\n" and keep_newlines:
            kept.append(char)
        elif unicodedata.category(char)[0] == "C" or char in "\r  ":
            kept.append(" " if char in "\t\r\n  " else "")
        else:
            kept.append(char)
    return "".join(kept)


def clean_text(value: str | None, limit: int, *, multiline: bool = False) -> str:
    if not value:
        return ""
    value = _strip_unsafe(value, multiline)
    value = _MARKDOWN_LINK.sub(r"\1", value)
    value = _TAG.sub(" ", value)
    value = _URL.sub(" ", value)
    value = value.replace("<", "").replace(">", "")
    lines = [_SPACES.sub(" ", line).strip() for line in value.split("\n")]
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
