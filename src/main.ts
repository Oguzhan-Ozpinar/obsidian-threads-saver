import { Editor, Notice, Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, PluginSettings } from "./types";
import { ThreadsSaverSettingTab } from "./settings";
import { parseThreadsPost } from "./parser";
import { generateThreadsNoteContent, saveThreadsPostToVault } from "./downloader";

interface ProcessAndSaveOptions {
  openFile?: boolean;
  showNotices?: boolean;
}

/**
 * Extracts all Threads URLs from a text string.
 */
function extractAllThreadsUrls(text: string): string[] {
  const matches = text.match(
    /https?:\/\/(www\.)?threads\.(net|com)\/(@[a-zA-Z0-9_.-]+\/post\/[a-zA-Z0-9_.-]+|t\/[a-zA-Z0-9_.-]+|share\/[a-zA-Z0-9_.-]+)(?:[/?#][^\s<>"'`)\]}]*)?/gi
  );
  return matches
    ? Array.from(
        new Set(matches.map((match) => match.replace(/[.,;:!?]+$/g, "")))
      )
    : [];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default class ThreadsSaverPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  private focusListener: (() => void) | null = null;
  private lastProcessedClipboardUrl = "";

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

    // 4. Command Palette: Process All Threads Links in Active Note
    this.addCommand({
      id: "threads-convert-links-in-active-note",
      name: "Process All Threads Links in Active Note",
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

    // 6. Obsidian Protocol Handler for Deep Links / iOS Shortcuts
    // URL format: obsidian://threads-saver?url=https://www.threads.com/...
    this.registerObsidianProtocolHandler("threads-saver", async (params) => {
      if (params.url) {
        new Notice("Processing Threads URL from deep link...");
        await this.processAndSaveUrl(params.url);
      }
    });

    // 7. Window Focus Listener for Clipboard Auto-Detect
    this.focusListener = async () => {
      if (!this.settings.clipboardAutoDetect) return;
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          const urls = extractAllThreadsUrls(text);
          const url = urls[0];
          if (url && url !== this.lastProcessedClipboardUrl) {
            this.showClipboardNotice(url);
          }
        }
      } catch {
        // Clipboard permission not granted or not focused
      }
    };

    window.addEventListener("focus", this.focusListener);

    // 8. Add Settings Tab
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

    const progressNotice = new Notice(
      `Processing Threads links: 0/${urls.length}`,
      0
    );
    const processedFiles = new Map<string, TFile>();
    const failedUrls: string[] = [];

    try {
      for (let index = 0; index < urls.length; index++) {
        const url = urls[index];
        progressNotice.setMessage(
          `Processing Threads links: ${index + 1}/${urls.length}`
        );

        const savedFile = await this.processAndSaveUrl(url, {
          openFile: false,
          showNotices: false,
        });

        if (savedFile) {
          processedFiles.set(url, savedFile);
        } else {
          failedUrls.push(url);
        }
      }

      if (processedFiles.size > 0) {
        await this.app.vault.process(activeFile, (latestContent) => {
          let updatedContent = latestContent;

          for (const [url, savedFile] of processedFiles) {
            const noteLink = this.app.fileManager.generateMarkdownLink(
              savedFile,
              activeFile.path
            );
            const markdownLinkPattern = new RegExp(
              `\\[([^\\]\\n]+)\\]\\(${escapeRegExp(url)}\\)`,
              "g"
            );

            updatedContent = updatedContent.replace(
              markdownLinkPattern,
              (_match, alias: string) =>
                this.app.fileManager.generateMarkdownLink(
                  savedFile,
                  activeFile.path,
                  undefined,
                  alias
                )
            );
            updatedContent = updatedContent
              .split(`<${url}>`)
              .join(noteLink);
            updatedContent = updatedContent.split(url).join(noteLink);
          }

          return updatedContent;
        });
      }
    } catch (err) {
      console.error("Bulk Threads processing stopped:", err);
      new Notice(
        "Bulk processing stopped before the active note could be fully updated.",
        8000
      );
      return;
    } finally {
      progressNotice.hide();
    }

    const processedCount = processedFiles.size;
    const failedCount = failedUrls.length;
    const summary =
      failedCount === 0
        ? `Processed ${processedCount} Threads link(s).`
        : `Processed ${processedCount} Threads link(s); ${failedCount} failed and remained unchanged.`;

    new Notice(summary, 8000);

    if (failedCount > 0) {
      console.error("Failed bulk Threads URLs:", failedUrls);
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
   * Fetches Threads post and saves to vault as a NEW note.
   */
  async processAndSaveUrl(
    url: string,
    options: ProcessAndSaveOptions = {}
  ): Promise<TFile | null> {
    const { openFile = true, showNotices = true } = options;
    if (showNotices) {
      new Notice("Fetching Threads post details...");
    }

    try {
      const post = await parseThreadsPost(url, this.settings.sessionCookie, this.settings.customUserAgent);
      const savedFile = await saveThreadsPostToVault(
        this.app,
        post,
        this.settings,
        { showNotice: showNotices }
      );
      this.lastProcessedClipboardUrl = url;

      if (openFile) {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(savedFile);
      }

      return savedFile;
    } catch (err: any) {
      console.error("Error processing Threads URL:", err);
      if (showNotices) {
        new Notice(`Failed to save Threads post: ${err.message || err}`);
      }
      return null;
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
