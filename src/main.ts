import { Editor, Notice, Plugin } from "obsidian";
import { saveSocialPostToVault } from "./downloader";
import { parseSocialPost } from "./parser";
import {
	escapeMarkdownText,
	escapeMarkdownUrl,
	extractAllSocialUrls,
	extractSocialUrlMatches,
	parseSupportedSocialUrl,
} from "./security";
import { ThreadsSaverSettingTab } from "./settings";
import {
	DEFAULT_SETTINGS,
	type PluginSettings,
	type SavedPostResult,
} from "./types";

interface ProcessAndSaveOptions {
	openFile?: boolean;
	showNotices?: boolean;
}

interface LegacyStoredSettings extends Partial<PluginSettings> {
	sessionCookie?: string;
	notesFolder?: string;
}

const SESSION_SECRET_ID = "social-saver-sessionid";

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function inlinePostMarkdown(
	platform: "threads" | "instagram",
	authorUsername: string,
	content: string,
	url: string,
): string {
	const label = platform === "threads" ? "Threads" : "Instagram";
	const quoted = content
		.split(/\r?\n/)
		.map((line) => `> ${escapeMarkdownText(line)}`)
		.join("\n");
	return `> **@${escapeMarkdownText(authorUsername)}** · ${label}\n${quoted}\n> [Original post](${escapeMarkdownUrl(url)})\n`;
}

export default class SocialSaverPlugin extends Plugin {
	settings: PluginSettings = { ...DEFAULT_SETTINGS };
	private focusListener: (() => void) | null = null;
	private lastProcessedClipboardUrl = "";

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addRibbonIcon("archive", "Save social post from clipboard", () => {
			void this.handleSaveFromClipboard();
		});

		this.addCommand({
			id: "social-save-from-clipboard",
			name: "Save Threads or Instagram post from clipboard",
			callback: () => this.handleSaveFromClipboard(),
		});
		this.addCommand({
			id: "social-insert-at-cursor",
			name: "Insert Threads or Instagram post at cursor",
			editorCallback: (editor: Editor) => this.handleInsertAtCursor(editor),
		});
		this.addCommand({
			id: "social-convert-links-in-active-note",
			name: "Process all Threads and Instagram links in active note",
			callback: () => this.handleConvertActiveNoteLinks(),
		});

		// Keep the original command IDs so existing hotkeys continue to work.
		this.addCommand({
			id: "threads-save-from-clipboard",
			name: "Save social post from clipboard (legacy command)",
			callback: () => this.handleSaveFromClipboard(),
		});
		this.addCommand({
			id: "threads-insert-at-cursor",
			name: "Insert social post at cursor (legacy command)",
			editorCallback: (editor: Editor) => this.handleInsertAtCursor(editor),
		});
		this.addCommand({
			id: "threads-convert-links-in-active-note",
			name: "Process social links in active note (legacy command)",
			callback: () => this.handleConvertActiveNoteLinks(),
		});

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor) => {
				const selection = editor.getSelection();
				const lineNumber = editor.getCursor().line;
				const source = selection || editor.getLine(lineNumber);
				const match = extractSocialUrlMatches(source)[0];
				if (!match) return;

				menu.addItem((item) => {
					item
						.setTitle("Convert social post link")
						.setIcon("archive")
						.onClick(() =>
							this.processAndReplaceLinkInEditor(
								editor,
								match.raw,
								match.canonicalUrl,
								Boolean(selection),
								lineNumber,
							),
						);
				});
			}),
		);

		const protocolHandler = async (params: Record<string, string>) => {
			const parsed = params.url
				? parseSupportedSocialUrl(params.url)
				: null;
			if (!parsed) {
				new Notice("Deep link contains an unsupported or unsafe URL.");
				return;
			}
			await this.processAndSaveUrl(parsed.canonicalUrl);
		};
		this.registerObsidianProtocolHandler("social-saver", protocolHandler);
		this.registerObsidianProtocolHandler("threads-saver", protocolHandler);

		this.focusListener = () => {
			if (!this.settings.clipboardAutoDetect) return;
			void this.checkClipboardOnFocus();
		};
		window.addEventListener("focus", this.focusListener);
		this.addSettingTab(new ThreadsSaverSettingTab(this.app, this));
	}

	onunload(): void {
		if (this.focusListener) {
			window.removeEventListener("focus", this.focusListener);
			this.focusListener = null;
		}
	}

	async loadSettings(): Promise<void> {
		const stored = ((await this.loadData()) ?? {}) as LegacyStoredSettings;
		const merged = { ...DEFAULT_SETTINGS } as PluginSettings;
		for (const key of Object.keys(DEFAULT_SETTINGS) as Array<
			keyof PluginSettings
		>) {
			const value = stored[key];
			if (value !== undefined) {
				(merged as unknown as Record<string, unknown>)[key] = value;
			}
		}
		if (stored.notesFolder && !stored.threadsFolder) {
			merged.threadsFolder = stored.notesFolder;
		}
		this.settings = merged;

		if (stored.sessionCookie && !this.getSessionCookie()) {
			this.setSessionCookie(stored.sessionCookie);
		}
		if (stored.sessionCookie || stored.notesFolder) {
			await this.saveSettings();
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	getSessionCookie(): string {
		return this.app.secretStorage.getSecret(SESSION_SECRET_ID) ?? "";
	}

	setSessionCookie(value: string): void {
		this.app.secretStorage.setSecret(SESSION_SECRET_ID, value.trim());
	}

	private async checkClipboardOnFocus(): Promise<void> {
		try {
			const text = await navigator.clipboard.readText();
			const url = extractAllSocialUrls(text)[0];
			if (url && url !== this.lastProcessedClipboardUrl) {
				this.showClipboardNotice(url);
			}
		} catch {
			// Clipboard access may be unavailable until the user grants permission.
		}
	}

	async handleSaveFromClipboard(): Promise<void> {
		try {
			const text = await navigator.clipboard.readText();
			const url = extractAllSocialUrls(text)[0];
			if (!url) {
				new Notice(
					"Clipboard does not contain a supported Threads or Instagram URL.",
				);
				return;
			}
			await this.processAndSaveUrl(url);
		} catch {
			new Notice("Could not read the clipboard. Check Obsidian permissions.");
		}
	}

	async handleConvertActiveNoteLinks(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active note is open.");
			return;
		}

		const initialContent = await this.app.vault.read(activeFile);
		const matches = extractSocialUrlMatches(initialContent);
		const urls = [...new Set(matches.map((match) => match.canonicalUrl))];
		if (urls.length === 0) {
			new Notice("No supported Threads or Instagram URLs found.");
			return;
		}

		const progress = new Notice(`Processing social links: 0/${urls.length}`, 0);
		const saved = new Map<string, SavedPostResult>();
		const failed: string[] = [];
		try {
			for (let index = 0; index < urls.length; index += 1) {
				progress.setMessage(
					`Processing social links: ${index + 1}/${urls.length}`,
				);
				const result = await this.processAndSaveUrl(urls[index], {
					openFile: false,
					showNotices: false,
				});
				if (result) saved.set(urls[index], result);
				else failed.push(urls[index]);
			}

			if (saved.size > 0) {
				await this.app.vault.process(activeFile, (latest) => {
					let updated = latest;
					for (const match of extractSocialUrlMatches(latest)) {
						const result = saved.get(match.canonicalUrl);
						if (!result) continue;
						const noteLink = this.app.fileManager.generateMarkdownLink(
							result.file,
							activeFile.path,
							result.subpath,
						);
						const markdownLink = new RegExp(
							`\\[([^\\]\\n]+)\\]\\(${escapeRegExp(match.raw)}\\)`,
							"g",
						);
						updated = updated.replace(markdownLink, (_full, alias: string) =>
							this.app.fileManager.generateMarkdownLink(
								result.file,
								activeFile.path,
								result.subpath,
								alias,
							),
						);
						updated = updated.split(`<${match.raw}>`).join(noteLink);
						updated = updated.split(match.raw).join(noteLink);
					}
					return updated;
				});
			}
		} finally {
			progress.hide();
		}

		new Notice(
			failed.length === 0
				? `Processed ${saved.size} social link(s).`
				: `Processed ${saved.size}; ${failed.length} failed and remained unchanged.`,
			8000,
		);
	}

	async handleInsertAtCursor(editor: Editor): Promise<void> {
		try {
			const text = await navigator.clipboard.readText();
			const url = extractAllSocialUrls(text)[0];
			if (!url) {
				new Notice(
					"Clipboard does not contain a supported Threads or Instagram URL.",
				);
				return;
			}
			const post = await parseSocialPost(
				url,
				this.getSessionCookie(),
				this.settings.customUserAgent,
			);
			editor.replaceSelection(
				inlinePostMarkdown(
					post.platform,
					post.authorUsername,
					post.content,
					post.url,
				),
			);
			new Notice("Social post inserted.");
		} catch (error) {
			new Notice(`Could not insert post: ${errorMessage(error)}`);
		}
	}

	async processAndReplaceLinkInEditor(
		editor: Editor,
		rawUrl: string,
		canonicalUrl: string,
		hasSelection: boolean,
		lineNumber: number,
	): Promise<void> {
		try {
			const post = await parseSocialPost(
				canonicalUrl,
				this.getSessionCookie(),
				this.settings.customUserAgent,
			);
			const markdown = inlinePostMarkdown(
				post.platform,
				post.authorUsername,
				post.content,
				post.url,
			);
			if (hasSelection) {
				editor.replaceSelection(markdown);
			} else {
				const line = editor.getLine(lineNumber);
				const start = line.indexOf(rawUrl);
				if (start < 0) throw new Error("The link moved before it was replaced.");
				editor.replaceRange(
					markdown.trimEnd(),
					{ line: lineNumber, ch: start },
					{ line: lineNumber, ch: start + rawUrl.length },
				);
			}
			new Notice("Social post link converted.");
		} catch (error) {
			new Notice(`Could not convert link: ${errorMessage(error)}`);
		}
	}

	async processAndSaveUrl(
		url: string,
		options: ProcessAndSaveOptions = {},
	): Promise<SavedPostResult | null> {
		const { openFile = true, showNotices = true } = options;
		const parsed = parseSupportedSocialUrl(url);
		if (!parsed) {
			if (showNotices) new Notice("Unsupported or unsafe social URL.");
			return null;
		}
		if (showNotices) {
			new Notice(
				`Fetching ${parsed.platform === "threads" ? "Threads" : "Instagram"} post…`,
			);
		}

		try {
			const post = await parseSocialPost(
				parsed.canonicalUrl,
				this.getSessionCookie(),
				this.settings.customUserAgent,
			);
			const result = await saveSocialPostToVault(
				this.app,
				post,
				this.settings,
			);
			this.lastProcessedClipboardUrl = parsed.canonicalUrl;
			if (openFile) {
				await this.app.workspace.getLeaf(false).openFile(result.file);
			}
			if (showNotices) {
				new Notice(
					`Saved ${post.platform === "threads" ? "Threads" : "Instagram"} post.`,
				);
			}
			return result;
		} catch (error) {
			console.error("Social Saver could not process the URL:", error);
			if (showNotices) {
				new Notice(`Could not save post: ${errorMessage(error)}`, 8000);
			}
			return null;
		}
	}

	private showClipboardNotice(url: string): void {
		const parsed = parseSupportedSocialUrl(url);
		if (!parsed) return;
		const platform = parsed.platform === "threads" ? "Threads" : "Instagram";
		const notice = new Notice("", 8000);
		const container = notice.noticeEl.createDiv({
			cls: "threads-notice-container",
		});
		container
			.createDiv({ cls: "threads-notice-title" })
			.setText(`${platform} link detected in clipboard`);
		const actions = container.createDiv({ cls: "threads-notice-actions" });
		const save = actions.createEl("button", {
			text: "Save to vault",
			cls: "threads-btn-primary",
		});
		const ignore = actions.createEl("button", {
			text: "Ignore",
			cls: "threads-btn-secondary",
		});
		save.addEventListener("click", () => {
			notice.hide();
			void this.processAndSaveUrl(parsed.canonicalUrl);
		});
		ignore.addEventListener("click", () => {
			this.lastProcessedClipboardUrl = parsed.canonicalUrl;
			notice.hide();
		});
	}
}
