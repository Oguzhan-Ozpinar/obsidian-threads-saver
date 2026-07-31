import {
	App,
	normalizePath,
	requestUrl,
	TFile,
	TFolder,
} from "obsidian";
import {
	escapeHtml,
	escapeMarkdownText,
	escapeMarkdownUrl,
	sanitizeFileName,
	sanitizeTag,
	validateMediaUrl,
	yamlString,
} from "./security";
import type {
	PluginSettings,
	SavedPostResult,
	SocialMediaItem,
	SocialPost,
} from "./types";

const MAX_MEDIA_ITEMS = 10;
const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_MEDIA_BYTES = 100 * 1024 * 1024;
const DOWNLOAD_CONCURRENCY = 3;
const MIME_EXTENSIONS: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/gif": "gif",
	"video/mp4": "mp4",
};

interface MediaJob {
	item: SocialMediaItem;
	label: string;
	fileStem: string;
}

interface DownloadResult {
	fallbackEmbed: string;
	byteLength: number;
	existingEmbed?: string;
	filePath?: string;
	binary?: ArrayBuffer;
}

function safeVaultPath(value: string, allowEmpty = false): string {
	const raw = value.trim().replace(/\\/g, "/");
	if (!raw && allowEmpty) return "";
	if (
		!raw ||
		raw.startsWith("/") ||
		raw.split("/").some((segment) => segment === "..")
	) {
		throw new Error(`Unsafe vault path: ${value}`);
	}
	return normalizePath(raw);
}

async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
	const normalized = safeVaultPath(folderPath, true);
	if (!normalized || normalized === ".") return;

	const segments = normalized.split("/").filter(Boolean);
	let current = "";
	for (const segment of segments) {
		current = current ? `${current}/${segment}` : segment;
		const existing = app.vault.getAbstractFileByPath(current);
		if (!existing) {
			await app.vault.createFolder(current);
		} else if (!(existing instanceof TFolder)) {
			throw new Error(`A file blocks the folder path: ${current}`);
		}
	}
}

function getHeader(
	headers: Record<string, string>,
	name: string,
): string | undefined {
	const target = name.toLowerCase();
	const entry = Object.entries(headers).find(
		([key]) => key.toLowerCase() === target,
	);
	return entry?.[1];
}

function remoteMediaMarkdown(item: SocialMediaItem, label: string): string {
	const safeUrl = escapeMarkdownUrl(item.url);
	return item.type === "video"
		? `[${escapeMarkdownText(label)}](${safeUrl})`
		: `![${escapeMarkdownText(label)}](${safeUrl})`;
}

async function downloadOneMedia(
	app: App,
	folder: string,
	job: MediaJob,
): Promise<DownloadResult> {
	const validUrl = validateMediaUrl(job.item.url);
	if (!validUrl) {
		return {
			fallbackEmbed: remoteMediaMarkdown(job.item, job.label),
			byteLength: 0,
		};
	}

	try {
		const response = await requestUrl({
			url: validUrl.toString(),
			method: "GET",
			throw: false,
		});
		const contentLength = Number(
			getHeader(response.headers, "content-length") ?? "0",
		);
		if (
			response.status !== 200 ||
			(Number.isFinite(contentLength) && contentLength > MAX_MEDIA_BYTES) ||
			response.arrayBuffer.byteLength > MAX_MEDIA_BYTES
		) {
			return {
				fallbackEmbed: remoteMediaMarkdown(job.item, job.label),
				byteLength: 0,
			};
		}

		const rawContentType =
			getHeader(response.headers, "content-type")?.split(";")[0].trim() ?? "";
		const extension = MIME_EXTENSIONS[rawContentType];
		const expectedPrefix = job.item.type === "video" ? "video/" : "image/";
		if (!extension || !rawContentType.startsWith(expectedPrefix)) {
			return {
				fallbackEmbed: remoteMediaMarkdown(job.item, job.label),
				byteLength: 0,
			};
		}

		const filePath = normalizePath(
			`${folder}/${sanitizeFileName(job.fileStem)}.${extension}`,
		);
		const existing = app.vault.getAbstractFileByPath(filePath);
		if (existing instanceof TFile) {
			return {
				fallbackEmbed: remoteMediaMarkdown(job.item, job.label),
				existingEmbed: `![[${filePath}]]`,
				byteLength: 0,
			};
		}
		if (existing) {
			return {
				fallbackEmbed: remoteMediaMarkdown(job.item, job.label),
				byteLength: 0,
			};
		}

		return {
			fallbackEmbed: remoteMediaMarkdown(job.item, job.label),
			filePath,
			binary: response.arrayBuffer,
			byteLength: response.arrayBuffer.byteLength,
		};
	} catch {
		return {
			fallbackEmbed: remoteMediaMarkdown(job.item, job.label),
			byteLength: 0,
		};
	}
}

function mediaJobs(post: SocialPost, settings: PluginSettings): MediaJob[] {
	const jobs: MediaJob[] = [];
	const append = (items: SocialMediaItem[], prefix: string) => {
		for (const item of items) {
			if (item.type === "video" && !settings.downloadVideos) continue;
			const index = jobs.length + 1;
			jobs.push({
				item,
				label: `${item.type === "video" ? "Video" : "Image"} ${index}`,
				fileStem: `${post.platform}_${post.id}_${prefix}_${index}`,
			});
			if (jobs.length >= MAX_MEDIA_ITEMS) return;
		}
	};

	append(post.media, "post");
	if (settings.unrollThreadChain && post.replyChain) {
		for (let index = 0; index < post.replyChain.length; index += 1) {
			append(post.replyChain[index].media, `reply_${index + 1}`);
			if (jobs.length >= MAX_MEDIA_ITEMS) break;
		}
	}
	return jobs;
}

async function renderMedia(
	app: App,
	post: SocialPost,
	settings: PluginSettings,
): Promise<string[]> {
	if (!settings.includeMedia) return [];
	const jobs = mediaJobs(post, settings);
	if (!settings.downloadMediaLocally) {
		return jobs.map((job) => remoteMediaMarkdown(job.item, job.label));
	}

	const folder = safeVaultPath(
		`${settings.attachmentsFolder}/${post.platform}`,
	);
	await ensureFolderExists(app, folder);

	const embeds: string[] = [];
	let totalBytes = 0;
	for (let start = 0; start < jobs.length; start += DOWNLOAD_CONCURRENCY) {
		const batch = jobs.slice(start, start + DOWNLOAD_CONCURRENCY);
		if (totalBytes >= MAX_TOTAL_MEDIA_BYTES) {
			embeds.push(
				...jobs
					.slice(start)
					.map((job) => remoteMediaMarkdown(job.item, job.label)),
			);
			break;
		}
		const results = await Promise.all(
			batch.map((job) => downloadOneMedia(app, folder, job)),
		);
		for (let index = 0; index < results.length; index += 1) {
			const result = results[index];
			if (result.existingEmbed) {
				embeds.push(result.existingEmbed);
				continue;
			}
			if (totalBytes + result.byteLength > MAX_TOTAL_MEDIA_BYTES) {
				embeds.push(result.fallbackEmbed);
				continue;
			}
			if (result.binary && result.filePath) {
				try {
					await app.vault.createBinary(result.filePath, result.binary);
					totalBytes += result.byteLength;
					embeds.push(`![[${result.filePath}]]`);
				} catch {
					embeds.push(result.fallbackEmbed);
				}
			} else {
				embeds.push(result.fallbackEmbed);
			}
		}
	}
	return embeds;
}

function quoteMarkdown(value: string): string {
	return value
		.split(/\r?\n/)
		.map((line) => `> ${escapeMarkdownText(line)}`)
		.join("\n");
}

function formatReplyChain(post: SocialPost): string {
	if (!post.replyChain?.length) return "";
	const total = post.replyChain.length + 1;
	const lines = [
		"### Thread chain",
		"",
		`#### 1/${total} @${escapeMarkdownText(post.authorUsername)}`,
		quoteMarkdown(post.content),
	];
	for (let index = 0; index < post.replyChain.length; index += 1) {
		const reply = post.replyChain[index];
		lines.push(
			"",
			`#### ${index + 2}/${total} @${escapeMarkdownText(reply.authorUsername)}`,
			quoteMarkdown(reply.content),
		);
	}
	return lines.join("\n");
}

function renderVisualPostCard(
	post: SocialPost,
	formattedDate: string,
	unroll: boolean,
): string {
	const replies = unroll ? post.replyChain ?? [] : [];
	const total = replies.length + 1;
	const platformLabel = post.platform === "threads" ? "Threads" : "Instagram";
	const cards: string[] = [
		'<div class="threads-thread-container">',
		'  <div class="threads-card">',
		'    <div class="threads-card-header">',
		'      <div class="threads-card-user">',
		`        <span class="threads-card-name">${escapeHtml(post.authorName)}</span>`,
		`        <span class="threads-card-username">@${escapeHtml(post.authorUsername)}${total > 1 ? ` • 1/${total}` : ""}</span>`,
		"      </div>",
		`      <span class="threads-card-badge">${platformLabel}</span>`,
		"    </div>",
		`    <div class="threads-card-body">${escapeHtml(post.content).replace(/\r?\n/g, "<br>")}</div>`,
		'    <div class="threads-card-footer">',
		`      <span>${escapeHtml(formattedDate)}</span>`,
		`      <a class="threads-card-link" href="${escapeHtml(post.url)}">Original post ↗</a>`,
		"    </div>",
		"  </div>",
	];

	for (let index = 0; index < replies.length; index += 1) {
		const reply = replies[index];
		cards.push(
			'  <div class="threads-thread-line"></div>',
			'  <div class="threads-card threads-card-reply">',
			'    <div class="threads-card-header">',
			'      <div class="threads-card-user">',
			`        <span class="threads-card-name">${escapeHtml(reply.authorName)}</span>`,
			`        <span class="threads-card-username">@${escapeHtml(reply.authorUsername)} • ${index + 2}/${total}</span>`,
			"      </div>",
			"    </div>",
			`    <div class="threads-card-body">${escapeHtml(reply.content).replace(/\r?\n/g, "<br>")}</div>`,
			"  </div>",
		);
	}
	cards.push("</div>");
	return cards.join("\n");
}

function replaceTemplate(
	template: string,
	values: Record<string, string>,
): string {
	return template.replace(/\{\{([a-z0-9_]+)\}\}/gi, (match, key: string) =>
		Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
	);
}

export async function generateSocialNoteContent(
	app: App,
	post: SocialPost,
	settings: PluginSettings,
): Promise<{ title: string; content: string }> {
	const media = await renderMedia(app, post, settings);
	const date = post.timestamp
		? new Date(post.timestamp).toISOString().split("T")[0]
		: new Date().toISOString().split("T")[0];
	const savedAt = new Date().toISOString();
	const tags = [
		...settings.tags.map(sanitizeTag),
		sanitizeTag(`${post.platform}/${post.authorUsername}`),
	].filter(Boolean);
	const hasThread = Boolean(
		settings.unrollThreadChain && post.replyChain?.length,
	);
	const values: Record<string, string> = {
		platform: post.platform,
		platform_yaml: yamlString(post.platform),
		id: post.id,
		id_yaml: yamlString(post.id),
		author_name: escapeMarkdownText(post.authorName),
		author_display_yaml: yamlString(post.authorName),
		author_username: escapeMarkdownText(post.authorUsername),
		author_username_yaml: yamlString(post.authorUsername),
		url: escapeMarkdownUrl(post.url),
		url_yaml: yamlString(post.url),
		date,
		date_yaml: yamlString(date),
		saved_at: savedAt,
		tags: tags.map((tag) => `  - ${yamlString(tag)}`).join("\n"),
		visual_card: settings.useVisualCard
			? renderVisualPostCard(post, date, settings.unrollThreadChain)
			: "",
		content:
			settings.useVisualCard || hasThread ? "" : quoteMarkdown(post.content),
		media: media.length > 0 ? `### Media\n\n${media.join("\n\n")}` : "",
		reply_chain: settings.unrollThreadChain ? formatReplyChain(post) : "",
	};

	const rawTitle = replaceTemplate(settings.noteTitleTemplate, {
		platform: post.platform,
		author_username: post.authorUsername,
		author_name: post.authorName,
		id: post.id,
	});
	const content = replaceTemplate(settings.noteBodyTemplate, values)
		.replace(/\n{3,}/g, "\n\n")
		.trim()
		.concat("\n");
	return {
		title: sanitizeFileName(rawTitle, `${post.platform}-${post.id}`),
		content,
	};
}

function marker(platform: string, id: string, side: "start" | "end"): string {
	return `<!-- social-saver:${platform}:${id}:${side} -->`;
}

function wrapManagedContent(post: SocialPost, content: string): string {
	const start = marker(post.platform, post.id, "start");
	const end = marker(post.platform, post.id, "end");
	if (!content.startsWith("---\n")) {
		return `${start}\n${content.trim()}\n${end}\n`;
	}
	const frontmatterEnd = content.indexOf("\n---", 4);
	if (frontmatterEnd < 0) {
		return `${start}\n${content.trim()}\n${end}\n`;
	}
	const splitAt = frontmatterEnd + 4;
	return `${content.slice(0, splitAt)}\n${start}\n${content.slice(splitAt).trim()}\n${end}\n`;
}

function stripFrontmatter(content: string): string {
	if (!content.startsWith("---\n")) return content.trim();
	const end = content.indexOf("\n---", 4);
	return end < 0 ? content.trim() : content.slice(end + 4).trim();
}

function replaceManagedBlock(
	existing: string,
	post: SocialPost,
	block: string,
): string | null {
	const start = marker(post.platform, post.id, "start");
	const end = marker(post.platform, post.id, "end");
	const startIndex = existing.indexOf(start);
	const endIndex = existing.indexOf(end, startIndex + start.length);
	if (startIndex < 0 || endIndex < 0) return null;
	return `${existing.slice(0, startIndex)}${block}${existing.slice(endIndex + end.length)}`;
}

function destinationFor(post: SocialPost, settings: PluginSettings): {
	mode: "folder" | "single-file";
	folder: string;
	targetFile: string;
} {
	if (post.platform === "threads") {
		return {
			mode: settings.threadsSaveMode,
			folder: settings.threadsFolder,
			targetFile: settings.threadsTargetFile,
		};
	}
	return {
		mode: settings.instagramSaveMode,
		folder: settings.instagramFolder,
		targetFile: settings.instagramTargetFile,
	};
}

async function nextAvailablePath(
	app: App,
	folder: string,
	title: string,
): Promise<string> {
	const base = normalizePath(`${folder}/${title}.md`);
	if (!app.vault.getAbstractFileByPath(base)) return base;
	for (let index = 2; index < 10_000; index += 1) {
		const candidate = normalizePath(`${folder}/${title} ${index}.md`);
		if (!app.vault.getAbstractFileByPath(candidate)) return candidate;
	}
	throw new Error("Could not find an available note filename.");
}

export async function saveSocialPostToVault(
	app: App,
	post: SocialPost,
	settings: PluginSettings,
): Promise<SavedPostResult> {
	const destination = destinationFor(post, settings);
	const generated = await generateSocialNoteContent(app, post, settings);

	if (destination.mode === "single-file") {
		const targetPath = safeVaultPath(
			destination.targetFile.toLowerCase().endsWith(".md")
				? destination.targetFile
				: `${destination.targetFile}.md`,
		);
		const parent = targetPath.includes("/")
			? targetPath.slice(0, targetPath.lastIndexOf("/"))
			: "";
		await ensureFolderExists(app, parent);

		const heading = `${generated.title} (${post.id})`;
		const managedBlock = `${marker(post.platform, post.id, "start")}\n## ${heading}\n\n${stripFrontmatter(generated.content)}\n${marker(post.platform, post.id, "end")}`;
		const existingTarget = app.vault.getAbstractFileByPath(targetPath);
		let file: TFile;
		if (!existingTarget) {
			const platformLabel =
				post.platform === "threads" ? "Threads" : "Instagram";
			file = await app.vault.create(
				targetPath,
				`# ${platformLabel} archive\n\n${managedBlock}\n`,
			);
		} else if (existingTarget instanceof TFile) {
			file = existingTarget;
			await app.vault.process(existingTarget, (existing) => {
				const replaced = replaceManagedBlock(existing, post, managedBlock);
				return replaced ?? `${existing.trimEnd()}\n\n${managedBlock}\n`;
			});
		} else {
			throw new Error(`The target path is not a Markdown file: ${targetPath}`);
		}
		return { file, subpath: `#${heading}` };
	}

	await ensureFolderExists(app, destination.folder);
	const preferredPath = safeVaultPath(
		`${destination.folder}/${generated.title}.md`,
	);
	const managed = wrapManagedContent(post, generated.content);
	const preferred = app.vault.getAbstractFileByPath(preferredPath);
	if (preferred instanceof TFile) {
		const existing = await app.vault.read(preferred);
		if (
			existing.includes(marker(post.platform, post.id, "start")) &&
			existing.includes(marker(post.platform, post.id, "end"))
		) {
			await app.vault.process(preferred, () => managed);
			return { file: preferred };
		}
	}
	const identityTitle = sanitizeFileName(
		`${generated.title} - ${post.platform}-${post.id}`,
	);
	const identityPath = safeVaultPath(
		`${destination.folder}/${identityTitle}.md`,
	);
	const identityFile = app.vault.getAbstractFileByPath(identityPath);
	if (identityFile instanceof TFile) {
		const existing = await app.vault.read(identityFile);
		if (
			existing.includes(marker(post.platform, post.id, "start")) &&
			existing.includes(marker(post.platform, post.id, "end"))
		) {
			await app.vault.process(identityFile, () => managed);
			return { file: identityFile };
		}
	} else if (!identityFile) {
		return { file: await app.vault.create(identityPath, managed) };
	}
	const path = await nextAvailablePath(
		app,
		destination.folder,
		identityTitle,
	);
	return { file: await app.vault.create(path, managed) };
}

export const generateThreadsNoteContent = generateSocialNoteContent;

export async function saveThreadsPostToVault(
	app: App,
	post: SocialPost,
	settings: PluginSettings,
): Promise<TFile> {
	return (await saveSocialPostToVault(app, post, settings)).file;
}
