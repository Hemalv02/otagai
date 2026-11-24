import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  authErrorKey,
  codeInput,
  validCode,
  validEmail,
  validNewPassword,
} from "../src/lib/email-auth.ts";

test("one-time codes preserve a leading zero and accept localized digits", () => {
  assert.equal(codeInput(" ০১২-３４５ "), "012345");
  assert.equal(validCode("012345"), true);
  assert.equal(validCode("01234567"), true);
  assert.equal(validCode("01234"), false);
  assert.equal(validCode("01234567890"), false);
});

test("password reset enforces the signup minimum and confirmation", () => {
  assert.equal(validNewPassword("password-A", "password-A"), true);
  assert.equal(validNewPassword("short", "short"), false);
  assert.equal(validNewPassword("password-A", "password-B"), false);
});

test("email forms reject incomplete addresses", () => {
  assert.equal(validEmail("demo@example.com"), true);
  assert.equal(validEmail("demo@example"), false);
  assert.equal(validEmail("demo @example.com"), false);
});

test("provider failures map to appropriate verification and retry messages", () => {
  assert.equal(authErrorKey("otp_expired"), "invalidAuthCode");
  assert.equal(authErrorKey("over_email_send_rate_limit"), "authRateLimited");
  assert.equal(authErrorKey("same_password"), "samePassword");
  assert.equal(authErrorKey("email_not_confirmed"), "emailUnconfirmed");
  assert.equal(authErrorKey(undefined), "authFailed");
});
