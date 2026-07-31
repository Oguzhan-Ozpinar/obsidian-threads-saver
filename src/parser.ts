import { requestUrl } from "obsidian";
import {
	parseSupportedSocialUrl,
	validateMediaUrl,
} from "./security";
import type {
	SocialMediaItem,
	SocialPlatform,
	SocialPost,
	SocialReplyItem,
} from "./types";

const DEFAULT_USER_AGENT =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const MAX_HTML_BYTES = 10 * 1024 * 1024;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_JSON_SCRIPTS = 40;
const MAX_JSON_NODES = 12_000;
const MAX_JSON_DEPTH = 35;
const MAX_MEDIA_ITEMS = 10;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asObject(value: unknown): JsonObject | null {
	return isObject(value) ? value : null;
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getPath(root: unknown, ...keys: string[]): unknown {
	let current = root;
	for (const key of keys) {
		const object = asObject(current);
		if (!object) return undefined;
		current = object[key];
	}
	return current;
}

function normalizeSessionCookie(value?: string): string | undefined {
	if (!value) return undefined;
	const trimmed = value.trim();
	if (!trimmed || /[\r\n]/.test(trimmed)) return undefined;

	const match = trimmed.match(/(?:^|;\s*)sessionid=([^;\s]+)/i);
	const token = match?.[1] ?? trimmed;
	if (!/^[A-Za-z0-9%._:-]+$/.test(token)) return undefined;
	return `sessionid=${token}`;
}

function mediaKey(url: string): string {
	try {
		const parsed = new URL(url);
		return `${parsed.hostname.toLowerCase()}${parsed.pathname}`;
	} catch {
		return url;
	}
}

function isLikelyPostImage(url: string): boolean {
	const lower = url.toLowerCase();
	return (
		!lower.includes("static.cdninstagram.com") &&
		!lower.includes("rsrc.php") &&
		!lower.includes("profile_pic") &&
		!lower.includes("s150x150")
	);
}

function createMediaCollector(): {
	items: SocialMediaItem[];
	add: (url: string, type: "image" | "video") => void;
} {
	const items: SocialMediaItem[] = [];
	const seen = new Set<string>();

	return {
		items,
		add(url, type) {
			if (items.length >= MAX_MEDIA_ITEMS || !url) return;
			if (type === "image" && !isLikelyPostImage(url)) return;
			const valid = validateMediaUrl(url);
			if (!valid) return;
			const key = `${type}:${mediaKey(valid.toString())}`;
			if (seen.has(key)) return;
			seen.add(key);
			items.push({ url: valid.toString(), type });
		},
	};
}

function bestCandidateUrl(value: unknown): string {
	const candidates = asArray(value)
		.map((item) => asObject(item))
		.filter((item): item is JsonObject => item !== null)
		.sort((a, b) => {
			const aWidth = asNumber(a.width) ?? 0;
			const bWidth = asNumber(b.width) ?? 0;
			return bWidth - aWidth;
		});
	return asString(candidates[0]?.url);
}

function collectMediaFromObject(
	object: JsonObject,
	add: (url: string, type: "image" | "video") => void,
): void {
	const carousel = asArray(object.carousel_media);
	if (carousel.length > 0) {
		for (const rawItem of carousel) {
			const item = asObject(rawItem);
			if (!item) continue;
			const video = bestCandidateUrl(item.video_versions);
			if (video) add(video, "video");
			const image = bestCandidateUrl(
				getPath(item, "image_versions2", "candidates"),
			);
			if (image) add(image, "image");
		}
		return;
	}

	const video = bestCandidateUrl(object.video_versions);
	if (video) add(video, "video");
	const image = bestCandidateUrl(
		getPath(object, "image_versions2", "candidates"),
	);
	if (image) add(image, "image");
}

function walkJson(
	root: unknown,
	visitor: (object: JsonObject) => void,
): void {
	const stack: Array<{ value: unknown; depth: number }> = [
		{ value: root, depth: 0 },
	];
	const ignoredKeys = new Set([
		"profile_pic_url",
		"profile_pic_url_hd",
		"suggested_users",
		"user_recommendations",
		"recs_feed",
		"related_posts",
	]);
	let visited = 0;

	while (stack.length > 0 && visited < MAX_JSON_NODES) {
		const current = stack.pop();
		if (!current || current.depth > MAX_JSON_DEPTH) continue;
		visited += 1;

		if (Array.isArray(current.value)) {
			for (let index = current.value.length - 1; index >= 0; index -= 1) {
				stack.push({
					value: current.value[index],
					depth: current.depth + 1,
				});
			}
			continue;
		}

		const object = asObject(current.value);
		if (!object) continue;
		visitor(object);
		for (const [key, value] of Object.entries(object)) {
			if (!ignoredKeys.has(key) && typeof value === "object" && value) {
				stack.push({ value, depth: current.depth + 1 });
			}
		}
	}
}

function scorePostObject(object: JsonObject, id: string): number {
	let score = 0;
	const objectId =
		asString(object.code) ||
		asString(object.shortcode) ||
		asString(object.pk) ||
		asString(object.id);
	if (objectId === id || objectId.startsWith(`${id}_`)) score += 100;
	if (asString(getPath(object, "caption", "text"))) score += 20;
	if (asString(getPath(object, "user", "username"))) score += 10;
	if (asArray(object.carousel_media).length > 0) score += 10;
	if (asArray(getPath(object, "image_versions2", "candidates")).length > 0)
		score += 5;
	if (asArray(object.video_versions).length > 0) score += 5;
	return score;
}

function extractTimestamp(object: JsonObject): string | undefined {
	const seconds =
		asNumber(object.taken_at) ??
		asNumber(object.device_timestamp) ??
		asNumber(object.created_at);
	if (!seconds) return undefined;
	const milliseconds =
		seconds > 100_000_000_000_000
			? seconds / 1000
			: seconds > 10_000_000_000
				? seconds
				: seconds * 1000;
	const date = new Date(milliseconds);
	return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function getMeta(doc: Document, property: string): string {
	const escaped = property.replace(/"/g, '\\"');
	const element = doc.querySelector(
		`meta[property="${escaped}"], meta[name="${escaped}"]`,
	);
	return element?.getAttribute("content")?.trim() ?? "";
}

function cleanDescription(value: string, platform: SocialPlatform): string {
	let content = value.trim();
	if (platform === "instagram") {
		const quoted = content.match(
			/(?:likes?|comments?).*?\s-\s[^:]+:\s*[“"]([\s\S]*?)[”"]\s*$/i,
		);
		if (quoted?.[1]) content = quoted[1].trim();
	}
	return content;
}

function authorFromMeta(
	title: string,
	description: string,
	fallbackUsername: string,
): { name: string; username: string } {
	const usernameMatch =
		title.match(/\(@([A-Za-z0-9._]+)\)/) ??
		description.match(/@([A-Za-z0-9._]+)/);
	const username = usernameMatch?.[1] ?? fallbackUsername;
	const nameCandidate = title
		.split(/[•|]/)[0]
		.replace(/\(@[^)]+\)/, "")
		.replace(/^@/, "")
		.trim();
	return {
		name: nameCandidate || username || "Unknown author",
		username: username || "unknown",
	};
}

function parseReplyChain(
	jsonRoots: unknown[],
	mainAuthor: string,
): SocialReplyItem[] {
	const replies: SocialReplyItem[] = [];
	const seen = new Set<string>();

	for (const root of jsonRoots) {
		walkJson(root, (object) => {
			const threadItems = asArray(object.thread_items);
			if (threadItems.length < 2) return;

			for (const rawItem of threadItems.slice(1)) {
				const post =
					asObject(getPath(rawItem, "post")) ?? asObject(rawItem);
				if (!post) continue;
				const username = asString(getPath(post, "user", "username"));
				if (
					mainAuthor &&
					username &&
					username.toLowerCase() !== mainAuthor.toLowerCase()
				) {
					continue;
				}

				const content = asString(getPath(post, "caption", "text"));
				const collector = createMediaCollector();
				collectMediaFromObject(post, collector.add);
				const replyId =
					asString(post.pk) ||
					asString(post.id) ||
					`${username}:${content}:${collector.items[0]?.url ?? ""}`;
				if (
					seen.has(replyId) ||
					(!content && collector.items.length === 0)
				) {
					continue;
				}
				seen.add(replyId);
				replies.push({
					authorUsername: username || mainAuthor || "unknown",
					authorName:
						asString(getPath(post, "user", "full_name")) ||
						username ||
						mainAuthor ||
						"Unknown author",
					content,
					media: collector.items,
				});
			}
		});
	}

	return replies.slice(0, 20);
}

export async function parseSocialPost(
	inputUrl: string,
	sessionCookie?: string,
	userProvidedUserAgent?: string,
): Promise<SocialPost> {
	const parsedUrl = parseSupportedSocialUrl(inputUrl);
	if (!parsedUrl) {
		throw new Error("Unsupported or unsafe Threads/Instagram URL.");
	}

	const headers: Record<string, string> = {
		"User-Agent":
			userProvidedUserAgent &&
			userProvidedUserAgent.length <= 300 &&
			!/\r|\n/.test(userProvidedUserAgent)
				? userProvidedUserAgent.trim()
				: DEFAULT_USER_AGENT,
		Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.9",
	};
	const cookie = normalizeSessionCookie(sessionCookie);
	const requestPage = async (cookieHeader?: string) => {
		const requestHeaders = { ...headers };
		if (cookieHeader) requestHeaders.Cookie = cookieHeader;
		const page = await requestUrl({
			url: parsedUrl.canonicalUrl,
			method: "GET",
			headers: requestHeaders,
			throw: false,
		});
		if (page.status !== 200) {
			throw new Error(
				`${parsedUrl.platform === "threads" ? "Threads" : "Instagram"} returned HTTP ${page.status}.`,
			);
		}
		if (page.arrayBuffer.byteLength > MAX_HTML_BYTES) {
			throw new Error("The post page exceeded the safe response-size limit.");
		}
		return page;
	};

	let response = await requestPage();
	let doc = new DOMParser().parseFromString(response.text, "text/html");
	let cookieWasSent = false;
	const initialDescription =
		getMeta(doc, "og:description") || getMeta(doc, "twitter:description");
	const initialImage =
		getMeta(doc, "og:image") || getMeta(doc, "twitter:image");
	const initialLooksLoggedOut =
		/Join Threads to share ideas|Log in with your Instagram/i.test(
			initialDescription,
		) || (!initialDescription && !initialImage);

	// Try public access first so the secret is sent only when it is actually
	// needed. Short/share routes remain cookie-free because they may redirect.
	if (
		cookie &&
		initialLooksLoggedOut &&
		!["share", "t"].includes(parsedUrl.kind)
	) {
		response = await requestPage(cookie);
		doc = new DOMParser().parseFromString(response.text, "text/html");
		cookieWasSent = true;
	}

	const title = getMeta(doc, "og:title") || getMeta(doc, "twitter:title");
	const description =
		getMeta(doc, "og:description") || getMeta(doc, "twitter:description");
	const ogImage = getMeta(doc, "og:image") || getMeta(doc, "twitter:image");
	const ogVideo =
		getMeta(doc, "og:video:secure_url") ||
		getMeta(doc, "og:video") ||
		getMeta(doc, "twitter:player:stream");

	const jsonRoots: unknown[] = [];
	const scriptTags = Array.from(
		doc.querySelectorAll('script[type="application/json"]'),
	).slice(0, MAX_JSON_SCRIPTS);
	for (const script of scriptTags) {
		const scriptText = script.textContent?.trim();
		if (
			!scriptText ||
			new TextEncoder().encode(scriptText).byteLength > MAX_JSON_BYTES ||
			!/(?:thread_items|carousel_media|image_versions2|video_versions|shortcode|caption)/.test(
				scriptText,
			)
		) {
			continue;
		}
		try {
			jsonRoots.push(JSON.parse(scriptText));
		} catch {
			// Meta frequently ships non-post JSON blobs; malformed ones are skipped.
		}
	}

	let bestPost: JsonObject | null = null;
	let bestScore = 0;
	for (const root of jsonRoots) {
		walkJson(root, (object) => {
			const score = scorePostObject(object, parsedUrl.id);
			if (score > bestScore) {
				bestScore = score;
				bestPost = object;
			}
		});
	}

	const fallbackAuthor = authorFromMeta(
		title,
		description,
		parsedUrl.username ?? "",
	);
	const postObject = bestPost as JsonObject | null;
	const authorUsername =
		(postObject
			? asString(getPath(postObject, "user", "username"))
			: "") || fallbackAuthor.username;
	const authorName =
		(postObject
			? asString(getPath(postObject, "user", "full_name"))
			: "") || fallbackAuthor.name;
	const content =
		(postObject
			? asString(getPath(postObject, "caption", "text"))
			: "") ||
		cleanDescription(description, parsedUrl.platform) ||
		"No text content found in post.";

	const collector = createMediaCollector();
	if (postObject) collectMediaFromObject(postObject, collector.add);
	if (ogVideo) collector.add(ogVideo, "video");
	if (ogImage) collector.add(ogImage, "image");

	const genericLandingPage =
		/Join Threads to share ideas|Log in with your Instagram/i.test(content);
	const missingPostData =
		!postObject && !description && !ogImage && !ogVideo;
	if (genericLandingPage || missingPostData) {
		throw new Error(
			cookieWasSent
				? "Meta returned a login page. The saved sessionid may be expired."
				: ["share", "t"].includes(parsedUrl.kind)
					? "Meta returned a login page for a redirecting short/share link. Retry with the direct post URL."
					: "Meta returned a login page. Add a sessionid in Social Saver settings, then retry.",
		);
	}

	return {
		platform: parsedUrl.platform,
		id: parsedUrl.id,
		url: parsedUrl.canonicalUrl,
		authorName,
		authorUsername,
		content,
		media: collector.items,
		replyChain:
			parsedUrl.platform === "threads"
				? parseReplyChain(jsonRoots, authorUsername)
				: undefined,
		timestamp:
			(postObject ? extractTimestamp(postObject) : undefined) ??
			new Date().toISOString(),
	};
}

export async function parseThreadsPost(
	url: string,
	sessionCookie?: string,
	userProvidedUserAgent?: string,
): Promise<SocialPost> {
	const parsed = parseSupportedSocialUrl(url);
	if (parsed?.platform !== "threads") {
		throw new Error("Invalid Threads URL.");
	}
	return parseSocialPost(url, sessionCookie, userProvidedUserAgent);
}

export function extractThreadsPostId(
	url: string,
): { username?: string; postId?: string; shareId?: string } | null {
	const parsed = parseSupportedSocialUrl(url);
	if (parsed?.platform !== "threads") return null;
	return parsed.kind === "share"
		? { shareId: parsed.id }
		: { username: parsed.username, postId: parsed.id };
}

export function isThreadsUrl(url: string): boolean {
	return parseSupportedSocialUrl(url)?.platform === "threads";
}

export async function parseInstagramPost(
	url: string,
	sessionCookie?: string,
	userProvidedUserAgent?: string,
): Promise<SocialPost> {
	const parsed = parseSupportedSocialUrl(url);
	if (parsed?.platform !== "instagram") {
		throw new Error("Invalid Instagram URL.");
	}
	return parseSocialPost(url, sessionCookie, userProvidedUserAgent);
}

export function extractInstagramPostId(url: string): string | null {
	const parsed = parseSupportedSocialUrl(url);
	return parsed?.platform === "instagram" ? parsed.id : null;
}

export function isInstagramUrl(url: string): boolean {
	return parseSupportedSocialUrl(url)?.platform === "instagram";
}
