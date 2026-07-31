# Test checklist

## Automated

Run:

```bash
npm ci
npm run check
npm audit
```

The suite covers strict URL/host validation, header-control characters, media CDN validation, HTML/Markdown/YAML escaping, filename safety, managed updates, and protection against overwriting a same-named user note.

## Desktop smoke test

- Save one direct Threads post and one direct Instagram post.
- Save an Instagram carousel and Reel with local media on/off.
- Confirm media MIME and size failures fall back to remote links.
- Save the same post twice and confirm the managed note updates.
- Place an unrelated note at the preferred filename and confirm it is untouched.
- Test per-post and single-archive modes for both platforms.
- Process a mixed Threads/Instagram inbox; failed links must remain unchanged.
- Test context-menu conversion with and without selected text.
- Confirm clipboard detection does nothing while disabled.
- Migrate from a 1.0.x `data.json`; verify `sessionCookie` is absent after save and present in Secret Storage.

## Adversarial smoke test

- Reject HTTP, custom ports, userinfo, lookalike domains, embedded URLs, control characters, and unsupported paths.
- Confirm `<script>`, `</div>`, Markdown links, `---`, quotes, and multiline author names render as inert text.
- Confirm `../` in destination settings is rejected.
- Confirm `/t/` and `/share/` routes never receive an explicit session cookie.

## Mobile

- iOS/iPadOS: test the encoded `obsidian://social-saver` Shortcut from both apps.
- Android: test copy → Obsidian → clipboard command and optional focus notice.
- Repeat image/carousel/Reel cases on a memory-constrained device.

Meta page markup is not a stable API. Real public fixtures should be checked before every release without committing session cookies or private content.
