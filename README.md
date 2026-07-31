# Threads Saver (Obsidian Plugin)

**Threads Saver** is a mobile-first Obsidian community plugin that saves Instagram Threads (`threads.net` & `threads.com`) posts into formatted Markdown notes inside your Obsidian vault.

It supports **iOS**, **Android**, and **Desktop**, allowing you to archive Threads posts, unroll full thread reply chains, download local image attachments, render visual UI cards, and customize note templates. The mobile capture flow differs by platform; see [Mobile Usage](#-mobile-usage) below.

---

## 📱 Features & Highlights

### 1. 🧵 Unroll Thread Chain
* Automatically detects and unrolls sequential reply posts written by the same author in a thread (`1/4`, `2/4`, `3/4`, `4/4`).
* Combines all replies in sequence into a single, comprehensive Obsidian note.

### 2. 🎴 Visual Threads Card (Optional UI Layout)
* Render a styled HTML/CSS card in native Threads UI layout at the top of the note.
* Includes stacked card connectors for reply chains.
* Easily toggle ON or OFF anytime in Plugin Settings (default: **OFF**).

### 3. 🎨 Custom Template Engine
* Customize the exact layout of your Markdown note frontmatter and body.
* Available template variables:
  * `{{visual_card}}`: Stacked Threads UI card block.
  * `{{author_name}}`: Author display name.
  * `{{author_username}}`: Author handle (`@username`).
  * `{{url}}`: Original Threads post URL.
  * `{{date}}`: Date saved (`YYYY-MM-DD`).
  * `{{saved_at}}`: Full timestamp.
  * `{{content}}`: Root post text.
  * `{{media}}`: Embedded post images.
  * `{{reply_chain}}`: Unrolled reply chain markdown.
  * `{{tags}}`: Vault tags list.

### 4. 📌 Clipboard Auto-Detect
* Copy a Threads link in the Threads app and switch to Obsidian.
* A Toast notification will pop up: `📌 Threads link detected in clipboard! [ Save to Vault ]`. Click **Save** to create the note instantly.

### 5. 📥 Bulk Inbox Processing
* Collect multiple Threads links in a single Obsidian note throughout the day.
* Run **Process All Threads Links in Active Note** to save every unique link as a formatted Threads note.
* The source note stays open, successfully processed URLs become internal links, and failed URLs remain unchanged for retrying.

### 6. 🖼 Media Options & Local Archiving
* Toggle **Include Media** ON or OFF in settings.
* Downloads post images directly into your vault's `attachments/threads` folder so image links never break when Instagram CDN links expire.

### 7. 📱 iOS Shortcuts & Obsidian Deep Links
* On iOS, a Shortcut can receive a Threads URL from the Share Sheet and pass it directly to Threads Saver.
* Native integration with Obsidian's deep linking protocol:
  `obsidian://threads-saver?url=https://www.threads.com/@user/post/POST_ID`
* Step-by-step [iOS Shortcut Setup Guide](docs/IOS_SHORTCUT.md).

---

## 📱 Mobile Usage

### Android

The recommended Android workflow is:

1. Copy a Threads post link.
2. Switch to Obsidian.
3. Tap **Save to Vault** in the clipboard detection notice.

Sharing directly to the Obsidian app opens Obsidian's own Android share dialog first. Community plugins cannot intercept or bypass that native dialog, so Threads Saver does not offer a direct Android Share Sheet capture flow.

### iOS and iPadOS

Use the provided [iOS Shortcut Setup Guide](docs/IOS_SHORTCUT.md). The Shortcut receives the shared Threads URL and opens the Threads Saver deep link. Obsidian then opens, fetches the post, and creates the formatted note. No intermediate note-selection screen is required.

---

## ⚙️ Installation

1. Copy `main.js`, `manifest.json`, and `styles.css` into your vault's plugin directory:
   `<your-vault>/.obsidian/plugins/obsidian-threads-saver/`
2. Reload Obsidian (`Cmd + R`) and enable **Threads Saver** in **Settings > Community Plugins**.

---

## ⚙️ Settings Overview

| Setting | Description | Default |
| :--- | :--- | :--- |
| **Session Cookie (`sessionid`)** | Threads.net session cookie for authenticated post fetching. | `""` |
| **Visual Threads Card** | Render styled HTML/CSS Threads UI card. | `OFF` |
| **Unroll Thread Chain** | Combine sequential author replies (`1/N`, `2/N`). | `ON` |
| **Include Media** | Include post images in saved notes. | `ON` |
| **Download Media Locally** | Download images into local vault attachments. | `ON` |
| **Clipboard Auto-Detect** | Show toast notice on app focus when Threads URL is copied. | `ON` |
| **Note Title Template** | Template for note filenames. | `Threads - {{author_username}} - {{id}}` |
| **Custom Note Body Template** | Custom layout for note body & frontmatter. | Configurable |

---

## ⚖️ Legal Disclaimer & Privacy Disclosure

This plugin is an independent open-source software created strictly for personal note-taking, archiving, and research purposes.

- **Trademark Disclaimer**: "Threads", "Instagram", and "Meta" are registered trademarks of Meta Platforms, Inc. "Obsidian" is a registered trademark of Dynalist Inc. This plugin is **NOT** affiliated with, authorized, maintained, sponsored, or endorsed by Meta Platforms, Inc., Dynalist Inc., or any of their affiliates.
- **Privacy & Security Disclosure**: All network requests originate locally from the user's personal client device directly to `threads.net` / `threads.com`. **No user data, session cookies, IP addresses, or notes are collected, logged, stored, or transmitted to any third-party or developer server.**
- **Fair Use & Terms**: Users are responsible for their compliance with third-party platform terms of service. This software is provided "as is" under the MIT License without warranty of any kind.

---

## 📄 License
[MIT License](LICENSE) © 2026 Oguzhan-Ozpinar.
