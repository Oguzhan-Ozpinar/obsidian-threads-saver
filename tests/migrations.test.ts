import assert from "node:assert/strict";
import { migrateStoredSettings } from "../src/migrations";
import { DEFAULT_NOTE_BODY_TEMPLATE } from "../src/types";

const legacyBody = `---
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

const migrated = migrateStoredSettings({
	notesFolder: "My Threads",
	attachmentsFolder: "attachments/threads",
	noteTitleTemplate: "Threads - {{author_username}} - {{id}}",
	noteBodyTemplate: legacyBody,
	tags: ["threads"],
});

assert.equal(migrated.migrated, true);
assert.equal(migrated.settings.threadsFolder, "My Threads");
assert.equal(
	migrated.settings.noteTitleTemplate,
	"{{platform}} - {{author_username}} - {{id}}",
);
assert.equal(migrated.settings.noteBodyTemplate, DEFAULT_NOTE_BODY_TEMPLATE);
assert.deepEqual(migrated.settings.tags, ["social-archive"]);
assert.equal(
	migrated.settings.attachmentsFolder,
	"attachments/social-saver",
);

console.log("Legacy settings migration tests passed.");
