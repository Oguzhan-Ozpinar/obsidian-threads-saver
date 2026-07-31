# Security policy

## Supported version

Security fixes target the latest release on the default branch. Version 1.1.0 requires Obsidian 1.11.4+ because it uses Obsidian Secret Storage.

## Reporting

Please report a suspected vulnerability privately to the repository owner before publishing exploit details. Include:

- affected plugin and Obsidian versions;
- entry point (clipboard, command, editor, or deep link);
- a minimal non-destructive reproduction;
- expected and observed network/vault behavior.

Do not include a real Meta `sessionid`, private post content, or a production vault.

## Threat model and boundaries

The plugin treats URLs and fetched social content as untrusted. It validates exact page/CDN hosts, escapes generated content, bounds parser/media work, and only updates blocks carrying its identity marker.

Meta remains an external trust boundary. The plugin cannot guarantee availability, page-schema stability, account safety, copyright permission, or the truth of archived content. Obsidian plugins run with broad vault access, so users should install only reviewed builds and keep vault backups.
