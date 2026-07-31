import assert from "node:assert/strict";
import {
	extractInstagramPostId,
	extractThreadsPostId,
	isInstagramUrl,
	isThreadsUrl,
} from "../src/parser";

assert.equal(isInstagramUrl("https://instagram.com/p/ig123"), true);
assert.equal(
	extractInstagramPostId("https://www.instagram.com/reel/reel123/"),
	"reel123",
);
assert.equal(isInstagramUrl("https://instagram.com.evil.example/p/ig123"), false);

assert.equal(
	isThreadsUrl("https://www.threads.com/@alice/post/thread123"),
	true,
);
assert.deepEqual(
	extractThreadsPostId(
		"https://www.threads.com/@alice/post/thread123?utm_source=test",
	),
	{ username: "alice", postId: "thread123" },
);

console.log("Platform parser URL tests passed.");
