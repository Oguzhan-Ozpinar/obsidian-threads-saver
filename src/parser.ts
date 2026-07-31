import { requestUrl } from "obsidian";
import { ThreadReplyItem, ThreadsPost } from "./types";

/**
 * Extracts Threads Post ID or Share ID from various Threads URL formats.
 */
export function extractThreadsPostId(url: string): { username?: string; postId?: string; shareId?: string } | null {
  try {
    const cleanUrl = url.trim();
    const postMatch = cleanUrl.match(/threads\.(net|com)\/@([a-zA-Z0-9_.-]+)\/post\/([a-zA-Z0-9_.-]+)/i);
    if (postMatch) {
      return { username: postMatch[2], postId: postMatch[3] };
    }

    const shortMatch = cleanUrl.match(/threads\.(net|com)\/t\/([a-zA-Z0-9_.-]+)/i);
    if (shortMatch) {
      return { postId: shortMatch[2] };
    }

    const shareMatch = cleanUrl.match(/threads\.(net|com)\/share\/([a-zA-Z0-9_.-]+)/i);
    if (shareMatch) {
      return { shareId: shareMatch[2] };
    }

    return null;
  } catch (err) {
    console.error("Error extracting Threads post ID:", err);
    return null;
  }
}

/**
 * Validates whether a string contains a valid Threads URL (.net or .com, post/t/share).
 */
export function isThreadsUrl(url: string): boolean {
  return /https?:\/\/(www\.)?threads\.(net|com)\/(@[a-zA-Z0-9_.-]+\/post\/[a-zA-Z0-9_.-]+|t\/[a-zA-Z0-9_.-]+|share\/[a-zA-Z0-9_.-]+)/i.test(url.trim());
}

/**
 * Extracts unique image key/path (strips query parameters) to prevent duplicate CDN URLs.
 */
function getImageKey(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.toLowerCase();
  } catch {
    return url.split("?")[0].toLowerCase();
  }
}

/**
 * Checks if an image URL is a valid post media (excludes avatars, static icons, small thumbnails).
 */
function isMainPostImage(url: string): boolean {
  if (!url) return false;
  if (url.includes("static.cdninstagram.com") || url.includes("rsrc.php")) return false;
  if (url.includes("s150x150") || url.includes("s320x320") || url.includes("profile_pic")) return false;
  return true;
}

/**
 * Fetches and parses a public Threads post into a structured ThreadsPost object.
 */
export async function parseThreadsPost(
  url: string,
  sessionCookie?: string,
  userProvidedUserAgent?: string
): Promise<ThreadsPost> {
  const extracted = extractThreadsPostId(url);
  if (!extracted) {
    throw new Error("Invalid Threads URL format.");
  }

  const targetUrl = url.trim();
  const fallbackId = extracted.postId || extracted.shareId || Date.now().toString();

  const headers: Record<string, string> = {
    "User-Agent": userProvidedUserAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
  };

  if (sessionCookie && sessionCookie.trim()) {
    const cleanCookie = sessionCookie.trim();
    headers["Cookie"] = cleanCookie.includes("sessionid=") ? cleanCookie : `sessionid=${cleanCookie}`;
  }

  const response = await requestUrl({
    url: targetUrl,
    method: "GET",
    headers: headers,
  });

  if (response.status !== 200) {
    throw new Error(`Failed to fetch Threads post (HTTP ${response.status}).`);
  }

  const html = response.text;
  const domParser = new DOMParser();
  const doc = domParser.parseFromString(html, "text/html");

  // Extract Open Graph & Meta Tags
  const getMeta = (property: string): string => {
    const el = doc.querySelector(`meta[property="${property}"], meta[name="${property}"]`);
    return el ? el.getAttribute("content") || "" : "";
  };

  let ogTitle = getMeta("og:title") || getMeta("twitter:title");
  let ogDescription = getMeta("og:description") || getMeta("twitter:description");
  let ogImage = getMeta("og:image") || getMeta("twitter:image");

  let authorUsername = extracted.username || "";
  let authorName = authorUsername ? `@${authorUsername}` : "Threads User";
  let content = ogDescription;

  // Detect generic Meta landing page response
  const isGenericLandingPage = 
    content.includes("Join Threads to share ideas") || 
    content.includes("Log in with your Instagram") ||
    !content.trim();

  if (isGenericLandingPage && (!sessionCookie || !sessionCookie.trim())) {
    throw new Error(
      "Meta Threads blocked unauthenticated fetch. Please add your sessionid cookie in Threads Saver plugin settings to fetch post content!"
    );
  }

  if (ogTitle) {
    const titleMatch = ogTitle.match(/([^•]+)(?:•|\(@([a-zA-Z0-9_.-]+)\))/i);
    if (titleMatch && titleMatch[1]) {
      authorName = titleMatch[1].trim();
    }
  }

  const mediaUrls: string[] = [];
  const seenKeys = new Set<string>();

  const addMediaUrl = (imgUrl: string) => {
    if (!imgUrl || !isMainPostImage(imgUrl)) return;
    const key = getImageKey(imgUrl);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      mediaUrls.push(imgUrl);
    }
  };

  const replyChain: ThreadReplyItem[] = [];

  // Parse JSON script tags for carousel items and thread unroll items
  const scriptTags = Array.from(doc.querySelectorAll('script[type="application/json"]'));
  for (const script of scriptTags) {
    const scriptText = script.textContent;
    if (!scriptText) continue;

    try {
      if (scriptText.includes("thread_items") || scriptText.includes("carousel_media")) {
        const jsonData = JSON.parse(scriptText);
        extractCarouselMediaOnly(jsonData, addMediaUrl);
        extractThreadUnrollChain(jsonData, authorUsername, replyChain);
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  // Fallback to OG Image if no carousel media found
  if (mediaUrls.length === 0 && ogImage) {
    addMediaUrl(ogImage);
  }

  if (content && content.startsWith(authorName)) {
    content = content.substring(authorName.length).trim();
  }

  return {
    id: fallbackId,
    url: targetUrl,
    authorName: authorName.replace(/^@/, ""),
    authorUsername: authorUsername || "user",
    content: content || "No text content found in post.",
    mediaUrls: mediaUrls,
    replyChain: replyChain.length > 0 ? replyChain : undefined,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Extracts carousel media items from JSON structure.
 */
function extractCarouselMediaOnly(obj: any, addMediaFn: (url: string) => void) {
  if (!obj || typeof obj !== "object") return;

  const ignoredKeys = new Set([
    "suggested_users",
    "user_recommendations",
    "recs_feed",
    "profile_pic",
    "user",
    "author",
    "related_posts",
    "header",
  ]);

  if (obj.carousel_media && Array.isArray(obj.carousel_media)) {
    for (const item of obj.carousel_media) {
      if (item.image_versions2 && item.image_versions2.candidates && item.image_versions2.candidates.length > 0) {
        const bestImage = item.image_versions2.candidates[0].url;
        if (bestImage) {
          addMediaFn(bestImage);
        }
      }
    }
    return;
  }

  if (obj.image_versions2 && obj.image_versions2.candidates) {
    const candidates = obj.image_versions2.candidates;
    if (Array.isArray(candidates) && candidates.length > 0) {
      const bestImage = candidates[0].url;
      if (bestImage) {
        addMediaFn(bestImage);
      }
    }
  }

  for (const key of Object.keys(obj)) {
    if (ignoredKeys.has(key)) continue;
    if (typeof obj[key] === "object") {
      extractCarouselMediaOnly(obj[key], addMediaFn);
    }
  }
}

/**
 * Extracts sequential reply posts by the same author in a thread chain (Unroll).
 */
function extractThreadUnrollChain(obj: any, mainAuthorUsername: string, replyChain: ThreadReplyItem[]) {
  if (!obj || typeof obj !== "object") return;

  if (obj.thread_items && Array.isArray(obj.thread_items) && obj.thread_items.length > 1) {
    // thread_items[0] is root post, thread_items[1..N] are sequential replies
    for (let i = 1; i < obj.thread_items.length; i++) {
      const item = obj.thread_items[i];
      if (!item || !item.post) continue;

      const postUser = item.post.user?.username || "";
      // Only include replies by the same author in unrolled thread
      if (mainAuthorUsername && postUser && postUser.toLowerCase() !== mainAuthorUsername.toLowerCase()) {
        continue;
      }

      const replyText = item.post.caption?.text || "";
      const replyMedia: string[] = [];

      if (item.post.carousel_media && Array.isArray(item.post.carousel_media)) {
        for (const c of item.post.carousel_media) {
          if (c.image_versions2?.candidates?.length > 0) {
            replyMedia.push(c.image_versions2.candidates[0].url);
          }
        }
      } else if (item.post.image_versions2?.candidates?.length > 0) {
        replyMedia.push(item.post.image_versions2.candidates[0].url);
      }

      if (replyText || replyMedia.length > 0) {
        replyChain.push({
          authorUsername: postUser || mainAuthorUsername,
          authorName: item.post.user?.full_name || postUser || mainAuthorUsername,
          content: replyText,
          mediaUrls: replyMedia.filter(isMainPostImage),
        });
      }
    }
  }

  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === "object" && key !== "suggested_users" && key !== "recs_feed") {
      extractThreadUnrollChain(obj[key], mainAuthorUsername, replyChain);
    }
  }
}
