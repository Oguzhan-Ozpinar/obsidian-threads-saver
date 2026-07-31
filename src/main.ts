import { Editor, Notice, Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, PluginSettings } from "./types";
import { ThreadsSaverSettingTab } from "./settings";
import { isThreadsUrl, parseThreadsPost } from "./parser";
import { saveThreadsPostToVault } from "./downloader";

export default class ThreadsSaverPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  private focusListener: (() => void) | null = null;
  private lastProcessedClipboardUrl = "";

  async onload() {
    console.log("Loading Threads Saver Plugin");
    await this.loadSettings();

    // 1. Add Ribbon Icon for mobile/desktop ribbon bar
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

    // 4. Obsidian Protocol Handler for Deep Linking / Mobile Share Intents
    // URL format: obsidian://threads-saver?url=https://www.threads.net/...
    this.registerObsidianProtocolHandler("threads-saver", async (params) => {
      if (params.url) {
        new Notice("Processing Threads URL from share...");
        await this.processAndSaveUrl(params.url);
      }
    });

    // 5. Auto-Enrichment Listener for Mobile Share Sheet
    this.registerEvent(
      this.app.vault.on("create", async (file) => {
        if (!this.settings.autoEnrichShareSheetLinks) return;
        if (file instanceof TFile && file.extension === "md") {
          // Delay briefly to allow file content to flush
          setTimeout(async () => {
            await this.checkAndEnrichShareSheetFile(file);
          }, 300);
        }
      })
    );

    // 6. Window Focus Listener for Pano Algılama (Clipboard Auto-Detect)
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
        // Clipboard read permission ignored or not focused
      }
    };

    window.addEventListener("focus", this.focusListener);

    // 7. Add Settings Tab
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
      if (!isThreadsUrl(trimmed)) {
        new Notice("Clipboard does not contain a valid Threads URL.");
        return;
      }
      await this.processAndSaveUrl(trimmed);
    } catch (err) {
      new Notice("Could not read clipboard. Please check app permissions.");
    }
  }

  /**
   * Fetches Threads post and inserts Markdown at active editor cursor.
   */
  async handleInsertAtCursor(editor: Editor) {
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();
      if (!isThreadsUrl(trimmed)) {
        new Notice("Clipboard does not contain a valid Threads URL.");
        return;
      }
      new Notice("Fetching Threads post content...");
      const post = await parseThreadsPost(trimmed, this.settings.sessionCookie, this.settings.customUserAgent);
      const markdown = `> **@${post.authorUsername}**: ${post.content}\n> [Original Post](${post.url})\n`;
      editor.replaceSelection(markdown);
      new Notice("Inserted Threads post into note!");
    } catch (err: any) {
      new Notice(`Error inserting Threads post: ${err.message}`);
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
   * Checks if a newly created note contains only a Threads link (e.g. from Share Sheet) and enriches it.
   */
  private async checkAndEnrichShareSheetFile(file: TFile) {
    try {
      const content = await this.app.vault.read(file);
      const trimmed = content.trim();
      if (isThreadsUrl(trimmed)) {
        new Notice("Enriching shared Threads post link...");
        const post = await parseThreadsPost(trimmed, this.settings.sessionCookie, this.settings.customUserAgent);
        await saveThreadsPostToVault(this.app, post, this.settings);
        // Clean up or delete raw link temporary file if saved to specified folder
      }
    } catch {
      // Ignore non-threads or locked files
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
