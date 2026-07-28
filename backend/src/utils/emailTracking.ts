/**
 * Email Tracking Utilities
 * Rewrites links in email bodies to route through click-tracking redirects
 */

const BACKEND_URL = process.env.BACKEND_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3001';

/**
 * Replace all links in email with tracking URLs for click tracking
 */
export function addClickTracking(body: string, emailId: string, backendUrl: string = BACKEND_URL): string {
  // Match all href attributes in anchor tags
  const hrefRegex = /href=["']([^"']+)["']/gi;

  return body.replace(hrefRegex, (match, url) => {
    // Skip if it's already a tracking URL or an anchor link
    if (url.startsWith('#') || url.includes('/track/click/')) {
      return match;
    }

    // Create tracking URL
    const trackingUrl = `${backendUrl}/track/click/${emailId}?url=${encodeURIComponent(url)}`;
    return `href="${trackingUrl}"`;
  });
}

