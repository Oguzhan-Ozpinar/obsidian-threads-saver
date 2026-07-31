import { App, PluginSettingTab, Setting } from "obsidian";
import type SocialSaverPlugin from "./main";
import { DEFAULT_NOTE_BODY_TEMPLATE } from "./types";

export class ThreadsSaverSettingTab extends PluginSettingTab {
	plugin: SocialSaverPlugin;

	constructor(app: App, plugin: SocialSaverPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Account access").setHeading();
		new Setting(containerEl)
			.setName("Meta session ID")
			.setDesc(
				"Optional. Used only for validated Threads and Instagram page requests. Stored in Obsidian's secret storage, not the plugin data file. Treat it like a password.",
			)
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("sessionid value")
					.setValue(this.plugin.getSessionCookie())
					.onChange((value) => {
						this.plugin.setSessionCookie(value);
					});
			})
			.addExtraButton((button) => {
				button
					.setIcon("eye")
					.setTooltip("Show or hide session ID")
					.onClick(() => {
						const input = button.extraSettingsEl.parentElement?.querySelector(
							'input[type="password"], input[type="text"]',
						) as HTMLInputElement | null;
						if (!input) return;
						input.type = input.type === "password" ? "text" : "password";
						button.setIcon(input.type === "password" ? "eye" : "eye-off");
					});
			});

		new Setting(containerEl).setName("Threads destination").setHeading();
		new Setting(containerEl)
			.setName("Save mode")
			.setDesc("Create one note per post, or maintain one managed archive file.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("folder", "One note per post")
					.addOption("single-file", "Single archive file")
					.setValue(this.plugin.settings.threadsSaveMode)
					.onChange(async (value) => {
						this.plugin.settings.threadsSaveMode =
							value === "single-file" ? "single-file" : "folder";
						await this.plugin.saveSettings();
						this.display();
					}),
			);
		if (this.plugin.settings.threadsSaveMode === "folder") {
			new Setting(containerEl)
				.setName("Threads folder")
				.setDesc("Vault folder for Threads notes.")
				.addText((text) =>
					text
						.setPlaceholder("Social/Threads")
						.setValue(this.plugin.settings.threadsFolder)
						.onChange(async (value) => {
							this.plugin.settings.threadsFolder =
								value.trim() || "Social/Threads";
							await this.plugin.saveSettings();
						}),
				);
		} else {
			new Setting(containerEl)
				.setName("Threads archive file")
				.setDesc("Markdown file used as the managed Threads archive.")
				.addText((text) =>
					text
						.setPlaceholder("Social/Threads.md")
						.setValue(this.plugin.settings.threadsTargetFile)
						.onChange(async (value) => {
							this.plugin.settings.threadsTargetFile =
								value.trim() || "Social/Threads.md";
							await this.plugin.saveSettings();
						}),
				);
		}

		new Setting(containerEl).setName("Instagram destination").setHeading();
		new Setting(containerEl)
			.setName("Save mode")
			.setDesc("Create one note per post, or maintain one managed archive file.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("folder", "One note per post")
					.addOption("single-file", "Single archive file")
					.setValue(this.plugin.settings.instagramSaveMode)
					.onChange(async (value) => {
						this.plugin.settings.instagramSaveMode =
							value === "single-file" ? "single-file" : "folder";
						await this.plugin.saveSettings();
						this.display();
					}),
			);
		if (this.plugin.settings.instagramSaveMode === "folder") {
			new Setting(containerEl)
				.setName("Instagram folder")
				.setDesc("Vault folder for Instagram posts and Reels.")
				.addText((text) =>
					text
						.setPlaceholder("Social/Instagram")
						.setValue(this.plugin.settings.instagramFolder)
						.onChange(async (value) => {
							this.plugin.settings.instagramFolder =
								value.trim() || "Social/Instagram";
							await this.plugin.saveSettings();
						}),
				);
		} else {
			new Setting(containerEl)
				.setName("Instagram archive file")
				.setDesc("Markdown file used as the managed Instagram archive.")
				.addText((text) =>
					text
						.setPlaceholder("Social/Instagram.md")
						.setValue(this.plugin.settings.instagramTargetFile)
						.onChange(async (value) => {
							this.plugin.settings.instagramTargetFile =
								value.trim() || "Social/Instagram.md";
							await this.plugin.saveSettings();
						}),
				);
		}

		new Setting(containerEl).setName("Content and media").setHeading();
		new Setting(containerEl)
			.setName("Unroll Threads chains")
			.setDesc("Include sequential replies written by the original author.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.unrollThreadChain)
					.onChange(async (value) => {
						this.plugin.settings.unrollThreadChain = value;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Include media")
			.setDesc("Include supported post images and videos in saved notes.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeMedia)
					.onChange(async (value) => {
						this.plugin.settings.includeMedia = value;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Download media locally")
			.setDesc("Copy supported media to the vault using size and MIME checks.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.downloadMediaLocally)
					.onChange(async (value) => {
						this.plugin.settings.downloadMediaLocally = value;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Download videos")
			.setDesc("Allow MP4 downloads for Instagram Reels and video posts.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.downloadVideos)
					.onChange(async (value) => {
						this.plugin.settings.downloadVideos = value;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Attachments folder")
			.setDesc("Platform subfolders are created below this vault folder.")
			.addText((text) =>
				text
					.setPlaceholder("attachments/social-saver")
					.setValue(this.plugin.settings.attachmentsFolder)
					.onChange(async (value) => {
						this.plugin.settings.attachmentsFolder =
							value.trim() || "attachments/social-saver";
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Visual post card")
			.setDesc("Render escaped post text inside the bundled card style.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useVisualCard)
					.onChange(async (value) => {
						this.plugin.settings.useVisualCard = value;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Clipboard detection")
			.setDesc(
				"Check the clipboard when Obsidian regains focus and offer to save a supported link.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.clipboardAutoDetect)
					.onChange(async (value) => {
						this.plugin.settings.clipboardAutoDetect = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Templates").setHeading();
		new Setting(containerEl)
			.setName("Note title template")
			.setDesc(
				"Variables: {{platform}}, {{author_username}}, {{author_name}}, {{id}}",
			)
			.addText((text) =>
				text
					.setPlaceholder("{{platform}} - {{author_username}} - {{id}}")
					.setValue(this.plugin.settings.noteTitleTemplate)
					.onChange(async (value) => {
						this.plugin.settings.noteTitleTemplate =
							value.trim() ||
							"{{platform}} - {{author_username}} - {{id}}";
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Note body template")
			.setDesc(
				"Supports escaped display variables and dedicated *_yaml variables from the default template.",
			)
			.addTextArea((text) => {
				text.inputEl.rows = 12;
				text.inputEl.cols = 55;
				text
					.setValue(
						this.plugin.settings.noteBodyTemplate ||
							DEFAULT_NOTE_BODY_TEMPLATE,
					)
					.onChange(async (value) => {
						this.plugin.settings.noteBodyTemplate = value;
						await this.plugin.saveSettings();
					});
			});
		new Setting(containerEl)
			.setName("Tags")
			.setDesc("Comma-separated default tags.")
			.addText((text) =>
				text
					.setPlaceholder("social-archive")
					.setValue(this.plugin.settings.tags.join(", "))
					.onChange(async (value) => {
						this.plugin.settings.tags = value
							.split(",")
							.map((tag) => tag.trim())
							.filter(Boolean);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Advanced").setHeading();
		new Setting(containerEl)
			.setName("Custom user agent")
			.setDesc("Optional request user agent. Leave empty to use the built-in value.")
			.addText((text) =>
				text
					.setPlaceholder("Mozilla/5.0 …")
					.setValue(this.plugin.settings.customUserAgent)
					.onChange(async (value) => {
						this.plugin.settings.customUserAgent = value.trim();
						await this.plugin.saveSettings();
					}),
			);
	}
}
