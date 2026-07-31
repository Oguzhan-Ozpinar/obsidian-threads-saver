# Threads & Instagram Saver for Obsidian

Archive supported Threads and Instagram posts as Markdown in your own Obsidian vault. The plugin detects the platform automatically, keeps the original source, can download media locally, and does not require a developer-operated account or cloud service.

> This is an independent, unofficial community plugin. It is not affiliated with or endorsed by Meta, Instagram, Threads, or Obsidian.

## Features

- Threads posts, `/t/` links, `/share/` links, and same-author thread unrolling
- Instagram posts, carousels, Reels, legacy video links, and `/share/p/` links
- One note per post or one managed archive file, configured separately per platform
- Local JPG, PNG, WebP, GIF, and MP4 downloads
- Clipboard command, optional focus detection, editor context menu, bulk inbox processing, and Obsidian deep links
- Custom Markdown/frontmatter templates and optional escaped visual cards
- Safe updates: the plugin only updates content carrying its platform/post identity markers

## Supported URL forms

```text
https://www.threads.com/@username/post/POST_ID
https://threads.net/t/POST_ID
https://threads.com/share/POST_ID

https://www.instagram.com/p/SHORTCODE
https://instagram.com/reel/SHORTCODE
https://instagram.com/reels/SHORTCODE
https://instagram.com/tv/SHORTCODE
https://instagram.com/share/p/SHORTCODE
https://instagr.am/p/SHORTCODE
```

Only HTTPS URLs on exact supported hosts are accepted. Tracking parameters and fragments are removed before fetching.

## Usage

### Clipboard

1. Copy a supported Threads or Instagram link.
2. In Obsidian, run **Save Threads or Instagram post from clipboard**.
3. The post is saved to its configured destination.

Clipboard focus detection is off by default. If enabled, the plugin reads the clipboard only when Obsidian regains focus and shows an action notice for a supported link.

### Active-note inbox

Collect links in a note and run **Process all Threads and Instagram links in active note**. Successful URLs become internal links to the saved note or managed archive section. Failed URLs stay unchanged for retrying.

### Editor

- Run **Insert Threads or Instagram post at cursor** for a compact quoted block.
- Right-click a supported URL and choose **Convert social post link**.

### iOS/iPadOS deep link

Use an encoded URL with the new protocol:

```text
obsidian://social-saver?url=ENCODED_SOCIAL_URL
```

The legacy `obsidian://threads-saver` protocol remains supported. See the [iOS Shortcut guide](docs/IOS_SHORTCUT.md).

Android community plugins cannot bypass Obsidian's native share dialog. The clipboard command/detection flow is the recommended Android workflow.

## Settings

| Setting | Behavior | Default |
| --- | --- | --- |
| Threads destination | Per-post folder or managed archive file | `Threads/` |
| Instagram destination | Per-post folder or managed archive file | `Instagram/` |
| Include media | Add supported media to the note | On |
| Download media locally | Copy media into the vault | On |
| Download videos | Include MP4/Reel downloads | On |
| Attachments folder | Parent folder for platform media | `attachments/social-saver/` |
| Unroll Threads chains | Include sequential same-author replies | On |
| Visual post card | Add an escaped HTML card | Off |
| Clipboard detection | Check clipboard when Obsidian regains focus | Off |
| Meta session ID | Optional authenticated page access | Empty |

Short/share links that may redirect are deliberately fetched without the explicit session cookie. If one fails behind a login page, use the direct post URL.

## Security and privacy

- The optional `sessionid` is stored through Obsidian Secret Storage (Obsidian 1.11.4+), not in this plugin's `data.json`. Treat it like a password.
- The plugin sends page requests only to validated Threads/Instagram hosts. Media requests are limited to validated Meta CDN hosts.
- It has no telemetry, analytics, developer server, or remote database.
- It never automatically deletes vault files.
- User-controlled post content is escaped separately for HTML, Markdown, YAML, filenames, and tags.
- Local downloads accept only known media MIME types and use limits of 10 items, 20 MiB per item, 100 MiB total, and 3 concurrent requests.
- If a preferred filename already belongs to a user note, the plugin creates an identity-suffixed file instead of overwriting it.
- When local download is disabled or rejected, a remote media link may remain in the note. Opening it can contact Meta's CDN.

Network traffic still goes to Meta services, and those services receive the device IP and normal request metadata. A session cookie, when configured, is transmitted to the validated direct post host to retrieve content.

See [SECURITY.md](SECURITY.md) for reporting and threat-model details.

## Legal and platform limitations

This tool is intended for personal note-taking and research. You are responsible for:

- complying with the [Instagram Terms of Use](https://www.facebook.com/help/instagram/581066165581870) and [Meta Automated Data Collection Terms](https://www.facebook.com/legal/automated_data_collection_terms);
- having the right to copy, retain, or republish post text and media;
- handling personal data lawfully, especially in shared, organizational, or public vaults;
- respecting deleted, private, licensed, sensitive, or minor-related content.

A personal-use disclaimer does not grant permission for automated collection. Authenticated extraction may be restricted by Meta's terms even when technically possible. For a public or commercial product, prefer an officially authorized API/OAuth workflow and obtain legal review.

Meta changes its page markup and access controls without notice. Private, deleted, age-restricted, region-restricted, or login-gated content may fail to parse.

## Installation

Requires Obsidian 1.11.4 or later.

Copy `main.js`, `manifest.json`, and `styles.css` into:

```text
<your-vault>/.obsidian/plugins/obsidian-threads-saver/
```

Reload Obsidian and enable **Threads & Instagram Saver** under **Settings → Community plugins**.

## Development

```bash
npm ci
npm run check
```

Development requires Node.js 20.19 or later.

`npm run check` runs strict TypeScript validation, ESLint, security/data-integrity tests, and a production bundle.

Manual mobile and parser checks are listed in [docs/TESTING.md](docs/TESTING.md). The original audit and product research are in [OBSIDIAN_THREADS_SAVER_AUDIT_TR.md](OBSIDIAN_THREADS_SAVER_AUDIT_TR.md).

## License

[MIT](LICENSE) © 2026 Oguzhan-Ozpinar.
