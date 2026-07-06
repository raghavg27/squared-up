// Share a plain-text reminder/nudge. Uses the Web Share API where available
// (native share sheet → WhatsApp/SMS is how UPI requests actually travel in
// India), and falls back to copying the text to the clipboard.
export type ShareOutcome = 'shared' | 'copied' | 'failed';

export async function shareText(text: string, title?: string): Promise<ShareOutcome> {
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ title, text });
      return 'shared';
    } catch (e) {
      // AbortError = user dismissed the sheet; treat as a no-op, not a failure.
      if (e instanceof DOMException && e.name === 'AbortError') return 'shared';
      // Otherwise fall through to clipboard.
    }
  }
  try {
    await navigator.clipboard?.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
