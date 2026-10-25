import test from "node:test";
import assert from "node:assert/strict";
import { createLatestTextLoader } from "../text-load.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("a slow earlier read cannot replace the latest selected file", async () => {
  const earlier = deferred();
  const latest = deferred();
  const loaded = [];
  const errors = [];
  const loader = createLatestTextLoader(
    (text, filename) => loaded.push({ text, filename }),
    (filename) => errors.push(filename),
  );

  const earlierRead = loader.load(() => earlier.promise, "earlier.jsonl");
  const latestRead = loader.load(() => latest.promise, "latest.jsonl");
  latest.resolve("latest trace");
  assert.equal(await latestRead, true);
  earlier.resolve("earlier trace");
  assert.equal(await earlierRead, false);

  assert.deepEqual(loaded, [{ text: "latest trace", filename: "latest.jsonl" }]);
  assert.deepEqual(errors, []);
});

test("reports a current read failure and ignores a stale read failure", async () => {
  const earlier = deferred();
  const latest = deferred();
  const errors = [];
  const loader = createLatestTextLoader(
    () => {},
    (filename) => errors.push(filename),
  );

  const earlierRead = loader.load(() => earlier.promise, "earlier.jsonl");
  const latestRead = loader.load(() => latest.promise, "latest.jsonl");
  latest.reject(new Error("unreadable"));
  assert.equal(await latestRead, false);
  earlier.reject(new Error("stale unreadable"));
  assert.equal(await earlierRead, false);

  assert.deepEqual(errors, ["latest.jsonl"]);
});

test("invalidation prevents a pending read from restoring cleared content", async () => {
  const pending = deferred();
  const loaded = [];
  const loader = createLatestTextLoader(
    (text) => loaded.push(text),
    () => {},
  );
  const read = loader.load(() => pending.promise, "pending.jsonl");

  loader.invalidate();
  pending.resolve("stale trace");
  assert.equal(await read, false);
  assert.deepEqual(loaded, []);
});
