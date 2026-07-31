import type { SocialPlatform } from "./types";

export interface ParsedSocialUrl {
	platform: SocialPlatform;
	canonicalUrl: string;
	id: string;
	kind: string;
	username?: string;
}

export interface SocialUrlMatch {
	raw: string;
	canonicalUrl: string;
	platform: SocialPlatform;
}

const THREADS_HOSTS = new Set([
	"threads.net",
	"www.threads.net",
	"threads.com",
	"www.threads.com",
]);
const INSTAGRAM_HOSTS = new Set([
	"instagram.com",
	"www.instagram.com",
	"instagr.am",
	"www.instagr.am",
]);
const MEDIA_HOST_SUFFIXES = ["cdninstagram.com", "fbcdn.net"];
const ID_PATTERN = /^[A-Za-z0-9_.-]+$/;
const USERNAME_PATTERN = /^[A-Za-z0-9._]+$/;

function safeUrl(value: string): URL | null {
	try {
		if (/[\u0000-\u001F\u007F]/.test(value)) return null;
		const url = new URL(value.trim());
		if (
			url.protocol !== "https:" ||
			url.username ||
			url.password ||
			url.port
		) {
			return null;
		}
		return url;
	} catch {
		return null;
	}
}

export function parseSupportedSocialUrl(value: string): ParsedSocialUrl | null {
	const url = safeUrl(value);
	if (!url) return null;

	const hostname = url.hostname.toLowerCase();
	const segments = url.pathname.split("/").filter(Boolean);

	if (THREADS_HOSTS.has(hostname)) {
		let id: string | undefined;
		let username: string | undefined;
		let kind = "post";

		if (
			segments.length === 3 &&
			segments[0].startsWith("@") &&
			segments[1] === "post"
		) {
			username = segments[0].slice(1);
			id = segments[2];
			if (!USERNAME_PATTERN.test(username)) return null;
		} else if (
			segments.length === 2 &&
			(segments[0] === "t" || segments[0] === "share")
		) {
			kind = segments[0];
			id = segments[1];
		}

		if (!id || !ID_PATTERN.test(id)) return null;
		const path = username
			? `/@${username}/post/${id}`
			: `/${kind}/${id}`;
		return {
			platform: "threads",
			canonicalUrl: `https://www.threads.com${path}`,
			id,
			kind,
			username,
		};
	}

	if (INSTAGRAM_HOSTS.has(hostname)) {
		let kind: string | undefined;
		let id: string | undefined;

		if (
			segments.length === 2 &&
			["p", "reel", "reels", "tv"].includes(segments[0])
		) {
			kind = segments[0] === "reels" ? "reel" : segments[0];
			id = segments[1];
		} else if (
			segments.length === 3 &&
			segments[0] === "share" &&
			segments[1] === "p"
		) {
			kind = "share";
			id = segments[2];
		}

		if (!kind || !id || !ID_PATTERN.test(id)) return null;
		const path = kind === "share" ? `/share/p/${id}` : `/${kind}/${id}`;
		return {
			platform: "instagram",
			canonicalUrl: `https://www.instagram.com${path}`,
			id,
			kind,
		};
	}

	return null;
}

export function isSupportedSocialUrl(value: string): boolean {
	return parseSupportedSocialUrl(value) !== null;
}

function trimUrlPunctuation(candidate: string): string {
	return candidate.replace(/[.,;:!?]+$/g, "").replace(/\)+$/g, (closing) => {
		const openingCount = (candidate.match(/\(/g) ?? []).length;
		const closingCount = (candidate.match(/\)/g) ?? []).length;
		return closing.slice(0, Math.max(0, closingCount - openingCount));
	});
}

export function extractSocialUrlMatches(text: string): SocialUrlMatch[] {
	const candidates = text.match(/https?:\/\/[^\s<>"'`)\]}]+/gi) ?? [];
	const matches: SocialUrlMatch[] = [];

	for (const candidate of candidates) {
		const raw = trimUrlPunctuation(candidate);
		const parsed = parseSupportedSocialUrl(raw);
		if (parsed) {
			matches.push({
				raw,
				canonicalUrl: parsed.canonicalUrl,
				platform: parsed.platform,
			});
		}
	}

	return matches;
}

export function extractAllSocialUrls(text: string): string[] {
	return [
		...new Set(
			extractSocialUrlMatches(text).map((match) => match.canonicalUrl),
		),
	];
}

function hostnameMatchesSuffix(hostname: string, suffix: string): boolean {
	return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

export function validateMediaUrl(value: string): URL | null {
	const url = safeUrl(value);
	if (!url) return null;

	const hostname = url.hostname.toLowerCase();
	const isPlatformHost =
		THREADS_HOSTS.has(hostname) || INSTAGRAM_HOSTS.has(hostname);
	const isCdnHost = MEDIA_HOST_SUFFIXES.some((suffix) =>
		hostnameMatchesSuffix(hostname, suffix),
	);

	return isPlatformHost || isCdnHost ? url : null;
}

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

export function escapeMarkdownText(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/([`*_{}[\]<>#+.!|~-])/g, "\\$1")
		.replace(/\r?\n/g, " ");
}

export function escapeMarkdownUrl(value: string): string {
	return value.replace(/\\/g, "%5C").replace(/\(/g, "%28").replace(/\)/g, "%29");
}

export function yamlString(value: string): string {
	const normalized = value
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
		.replace(/\u2028/g, "\\u2028")
		.replace(/\u2029/g, "\\u2029");
	return JSON.stringify(normalized);
}

export function sanitizeFileName(value: string, fallback = "saved-post"): string {
	const sanitized = value
		.normalize("NFC")
		.replace(/[\\/:*?"<>|#^[\]]/g, "-")
		.replace(/[\u0000-\u001F\u007F]/g, "")
		.replace(/\s+/g, " ")
		.replace(/[. ]+$/g, "")
		.trim()
		.slice(0, 120);
	return sanitized || fallback;
}

export function sanitizeTag(value: string): string {
	return value
		.trim()
		.replace(/^#+/, "")
		.replace(/[\s,#[\]]+/g, "-")
		.replace(/[^A-Za-z0-9_\-/À-ÖØ-öø-ÿğüşöçıİĞÜŞÖÇ]/g, "")
		.replace(/-+/g, "-")
		.replace(/^[-/]+|[-/]+$/g, "");
}
