export type SocialPlatform = "threads" | "instagram";
export type SocialMediaType = "image" | "video";
export type SaveMode = "folder" | "single-file";

export interface SocialMediaItem {
  url: string;
  type: SocialMediaType;
}

export interface SocialReplyItem {
  authorUsername: string;
  authorName: string;
  content: string;
  media: SocialMediaItem[];
}

export interface SocialPost {
  platform: SocialPlatform;
  id: string;
  url: string;
  authorName: string;
  authorUsername: string;
  content: string;
  media: SocialMediaItem[];
  replyChain?: SocialReplyItem[];
  timestamp?: string;
}

export interface PluginSettings {
  threadsSaveMode: SaveMode;
  instagramSaveMode: SaveMode;
  threadsFolder: string;
  instagramFolder: string;
  threadsTargetFile: string;
  instagramTargetFile: string;
  attachmentsFolder: string;
  downloadMediaLocally: boolean;
  downloadVideos: boolean;
  includeMedia: boolean;
  clipboardAutoDetect: boolean;
  unrollThreadChain: boolean;
  useVisualCard: boolean;
  noteTitleTemplate: string;
  noteBodyTemplate: string;
  tags: string[];
  customUserAgent: string;
}

export interface SavedPostResult {
  file: import("obsidian").TFile;
  subpath?: string;
}

export const DEFAULT_NOTE_BODY_TEMPLATE = `---
platform: {{platform_yaml}}
social_post_id: {{id_yaml}}
author: {{author_display_yaml}}
username: {{author_username_yaml}}
original_url: {{url_yaml}}
date_saved: {{date_yaml}}
tags:
{{tags}}
---

{{visual_card}}

{{content}}

{{media}}

{{reply_chain}}

---
*Saved with Social Saver on {{saved_at}}*
`;

export const DEFAULT_SETTINGS: PluginSettings = {
  threadsSaveMode: "folder",
  instagramSaveMode: "folder",
  threadsFolder: "Threads",
  instagramFolder: "Instagram",
  threadsTargetFile: "Threads.md",
  instagramTargetFile: "Instagram.md",
  attachmentsFolder: "attachments/social-saver",
  downloadMediaLocally: true,
  downloadVideos: true,
  includeMedia: true,
  clipboardAutoDetect: false,
  unrollThreadChain: true,
  useVisualCard: false,
  noteTitleTemplate: "{{platform}} - {{author_username}} - {{id}}",
  noteBodyTemplate: DEFAULT_NOTE_BODY_TEMPLATE,
  tags: ["social-archive"],
  customUserAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
};
