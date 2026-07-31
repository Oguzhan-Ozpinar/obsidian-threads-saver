import assert from "node:assert/strict";
import type { App } from "obsidian";
import { TFile, TFolder } from "obsidian";
import {
	generateSocialNoteContent,
	saveSocialPostToVault,
} from "../src/downloader";
import { DEFAULT_SETTINGS, type SocialPost } from "../src/types";

const maliciousPost: SocialPost = {
	platform: "threads",
	id: "abc123",
	url: "https://www.threads.com/@alice/post/abc123",
	authorName: 'Alice\n---\nadmin: true <img src=x onerror="alert(1)">',
	authorUsername: "alice",
	content: '</div><script>alert("x")</script>\n[click](javascript:alert(1))',
	media: [],
	timestamp: "2026-07-31T00:00:00.000Z",
};
const safeSettings = {
	...DEFAULT_SETTINGS,
	includeMedia: false,
	useVisualCard: true,
};
const generated = await generateSocialNoteContent(
	{} as App,
	maliciousPost,
	safeSettings,
);
assert.ok(!generated.content.includes("<script>"));
assert.ok(generated.content.includes("&lt;script&gt;"));
assert.ok(generated.content.includes("\\n---\\nadmin: true"));
assert.ok(!generated.title.includes("<"));

const preferredPath = "Threads/threads - alice - abc123.md";
const userFile = new TFile(preferredPath);
const folders = new Map<string, TFolder>([["Threads", new TFolder("Threads")]]);
const files = new Map<string, TFile>([[preferredPath, userFile]]);
const contents = new Map<string, string>([[preferredPath, "# My private note\n"]]);
const createdPaths: string[] = [];

const mockApp = {
	vault: {
		getAbstractFileByPath(path: string) {
			return files.get(path) ?? folders.get(path) ?? null;
		},
		async createFolder(path: string) {
			const folder = new TFolder(path);
			folders.set(path, folder);
			return folder;
		},
		async read(file: TFile) {
			return contents.get(file.path) ?? "";
		},
		async process(file: TFile, update: (value: string) => string) {
			contents.set(file.path, update(contents.get(file.path) ?? ""));
			return contents.get(file.path) ?? "";
		},
		async create(path: string, content: string) {
			const file = new TFile(path);
			files.set(path, file);
			contents.set(path, content);
			createdPaths.push(path);
			return file;
		},
		async createBinary() {
			throw new Error("Media should be disabled in this test.");
		},
	},
} as unknown as App;

const saved = await saveSocialPostToVault(
	mockApp,
	maliciousPost,
	safeSettings,
);
assert.equal(contents.get(preferredPath), "# My private note\n");
assert.equal(
	saved.file.path,
	"Threads/threads - alice - abc123 - threads-abc123.md",
);
assert.deepEqual(createdPaths, [
	"Threads/threads - alice - abc123 - threads-abc123.md",
]);

const firstManagedContent = contents.get(saved.file.path);
assert.ok(firstManagedContent?.includes("social-saver:threads:abc123:start"));
maliciousPost.content = "Updated, still safe.";
const updated = await saveSocialPostToVault(
	mockApp,
	maliciousPost,
	safeSettings,
);
assert.equal(updated.file.path, saved.file.path);
assert.ok(contents.get(saved.file.path)?.includes("Updated, still safe"));
assert.equal(createdPaths.length, 1);

const instagramPost: SocialPost = {
	platform: "instagram",
	id: "reel123",
	url: "https://www.instagram.com/reel/reel123",
	authorName: "Bob",
	authorUsername: "bob",
	content: "First Reel caption",
	media: [],
	timestamp: "2026-07-31T00:00:00.000Z",
};
const archiveSettings = {
	...safeSettings,
	instagramSaveMode: "single-file" as const,
	instagramTargetFile: "Social/Instagram.md",
};
const archived = await saveSocialPostToVault(
	mockApp,
	instagramPost,
	archiveSettings,
);
assert.equal(archived.file.path, "Social/Instagram.md");
assert.ok(archived.subpath?.startsWith("#"));
instagramPost.content = "Updated Reel caption";
await saveSocialPostToVault(mockApp, instagramPost, archiveSettings);
const archiveContent = contents.get("Social/Instagram.md") ?? "";
assert.equal(
	archiveContent.match(/social-saver:instagram:reel123:start/g)?.length,
	1,
);
assert.ok(archiveContent.includes("Updated Reel caption"));
assert.ok(!archiveContent.includes("First Reel caption"));

console.log("Content and data-integrity tests passed.");
