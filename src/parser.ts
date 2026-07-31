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

export type JsonObject = Record<string, unknown>;

export interface ParseSocialPostOptions {
	fetchVideos?: boolean;
}

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

export function collectMediaFromObject(
	object: JsonObject,
	add: (url: string, type: "image" | "video") => void,
): void {
	const carousel = asArray(object.carousel_media);
	if (carousel.length > 0) {
		for (const rawItem of carousel) {
			const item = asObject(rawItem);
			if (!item) continue;
			const video = bestCandidateUrl(item.video_versions);
			if (video) {
				add(video, "video");
			} else {
				const image = bestCandidateUrl(
					getPath(item, "image_versions2", "candidates"),
				);
				if (image) add(image, "image");
			}
		}
		return;
	}

	const video = bestCandidateUrl(object.video_versions);
	if (video) {
		add(video, "video");
	} else {
		const image = bestCandidateUrl(
			getPath(object, "image_versions2", "candidates"),
		);
		if (image) add(image, "image");
	}
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
	const objectId =
		asString(object.code) ||
		asString(object.shortcode) ||
		asString(object.pk) ||
		asString(object.id);
	const matchesId = objectId === id || objectId.startsWith(`${id}_`);
	if (!matchesId) return 0;

	let score = 100;
	let contentSignals = 0;
	if (asString(getPath(object, "caption", "text"))) score += 20;
	if (asString(getPath(object, "caption", "text"))) contentSignals += 1;
	if (
		asString(getPath(object, "user", "username")) ||
		asString(getPath(object, "owner", "username")) ||
		asString(object.username)
	) {
		score += 10;
		contentSignals += 1;
	}
	if (asArray(object.carousel_media).length > 0) {
		score += 10;
		contentSignals += 1;
	}
	if (asArray(getPath(object, "image_versions2", "candidates")).length > 0) {
		score += 5;
		contentSignals += 1;
	}
	if (asArray(object.video_versions).length > 0) {
		score += 5;
		contentSignals += 1;
	}
	return contentSignals > 0 ? score : 1;
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

export function extractInstagramUsernameFromMetaUrl(
	value: string,
	expectedId: string,
): string {
	try {
		const url = new URL(value);
		const hostname = url.hostname.toLowerCase();
		if (
			url.protocol !== "https:" ||
			!["instagram.com", "www.instagram.com"].includes(hostname)
		) {
			return "";
		}
		const segments = url.pathname.split("/").filter(Boolean);
		if (
			segments.length >= 3 &&
			["p", "reel", "reels", "tv"].includes(segments[1]) &&
			segments[2] === expectedId &&
			/^[A-Za-z0-9._]+$/.test(segments[0])
		) {
			return segments[0];
		}
	} catch {
		// Invalid metadata URL.
	}
	return "";
}

export function extractInstagramEmbedVideoUrls(html: string): string[] {
	const urls: string[] = [];
	const seen = new Set<string>();
	const addDecodedUrl = (decoded: unknown): void => {
		if (typeof decoded !== "string") return;
		const valid = validateMediaUrl(decoded);
		if (!valid) return;
		const normalized = valid.toString();
		if (seen.has(normalized)) return;
		seen.add(normalized);
		urls.push(normalized);
	};
	const directPattern = /"video_url":("(?:\\.|[^"\\])*")/g;
	let directMatch: RegExpExecArray | null;
	while (
		urls.length < MAX_MEDIA_ITEMS &&
		(directMatch = directPattern.exec(html)) !== null
	) {
		try {
			addDecodedUrl(JSON.parse(directMatch[1]) as unknown);
		} catch {
			// Ignore malformed ServerJS string literals.
		}
	}

	const escapedPattern =
		/\\"video_url\\":\\"((?:\\\\.|[^"\\])*)\\"/g;
	let escapedMatch: RegExpExecArray | null;
	while (
		urls.length < MAX_MEDIA_ITEMS &&
		(escapedMatch = escapedPattern.exec(html)) !== null
	) {
		let decoded = escapedMatch[1];
		for (let pass = 0; pass < 2; pass += 1) {
			try {
				decoded = JSON.parse(
					`"${decoded.replace(/"/g, '\\"')}"`,
				) as string;
			} catch {
				decoded = "";
				break;
			}
		}
		addDecodedUrl(decoded);
	}

	return urls;
}

export function authorFromMeta(
	title: string,
	description: string,
	fallbackUsername: string,
): { name: string; username: string } {
	const usernameMatch =
		title.match(/\(@([A-Za-z0-9._]+)\)/) ??
		description.match(/@([A-Za-z0-9._]+)/);
	const username = usernameMatch?.[1] ?? fallbackUsername;
	const instagramName = title.match(/^(.+?)\s+on Instagram(?::|$)/i)?.[1];
	const nameCandidate =
		instagramName?.trim() ||
		title
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
	options: ParseSocialPostOptions = {},
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
	const fetchVideos = options.fetchVideos ?? true;
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
	const initialLooksLoggedOut =
		/Join Threads to share ideas|Log in with your Instagram/i.test(
			initialDescription,
		) || !initialDescription;

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

	const title =
		parsedUrl.platform === "instagram"
			? getMeta(doc, "twitter:title") || getMeta(doc, "og:title")
			: getMeta(doc, "og:title") || getMeta(doc, "twitter:title");
	const description =
		getMeta(doc, "og:description") || getMeta(doc, "twitter:description");
	const canonicalMetaUrl = getMeta(doc, "og:url");
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

	const bestMatch: { post: JsonObject | null; score: number } = {
		post: null,
		score: 0,
	};
	for (const root of jsonRoots) {
		walkJson(root, (object) => {
			const score = scorePostObject(object, parsedUrl.id);
			if (score > bestMatch.score) {
				bestMatch.score = score;
				bestMatch.post = object;
			}
		});
	}

	const metaUsername =
		parsedUrl.platform === "instagram"
			? extractInstagramUsernameFromMetaUrl(
					canonicalMetaUrl,
					parsedUrl.id,
				)
			: "";
	const fallbackAuthor = authorFromMeta(
		title,
		description,
		metaUsername || parsedUrl.username || "",
	);
	const postObject =
		bestMatch.score >= 100 && bestMatch.post ? bestMatch.post : null;
	const authorUsername =
		(postObject
			? asString(getPath(postObject, "user", "username")) ||
				asString(getPath(postObject, "owner", "username")) ||
				asString(postObject.username)
			: "") ||
		metaUsername ||
		fallbackAuthor.username;
	const authorName =
		(postObject
			? asString(getPath(postObject, "user", "full_name")) ||
				asString(getPath(postObject, "owner", "full_name"))
			: "") || fallbackAuthor.name;
	const content =
		(postObject
			? asString(getPath(postObject, "caption", "text"))
			: "") ||
		cleanDescription(description, parsedUrl.platform) ||
		"No text content found in post.";

	const collector = createMediaCollector();
	const addRequestedMedia = (
		url: string,
		type: "image" | "video",
	): void => {
		if (type === "video" && !fetchVideos) return;
		collector.add(url, type);
	};
	if (postObject) collectMediaFromObject(postObject, addRequestedMedia);
	if (ogVideo && fetchVideos) collector.add(ogVideo, "video");

	if (
		fetchVideos &&
		parsedUrl.platform === "instagram" &&
		parsedUrl.kind === "reel" &&
		!collector.items.some((item) => item.type === "video")
	) {
		try {
			const embedResponse = await requestUrl({
				url: `https://www.instagram.com/reel/${parsedUrl.id}/embed/`,
				method: "GET",
				headers,
				throw: false,
			});
			if (
				embedResponse.status === 200 &&
				embedResponse.arrayBuffer.byteLength <= MAX_HTML_BYTES
			) {
				for (const videoUrl of extractInstagramEmbedVideoUrls(
					embedResponse.text,
				)) {
					collector.add(videoUrl, "video");
				}
			}
		} catch {
			// Keep the public cover as a fallback when Instagram blocks embed data.
		}
	}

	if (
		ogImage &&
		(!fetchVideos ||
			!(
				parsedUrl.platform === "instagram" &&
				collector.items.some((item) => item.type === "video")
			))
	) {
		collector.add(ogImage, "image");
	}

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
