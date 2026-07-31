import { App, Notice, requestUrl, TFile, normalizePath } from "obsidian";
import { PluginSettings, ThreadsPost, ThreadReplyItem } from "./types";

/**
 * Ensures a directory path exists in the vault.
 */
async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
  const normalized = normalizePath(folderPath);
  if (normalized === "" || normalized === ".") return;

  const folder = app.vault.getAbstractFileByPath(normalized);
  if (!folder) {
    await app.vault.createFolder(normalized);
  }
}

/**
 * Downloads media files (images) locally into the vault's attachment directory.
 */
async function downloadMediaLocally(
  app: App,
  post: ThreadsPost,
  attachmentsFolder: string
): Promise<{ mainMediaEmbeds: string[]; replyMediaEmbeds: string[] }> {
  const mainMediaEmbeds: string[] = [];
  const replyMediaEmbeds: string[] = [];
  await ensureFolderExists(app, attachmentsFolder);

  // 1. Main post media
  for (let i = 0; i < post.mediaUrls.length; i++) {
    const mediaUrl = post.mediaUrls[i];
    try {
      const extensionMatch = mediaUrl.match(/\.(jpg|jpeg|png|webp)/i);
      const ext = extensionMatch ? extensionMatch[1] : "jpg";
      const fileName = `threads_${post.id}_${i + 1}.${ext}`;
      const filePath = normalizePath(`${attachmentsFolder}/${fileName}`);

      const existingFile = app.vault.getAbstractFileByPath(filePath);
      if (existingFile instanceof TFile) {
        mainMediaEmbeds.push(`![[${filePath}]]`);
        continue;
      }

      const response = await requestUrl({ url: mediaUrl, method: "GET" });
      if (response.status === 200 && response.arrayBuffer) {
        await app.vault.createBinary(filePath, response.arrayBuffer);
        mainMediaEmbeds.push(`![[${filePath}]]`);
      } else {
        mainMediaEmbeds.push(`![Media ${i + 1}](${mediaUrl})`);
      }
    } catch {
      mainMediaEmbeds.push(`![Media ${i + 1}](${mediaUrl})`);
    }
  }

  // 2. Reply chain media
  if (post.replyChain && post.replyChain.length > 0) {
    for (let rIdx = 0; rIdx < post.replyChain.length; rIdx++) {
      const reply = post.replyChain[rIdx];
      for (let mIdx = 0; mIdx < reply.mediaUrls.length; mIdx++) {
        const mUrl = reply.mediaUrls[mIdx];
        try {
          const fileName = `threads_${post.id}_reply${rIdx + 1}_${mIdx + 1}.jpg`;
          const filePath = normalizePath(`${attachmentsFolder}/${fileName}`);
          const existingFile = app.vault.getAbstractFileByPath(filePath);
          if (existingFile instanceof TFile) {
            replyMediaEmbeds.push(`![[${filePath}]]`);
            continue;
          }
          const resp = await requestUrl({ url: mUrl, method: "GET" });
          if (resp.status === 200 && resp.arrayBuffer) {
            await app.vault.createBinary(filePath, resp.arrayBuffer);
            replyMediaEmbeds.push(`![[${filePath}]]`);
          } else {
            replyMediaEmbeds.push(`![Reply Media ${mIdx + 1}](${mUrl})`);
          }
        } catch {
          replyMediaEmbeds.push(`![Reply Media ${mIdx + 1}](${mUrl})`);
        }
      }
    }
  }

  return { mainMediaEmbeds, replyMediaEmbeds };
}

/**
 * Formats full thread chain items (1/N, 2/N, 3/N...) into text-only unrolled Markdown.
 */
function formatReplyChainMarkdown(post: ThreadsPost): string {
  const replyChain = post.replyChain;
  if (!replyChain || replyChain.length === 0) return "";

  const totalCount = 1 + replyChain.length;
  const lines: string[] = ["\n### 🧵 Thread Chain (Unrolled)"];

  // Item 1/N: Root Post Text
  lines.push(`\n#### 1/${totalCount} @${post.authorUsername}`);
  if (post.content) {
    lines.push(`> ${post.content.replace(/\n/g, "\n> ")}`);
  }

  // Items 2..N: Sequential Replies Text Only
  for (let i = 0; i < replyChain.length; i++) {
    const item = replyChain[i];
    lines.push(`\n#### ${i + 2}/${totalCount} @${item.authorUsername}`);
    if (item.content) {
      lines.push(`> ${item.content.replace(/\n/g, "\n> ")}`);
    }
  }
  return lines.join("\n\n");
}

/**
 * Renders HTML for Stacked Visual Threads Post Cards with connectors for reply chain.
 */
function renderVisualPostCard(post: ThreadsPost, formattedDate: string, unrollChain: boolean): string {
  const totalCount = (unrollChain && post.replyChain) ? 1 + post.replyChain.length : 1;
  const counterBadge = totalCount > 1 ? ` • 1/${totalCount}` : "";

  let cardsHtml = `<div class="threads-thread-container">
  <div class="threads-card">
    <div class="threads-card-header">
      <div class="threads-card-user">
        <span class="threads-card-name">${post.authorName}</span>
        <span class="threads-card-username">@${post.authorUsername}${counterBadge}</span>
      </div>
      <span class="threads-card-badge">Threads</span>
    </div>
    <div class="threads-card-body">${post.content}</div>
    <div class="threads-card-footer">
      <span>${formattedDate}</span>
      <a class="threads-card-link" href="${post.url}" target="_blank">Original Post ↗</a>
    </div>
  </div>`;

  if (unrollChain && post.replyChain && post.replyChain.length > 0) {
    for (let i = 0; i < post.replyChain.length; i++) {
      const reply = post.replyChain[i];
      cardsHtml += `
  <div class="threads-thread-line"></div>
  <div class="threads-card threads-card-reply">
    <div class="threads-card-header">
      <div class="threads-card-user">
        <span class="threads-card-name">${reply.authorName || reply.authorUsername}</span>
        <span class="threads-card-username">@${reply.authorUsername} • ${i + 2}/${totalCount}</span>
      </div>
    </div>
    <div class="threads-card-body">${reply.content}</div>
  </div>`;
    }
  }

  cardsHtml += `\n</div>`;
  return cardsHtml;
}

/**
 * Generates formatted Markdown string for a Threads post using Custom Template Engine.
 */
export async function generateThreadsNoteContent(
  app: App,
  post: ThreadsPost,
  settings: PluginSettings
): Promise<{ title: string; content: string }> {
  let allMediaEmbeds: string[] = [];

  if (settings.includeMedia) {
    if (settings.downloadMediaLocally) {
      const downloaded = await downloadMediaLocally(app, post, settings.attachmentsFolder);
      allMediaEmbeds = [...downloaded.mainMediaEmbeds, ...downloaded.replyMediaEmbeds];
    } else {
      allMediaEmbeds = post.mediaUrls.map((url, idx) => `![Image ${idx + 1}](${url})`);
      if (post.replyChain) {
        for (const r of post.replyChain) {
          for (const u of r.mediaUrls) {
            allMediaEmbeds.push(`![Reply Image](${u})`);
          }
        }
      }
    }
  }

  const tagsFormatted = settings.tags
    .map((t) => t.trim().replace(/^#/, ""))
    .concat([`threads/${post.authorUsername}`])
    .map((t) => `  - ${t}`)
    .join("\n");

  const formattedDate = post.timestamp ? new Date(post.timestamp).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
  const savedAt = new Date().toLocaleString();

  const hasReplyChain = settings.unrollThreadChain && post.replyChain && post.replyChain.length > 0;

  // Media section is ALWAYS rendered as its own section if includeMedia is enabled and images exist
  const mediaSection = (settings.includeMedia && allMediaEmbeds.length > 0) 
    ? "### Media\n" + allMediaEmbeds.join("\n\n") 
    : "";

  // Thread chain section contains text only (1/N, 2/N, 3/N...)
  const replyChainSection = settings.unrollThreadChain 
    ? formatReplyChainMarkdown(post) 
    : "";

  const visualCardHtml = settings.useVisualCard 
    ? renderVisualPostCard(post, formattedDate, settings.unrollThreadChain) 
    : "";

  // Omit duplicate single content block if visual card is ON or if unroll chain already includes item 1/N
  const contentBlock = (settings.useVisualCard || hasReplyChain) 
    ? "" 
    : `> ${post.content.replace(/\n/g, "\n> ")}`;

  // Custom Template Engine Replacement
  const bodyTemplate = settings.noteBodyTemplate || "";
  const noteContent = bodyTemplate
    .replace(/\{\{visual_card\}\}/g, visualCardHtml)
    .replace(/\{\{author_name\}\}/g, post.authorName)
    .replace(/\{\{author_username\}\}/g, post.authorUsername)
    .replace(/\{\{url\}\}/g, post.url)
    .replace(/\{\{date\}\}/g, formattedDate)
    .replace(/\{\{saved_at\}\}/g, savedAt)
    .replace(/\{\{content\}\}/g, contentBlock)
    .replace(/\{\{media\}\}/g, mediaSection)
    .replace(/\{\{reply_chain\}\}/g, replyChainSection)
    .replace(/\{\{tags\}\}/g, tagsFormatted);

  // Clean empty lines in Markdown result
  const cleanedContent = noteContent.replace(/\n\n\n+/g, "\n\n");

  // Format Title
  const cleanTitle = settings.noteTitleTemplate
    .replace("{{author_username}}", post.authorUsername)
    .replace("{{author_name}}", post.authorName)
    .replace("{{id}}", post.id)
    .replace(/[^a-zA-Z0-9 _-]/g, "");

  return {
    title: cleanTitle,
    content: cleanedContent,
  };
}

/**
 * Creates or updates a Markdown file in the vault for a given Threads post.
 */
export async function saveThreadsPostToVault(
  app: App,
  post: ThreadsPost,
  settings: PluginSettings
): Promise<TFile> {
  await ensureFolderExists(app, settings.notesFolder);

  const { title, content } = await generateThreadsNoteContent(app, post, settings);
  const filePath = normalizePath(`${settings.notesFolder}/${title}.md`);

  const existingFile = app.vault.getAbstractFileByPath(filePath);
  if (existingFile instanceof TFile) {
    await app.vault.modify(existingFile, content);
    new Notice(`Updated Threads note: ${title}`);
    return existingFile;
  } else {
    const newFile = await app.vault.create(filePath, content);
    new Notice(`Saved Threads note: ${title}`);
    return newFile;
  }
}
