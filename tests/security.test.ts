import assert from "node:assert/strict";
import {
	escapeHtml,
	escapeMarkdownText,
	extractAllSocialUrls,
	extractSocialUrlMatches,
	parseSupportedSocialUrl,
	sanitizeFileName,
	validateMediaUrl,
	yamlString,
} from "../src/security";

const threads = parseSupportedSocialUrl(
	"https://threads.net/@hello.world/post/AbC_123?x=1#ignored",
);
assert.deepEqual(threads, {
	platform: "threads",
	canonicalUrl: "https://www.threads.com/@hello.world/post/AbC_123",
	id: "AbC_123",
	kind: "post",
	username: "hello.world",
});

const instagram = parseSupportedSocialUrl(
	"https://instagr.am/reels/CODE-123/?utm_source=test",
);
assert.deepEqual(instagram, {
	platform: "instagram",
	canonicalUrl: "https://www.instagram.com/reel/CODE-123",
	id: "CODE-123",
	kind: "reel",
});

const share = parseSupportedSocialUrl("https://www.instagram.com/share/p/xyz_1/");
assert.equal(share?.kind, "share");
assert.equal(share?.id, "xyz_1");

for (const unsafe of [
	"http://threads.net/@user/post/abc",
	"https://threads.com.evil.example/@user/post/abc",
	"https://evil.example/https://threads.net/@user/post/abc",
	"https://user:pass@threads.net/@user/post/abc",
	"https://threads.net:444/@user/post/abc",
	"https://threads.net/@user/post/abc\nX-Test: injected",
	"https://instagram.com/explore/",
]) {
	assert.equal(parseSupportedSocialUrl(unsafe), null, unsafe);
}

assert.deepEqual(
	extractAllSocialUrls(
		"One https://threads.net/t/abc?x=1 and https://instagram.com/p/xyz/.",
	),
	[
		"https://www.threads.com/t/abc",
		"https://www.instagram.com/p/xyz",
	],
);
assert.equal(
	extractSocialUrlMatches("https://instagr.am/p/xyz/?utm_source=a")[0].raw,
	"https://instagr.am/p/xyz/?utm_source=a",
);

assert.ok(
	validateMediaUrl(
		"https://scontent.cdninstagram.com/v/t51.123/photo.jpg?token=private",
	),
);
assert.equal(
	validateMediaUrl("https://cdninstagram.com.evil.example/photo.jpg"),
	null,
);
assert.equal(validateMediaUrl("https://example.com/photo.jpg"), null);

assert.equal(escapeHtml('<img src=x onerror="x">'), "&lt;img src=x onerror=&quot;x&quot;&gt;");
assert.equal(
	escapeMarkdownText("[link](javascript:alert(1))"),
	"\\[link\\](javascript:alert(1))",
);
assert.equal(yamlString('"\nadmin: true'), '"\\"\\nadmin: true"');
assert.equal(sanitizeFileName("../../A:B*?"), "..-..-A-B--");

console.log("Security tests passed.");
