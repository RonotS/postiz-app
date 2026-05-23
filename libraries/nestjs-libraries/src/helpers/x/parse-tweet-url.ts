/** Extract numeric X/Twitter status id from a URL or raw id string. */
export function parseXTweetIdFromUrl(input: string): string | null {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d{10,25}$/.test(trimmed)) {
    return trimmed;
  }

  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/i,
    /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/i\/web\/status\/(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

export function xTweetPermalink(tweetId: string): string {
  return `https://x.com/i/web/status/${tweetId}`;
}
