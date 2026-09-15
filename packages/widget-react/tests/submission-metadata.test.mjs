import assert from "node:assert/strict";
import test from "node:test";
import { withAppVersion } from "../src/submission-metadata.ts";

test("captures the loaded release without an element selection", () => {
  assert.deepEqual(withAppVersion(undefined, "v0.36.0"), { appVersion: "v0.36.0" });
});

test("keeps selector, pin and element diagnostics without mutating them", () => {
  const metadata = { selectors: { css: "#save" }, pinAnchor: { x: 0.5, y: 0.2 }, text: "Save" };
  assert.deepEqual(withAppVersion(metadata, " v0.36.0 "), { ...metadata, appVersion: "v0.36.0" });
  assert.equal(Object.hasOwn(metadata, "appVersion"), false);
});

test("does not invent a release when the host has not supplied one", () => {
  for (const appVersion of [undefined, "", "  "]) {
    assert.equal(withAppVersion(undefined, appVersion), undefined);
  }
});
