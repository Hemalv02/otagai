import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceOnboarding,
  defaultOnboarding,
  finishOnboarding,
  getCircleAccess,
  getLaunchRoute,
  readOnboarding,
} from "../src/lib/onboarding-state.ts";

test("uses welcome for a first launch and sign-in after completion", () => {
  assert.equal(
    getLaunchRoute({ signedIn: false, needsProfile: false, completed: false }),
    "welcome",
  );
  assert.equal(
    getLaunchRoute({ signedIn: false, needsProfile: false, completed: true }),
    "sign-in",
  );
});

test("signed-in users go to the existing account flow regardless of onboarding", () => {
  assert.equal(
    getLaunchRoute({ signedIn: true, needsProfile: true, completed: false }),
    "profile-setup",
  );
  assert.equal(
    getLaunchRoute({ signedIn: true, needsProfile: false, completed: false }),
    "index",
  );
});

test("restores valid saved preferences and keeps completion independent", () => {
  const saved = { completed: false, step: 3, language: "bn", region: "bd" };
  assert.deepEqual(readOnboarding(JSON.stringify(saved)), saved);
  assert.deepEqual(
    readOnboarding(JSON.stringify({ ...saved, completed: true })),
    { ...saved, completed: true },
  );
});

test("falls back safely for missing, corrupt, and invalid stored data", () => {
  for (const raw of [
    null,
    "invalid",
    "null",
    "[]",
    '{"completed":"true","language":"zh","region":"us"}',
  ]) {
    assert.deepEqual(readOnboarding(raw), defaultOnboarding);
  }
});

test("requires each onboarding step in order before sign-in", () => {
  assert.throws(() => advanceOnboarding(defaultOnboarding, 2));
  assert.throws(() => finishOnboarding(defaultOnboarding));
  const story = advanceOnboarding(defaultOnboarding, 1);
  assert.equal(story.step, 2);
  assert.throws(() => finishOnboarding(story));
  const features = advanceOnboarding(story, 2);
  assert.equal(features.step, 3);
  assert.equal(
    getLaunchRoute({
      signedIn: false,
      needsProfile: false,
      completed: features.completed,
    }),
    "welcome",
  );
  assert.equal(finishOnboarding(features).completed, true);
  assert.equal(advanceOnboarding(features, 1).step, 3);
});

test("keeps saved preferences but requires the new walkthrough for legacy completion", () => {
  const legacy = { language: "ja", region: "bd", completed: true };
  assert.deepEqual(readOnboarding(JSON.stringify(legacy)), {
    ...legacy,
    step: 1,
    completed: false,
  });
  assert.equal(
    readOnboarding(JSON.stringify({ ...legacy, step: 2 })).completed,
    false,
  );
});

test("a signed-in profile without an approved circle enters circle setup", () => {
  const account = { signedIn: true, needsProfile: false, completed: true };
  assert.equal(
    getLaunchRoute({ ...account, needsCircle: true }),
    "find-circle",
  );
  assert.equal(
    getLaunchRoute({ ...account, needsProfile: true, needsCircle: true }),
    "profile-setup",
  );
  assert.equal(getLaunchRoute({ ...account, needsCircle: false }), "index");
});

test("an approved circle takes priority over pending or rejected requests", () => {
  assert.equal(getCircleAccess([]), "none");
  assert.equal(getCircleAccess(["rejected", "removed"]), "rejected");
  assert.equal(getCircleAccess(["rejected", "pending"]), "pending");
  assert.equal(getCircleAccess(["pending", "approved"]), "approved");
});
