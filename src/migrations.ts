import {
	DEFAULT_NOTE_BODY_TEMPLATE,
	DEFAULT_SETTINGS,
	type PluginSettings,
} from "./types";

export interface LegacyStoredSettings extends Partial<PluginSettings> {
	sessionCookie?: string;
	notesFolder?: string;
}

const LEGACY_NOTE_TITLE_TEMPLATE =
	"Threads - {{author_username}} - {{id}}";
const LEGACY_NOTE_BODY_TEMPLATE = `---
author: "{{author_name}} (@{{author_username}})"
username: "{{author_username}}"
original_url: "{{url}}"
date_saved: {{date}}
tags:
{{tags}}
---

{{visual_card}}

{{content}}

{{media}}

{{reply_chain}}

---
*Saved with [Threads Saver](https://github.com/Oguzhan-Ozpinar/obsidian-threads-saver) on {{saved_at}}*
`;

export function migrateStoredSettings(stored: LegacyStoredSettings): {
	settings: PluginSettings;
	migrated: boolean;
} {
	const settings = { ...DEFAULT_SETTINGS } as PluginSettings;
	let migrated = false;

	for (const key of Object.keys(DEFAULT_SETTINGS) as Array<
		keyof PluginSettings
	>) {
		const value = stored[key];
		if (value !== undefined) {
			(settings as unknown as Record<string, unknown>)[key] = value;
		}
	}
	if (stored.notesFolder && !stored.threadsFolder) {
		settings.threadsFolder = stored.notesFolder;
		migrated = true;
	}
	if (settings.noteTitleTemplate === LEGACY_NOTE_TITLE_TEMPLATE) {
		settings.noteTitleTemplate = DEFAULT_SETTINGS.noteTitleTemplate;
		migrated = true;
	}
	if (settings.noteBodyTemplate === LEGACY_NOTE_BODY_TEMPLATE) {
		settings.noteBodyTemplate = DEFAULT_NOTE_BODY_TEMPLATE;
		migrated = true;
	}
	if (
		Array.isArray(settings.tags) &&
		settings.tags.length === 1 &&
		settings.tags[0].trim().toLowerCase() === "threads"
	) {
		settings.tags = [...DEFAULT_SETTINGS.tags];
		migrated = true;
	}
	if (settings.attachmentsFolder === "attachments/threads") {
		settings.attachmentsFolder = DEFAULT_SETTINGS.attachmentsFolder;
		migrated = true;
	}

	return { settings, migrated };
}
