import assert from "node:assert/strict";
import test from "node:test";

import { inviteCodeFromQr } from "../src/lib/circle-invite.ts";

test("reads a raw invite code and supported invite links", () => {
  const code = "test_invite-1234";
  assert.equal(inviteCodeFromQr("  " + code + "  "), code);
  assert.equal(inviteCodeFromQr("https://example.com/invites/" + code), code);
  assert.equal(inviteCodeFromQr("otagai://invite?invite_code=" + code), code);
  assert.equal(
    inviteCodeFromQr("https://example.com/invite?code=" + code + "&source=qr"),
    code,
  );
});

test("rejects QR content without a valid invite code", () => {
  for (const value of [
    "",
    "not a code",
    "https://example.com/",
    "https://example.com/?code=short",
  ]) {
    assert.equal(inviteCodeFromQr(value), null);
  }
});
