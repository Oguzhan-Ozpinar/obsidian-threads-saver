export interface ThreadReplyItem {
  authorUsername: string;
  authorName: string;
  content: string;
  mediaUrls: string[];
}

export interface ThreadsPost {
  id: string;
  url: string;
  authorName: string;
  authorUsername: string;
  authorAvatarUrl?: string;
  content: string;
  mediaUrls: string[];
  replyChain?: ThreadReplyItem[];
  timestamp?: string;
  likesCount?: number;
  repliesCount?: number;
}

export interface PluginSettings {
  notesFolder: string;
  attachmentsFolder: string;
  downloadMediaLocally: boolean;
  includeMedia: boolean;
  clipboardAutoDetect: boolean;
  unrollThreadChain: boolean;
  useVisualCard: boolean;
  noteTitleTemplate: string;
  noteBodyTemplate: string;
  tags: string[];
  sessionCookie: string;
  customUserAgent: string;
}

export const DEFAULT_NOTE_BODY_TEMPLATE = `---
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

export const DEFAULT_SETTINGS: PluginSettings = {
  notesFolder: "Threads",
  attachmentsFolder: "attachments/threads",
  downloadMediaLocally: true,
  includeMedia: true,
  clipboardAutoDetect: true,
  unrollThreadChain: true,
  useVisualCard: false,
  noteTitleTemplate: "Threads - {{author_username}} - {{id}}",
  noteBodyTemplate: DEFAULT_NOTE_BODY_TEMPLATE,
  tags: ["threads"],
  sessionCookie: "",
  customUserAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
};
