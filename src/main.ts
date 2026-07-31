import { Editor, Notice, Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, PluginSettings } from "./types";
import { ThreadsSaverSettingTab } from "./settings";
import { isThreadsUrl, parseThreadsPost } from "./parser";
import { generateThreadsNoteContent, saveThreadsPostToVault } from "./downloader";

/**
 * Extracts all Threads URLs from a text string.
 */
function extractAllThreadsUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/(www\.)?threads\.(net|com)\/(@[a-zA-Z0-9_.-]+\/post\/[a-zA-Z0-9_.-]+|t\/[a-zA-Z0-9_.-]+|share\/[a-zA-Z0-9_.-]+)/gi);
  return matches ? Array.from(new Set(matches.map((m) => m.trim()))) : [];
}

export default class ThreadsSaverPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  private focusListener: (() => void) | null = null;
  private lastProcessedClipboardUrl = "";
  private processingFiles = new Set<string>();

  async onload() {
    console.log("Loading Threads Saver Plugin");
    await this.loadSettings();

    // 1. Ribbon Icon
    this.addRibbonIcon("at-sign", "Save Threads Post from Clipboard", () => {
      this.handleSaveFromClipboard();
    });

    // 2. Command Palette: Save from Clipboard
    this.addCommand({
      id: "threads-save-from-clipboard",
      name: "Save Threads Post from Clipboard",
      callback: () => this.handleSaveFromClipboard(),
    });

    // 3. Command Palette: Insert at Cursor
    this.addCommand({
      id: "threads-insert-at-cursor",
      name: "Insert Threads Post at Cursor",
      editorCallback: (editor: Editor) => this.handleInsertAtCursor(editor),
    });

    // 4. Command Palette: Convert Threads Links in Active Note
    this.addCommand({
      id: "threads-convert-links-in-active-note",
      name: "Convert Threads Links in Active Note",
      callback: () => this.handleConvertActiveNoteLinks(),
    });

    // 5. Context Menu item for Editor
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        const selectedText = editor.getSelection().trim();
        const cursorLine = editor.getLine(editor.getCursor().line).trim();
        const targetText = selectedText || cursorLine;
        const urls = extractAllThreadsUrls(targetText);

        if (urls.length > 0) {
          menu.addItem((item) => {
            item
              .setTitle("Convert Threads Link")
              .setIcon("at-sign")
              .onClick(async () => {
                await this.processAndReplaceLinkInEditor(editor, urls[0]);
              });
          });
        }
      })
    );

    // 6. Obsidian Protocol Handler for Deep Linking / Mobile Share Intents
    // URL format: obsidian://threads-saver?url=https://www.threads.com/...
    this.registerObsidianProtocolHandler("threads-saver", async (params) => {
      if (params.url) {
        new Notice("Processing Threads URL from share...");
        await this.processAndSaveUrl(params.url);
      }
    });

    // 7. Auto-Enrichment Listener for Mobile Share Sheet (Create & Modify)
    this.registerEvent(
      this.app.vault.on("create", async (file) => {
        if (!this.settings.autoEnrichShareSheetLinks) return;
        if (file instanceof TFile && file.extension === "md") {
          setTimeout(async () => {
            await this.checkAndEnrichShareSheetFile(file);
          }, 400);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        if (!this.settings.autoEnrichShareSheetLinks) return;
        if (file instanceof TFile && file.extension === "md") {
          // Avoid recursion loop on file modification
          if (this.processingFiles.has(file.path)) return;
          setTimeout(async () => {
            await this.checkAndEnrichShareSheetFile(file);
          }, 600);
        }
      })
    );

    // 8. Window Focus Listener for Clipboard Auto-Detect
    this.focusListener = async () => {
      if (!this.settings.clipboardAutoDetect) return;
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          const trimmed = text.trim();
          if (isThreadsUrl(trimmed) && trimmed !== this.lastProcessedClipboardUrl) {
            this.showClipboardNotice(trimmed);
          }
        }
      } catch {
        // Clipboard permission not granted or not focused
      }
    };

    window.addEventListener("focus", this.focusListener);

    // 9. Add Settings Tab
    this.addSettingTab(new ThreadsSaverSettingTab(this.app, this));
  }

  onunload() {
    console.log("Unloading Threads Saver Plugin");
    if (this.focusListener) {
      window.removeEventListener("focus", this.focusListener);
      this.focusListener = null;
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /**
   * Reads clipboard and saves Threads post.
   */
  async handleSaveFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();
      const urls = extractAllThreadsUrls(trimmed);
      if (urls.length === 0) {
        new Notice("Clipboard does not contain a valid Threads URL.");
        return;
      }
      await this.processAndSaveUrl(urls[0]);
    } catch {
      new Notice("Could not read clipboard. Please check app permissions.");
    }
  }

  /**
   * Converts all raw Threads URLs in active note.
   */
  async handleConvertActiveNoteLinks() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice("No active note open.");
      return;
    }

    const content = await this.app.vault.read(activeFile);
    const urls = extractAllThreadsUrls(content);
    if (urls.length === 0) {
      new Notice("No raw Threads URLs found in active note.");
      return;
    }

    new Notice(`Found ${urls.length} Threads URL(s). Processing...`);
    for (const url of urls) {
      await this.processAndSaveUrl(url);
    }
  }

  /**
   * Fetches Threads post and inserts Markdown at active editor cursor.
   */
  async handleInsertAtCursor(editor: Editor) {
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();
      const urls = extractAllThreadsUrls(trimmed);
      if (urls.length === 0) {
        new Notice("Clipboard does not contain a valid Threads URL.");
        return;
      }
      new Notice("Fetching Threads post content...");
      const post = await parseThreadsPost(urls[0], this.settings.sessionCookie, this.settings.customUserAgent);
      const markdown = `> **@${post.authorUsername}**: ${post.content}\n> [Original Post](${post.url})\n`;
      editor.replaceSelection(markdown);
      new Notice("Inserted Threads post into note!");
    } catch (err: any) {
      new Notice(`Error inserting Threads post: ${err.message}`);
    }
  }

  /**
   * Processes a Threads URL and replaces it in current editor.
   */
  async processAndReplaceLinkInEditor(editor: Editor, url: string) {
    new Notice("Fetching Threads post details...");
    try {
      const post = await parseThreadsPost(url, this.settings.sessionCookie, this.settings.customUserAgent);
      const { content } = await generateThreadsNoteContent(this.app, post, this.settings);
      editor.replaceSelection(content);
      new Notice("Converted Threads link into enriched content!");
    } catch (err: any) {
      new Notice(`Failed to convert link: ${err.message}`);
    }
  }

  /**
   * Fetches Threads post and saves to vault.
   */
  async processAndSaveUrl(url: string): Promise<TFile | null> {
    new Notice("Fetching Threads post details...");
    try {
      const post = await parseThreadsPost(url, this.settings.sessionCookie, this.settings.customUserAgent);
      const savedFile = await saveThreadsPostToVault(this.app, post, this.settings);
      this.lastProcessedClipboardUrl = url;

      // Open the newly created note in active leaf
      const leaf = this.app.workspace.getUnpackagedLeaf ? this.app.workspace.getUnpackagedLeaf() : this.app.workspace.getLeaf(false);
      await leaf.openFile(savedFile);
      return savedFile;
    } catch (err: any) {
      console.error("Error processing Threads URL:", err);
      new Notice(`Failed to save Threads post: ${err.message || err}`);
      return null;
    }
  }

  /**
   * Checks if a file contains a raw Threads URL (e.g. from Mobile Share Sheet) and auto-enriches it.
   */
  private async checkAndEnrichShareSheetFile(file: TFile) {
    if (this.processingFiles.has(file.path)) return;
    try {
      const content = await this.app.vault.read(file);
      const urls = extractAllThreadsUrls(content);

      // If file contains only a raw Threads link (e.g., from Android share)
      if (urls.length === 1 && content.trim() === urls[0]) {
        this.processingFiles.add(file.path);
        new Notice("Enriching shared Threads post link...");
        const post = await parseThreadsPost(urls[0], this.settings.sessionCookie, this.settings.customUserAgent);
        await saveThreadsPostToVault(this.app, post, this.settings);
        this.processingFiles.delete(file.path);
      }
    } catch {
      this.processingFiles.delete(file.path);
    }
  }

  /**
   * Shows an interactive toast notice when a Threads link is detected in clipboard on app focus.
   */
  private showClipboardNotice(url: string) {
    const noticeEl = new Notice("", 8000);
    const container = noticeEl.noticeEl.createDiv({ cls: "threads-notice-container" });

    const titleEl = container.createDiv({ cls: "threads-notice-title" });
    titleEl.setText("📌 Threads link detected in clipboard!");

    const actionsEl = container.createDiv({ cls: "threads-notice-actions" });

    const saveBtn = actionsEl.createEl("button", {
      text: "Save to Vault",
      cls: "threads-btn-primary",
    });

    const ignoreBtn = actionsEl.createEl("button", {
      text: "Ignore",
      cls: "threads-btn-secondary",
    });

    saveBtn.addEventListener("click", async () => {
      noticeEl.hide();
      await this.processAndSaveUrl(url);
    });

    ignoreBtn.addEventListener("click", () => {
      this.lastProcessedClipboardUrl = url;
      noticeEl.hide();
    });
  }
}
