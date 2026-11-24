const inviteCode = /^[A-Za-z0-9_-]{8,32}$/;

export function inviteCodeFromQr(payload: string): string | null {
  const value = payload.trim();
  if (inviteCode.test(value)) return value;

  try {
    const url = new URL(value);
    const tail = url.pathname.split("/").filter(Boolean).at(-1);
    const code =
      url.searchParams.get("invite_code") ??
      url.searchParams.get("code") ??
      tail;
    return code && inviteCode.test(code) ? code : null;
  } catch {
    return null;
  }
}
