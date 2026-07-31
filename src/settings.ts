import { App, PluginSettingTab, Setting } from "obsidian";
import type ThreadsSaverPlugin from "./main";
import { DEFAULT_NOTE_BODY_TEMPLATE } from "./types";

export class ThreadsSaverSettingTab extends PluginSettingTab {
  plugin: ThreadsSaverPlugin;

  constructor(app: App, plugin: ThreadsSaverPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Threads Saver Settings" });

    new Setting(containerEl)
      .setName("Session Cookie (sessionid)")
      .setDesc("Threads.net requires a logged-in session cookie to fetch full post content and images. Open threads.net in browser -> Application/Storage -> Cookies -> copy 'sessionid' value.")
      .addText((text) =>
        text
          .setPlaceholder("e.g. 6428412345%3A...")
          .setValue(this.plugin.settings.sessionCookie)
          .onChange(async (value) => {
            this.plugin.settings.sessionCookie = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Visual Threads Card")
      .setDesc("Render a styled HTML/CSS card in native Threads UI layout at the top of the note (default: OFF).")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useVisualCard)
          .onChange(async (value) => {
            this.plugin.settings.useVisualCard = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Unroll Thread Chain")
      .setDesc("Fetch and combine sequential reply posts written by the same author into a single unrolled note.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.unrollThreadChain)
          .onChange(async (value) => {
            this.plugin.settings.unrollThreadChain = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Include Media")
      .setDesc("Include post images and media attachments in saved notes.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeMedia)
          .onChange(async (value) => {
            this.plugin.settings.includeMedia = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Download Media Locally")
      .setDesc("Download post images into your vault so image links never break when Instagram CDN links expire.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.downloadMediaLocally)
          .onChange(async (value) => {
            this.plugin.settings.downloadMediaLocally = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Clipboard Auto-Detect")
      .setDesc("Show a quick Toast notification to save Threads link when switching back to Obsidian with a Threads URL in clipboard.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.clipboardAutoDetect)
          .onChange(async (value) => {
            this.plugin.settings.clipboardAutoDetect = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Notes Folder")
      .setDesc("Vault folder where saved Threads posts will be created as Markdown notes.")
      .addText((text) =>
        text
          .setPlaceholder("Threads")
          .setValue(this.plugin.settings.notesFolder)
          .onChange(async (value) => {
            this.plugin.settings.notesFolder = value.trim() || "Threads";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Attachments Folder")
      .setDesc("Vault folder where post images/media will be downloaded.")
      .addText((text) =>
        text
          .setPlaceholder("attachments/threads")
          .setValue(this.plugin.settings.attachmentsFolder)
          .onChange(async (value) => {
            this.plugin.settings.attachmentsFolder = value.trim() || "attachments/threads";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Note Title Template")
      .setDesc("Template for note titles. Variables: {{author_username}}, {{author_name}}, {{id}}")
      .addText((text) =>
        text
          .setPlaceholder("Threads - {{author_username}} - {{id}}")
          .setValue(this.plugin.settings.noteTitleTemplate)
          .onChange(async (value) => {
            this.plugin.settings.noteTitleTemplate = value.trim() || "Threads - {{author_username}} - {{id}}";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Custom Note Body Template")
      .setDesc("Customize the Markdown note layout. Variables: {{visual_card}}, {{author_name}}, {{author_username}}, {{url}}, {{date}}, {{saved_at}}, {{content}}, {{media}}, {{reply_chain}}, {{tags}}")
      .addTextArea((text) => {
        text.inputEl.rows = 8;
        text.inputEl.cols = 50;
        text
          .setValue(this.plugin.settings.noteBodyTemplate || DEFAULT_NOTE_BODY_TEMPLATE)
          .onChange(async (value) => {
            this.plugin.settings.noteBodyTemplate = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Tags")
      .setDesc("Comma-separated list of default tags to add to saved notes.")
      .addText((text) =>
        text
          .setPlaceholder("threads, social")
          .setValue(this.plugin.settings.tags.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.tags = value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          })
      );
  }
}
