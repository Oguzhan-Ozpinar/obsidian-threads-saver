import assert from "node:assert/strict";
import {
	authorFromMeta,
	collectMediaFromObject,
	extractInstagramEmbedVideoUrls,
	extractInstagramUsernameFromMetaUrl,
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
	extractInstagramUsernameFromMetaUrl(
		"https://www.instagram.com/hulpmedet/reel/reel123/",
		"reel123",
	),
	"hulpmedet",
);
assert.equal(
	extractInstagramUsernameFromMetaUrl(
		"https://www.instagram.com.evil.example/hulpmedet/reel/reel123/",
		"reel123",
	),
	"",
);
assert.deepEqual(
	authorFromMeta(
		'Hulp Medet Intercontinental on Instagram: "caption"',
		"",
		"hulpmedet",
	),
	{
		name: "Hulp Medet Intercontinental",
		username: "hulpmedet",
	},
);

const reelMedia: Array<{ url: string; type: "image" | "video" }> = [];
collectMediaFromObject(
	{
		video_versions: [
			{
				url: "https://scontent.cdninstagram.com/reel.mp4",
				width: 1080,
			},
		],
		image_versions2: {
			candidates: [
				{
					url: "https://scontent.cdninstagram.com/reel-cover.jpg",
					width: 1080,
				},
			],
		},
	},
	(url, type) => reelMedia.push({ url, type }),
);
assert.deepEqual(reelMedia, [
	{
		url: "https://scontent.cdninstagram.com/reel.mp4",
		type: "video",
	},
]);
const embedVideoUrls = extractInstagramEmbedVideoUrls(
	'<script>{"video_url":"https:\\/\\/instagram.fsaw6-1.fna.fbcdn.net\\/reel.mp4?x=1\\u0026y=2"}</script>' +
		'<script>{"video_url":"https:\\/\\/example.com\\/tracking.mp4"}</script>' +
		'<script>{\\"video_url\\":\\"https:\\\\\\/\\\\\\/scontent.cdninstagram.com\\\\\\/second.mp4\\"}</script>',
);
assert.deepEqual(embedVideoUrls, [
	"https://instagram.fsaw6-1.fna.fbcdn.net/reel.mp4?x=1&y=2",
	"https://scontent.cdninstagram.com/second.mp4",
]);
assert.deepEqual(
	authorFromMeta(
		"Hulp Medet Intercontinental (@hulpmedet) • Instagram reel",
		"",
		"",
	),
	{
		name: "Hulp Medet Intercontinental",
		username: "hulpmedet",
	},
);

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
