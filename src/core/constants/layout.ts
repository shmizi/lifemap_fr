// Fixed layout dimensions, in pixels.
// Kept here so the sidebar, topbar, and content area all agree on the same
// measurements — the content area must offset itself by exactly these widths.

export const LAYOUT = {
  SIDEBAR_WIDTH_OPEN: 240,
  SIDEBAR_WIDTH_COLLAPSED: 64,
  TOPBAR_HEIGHT: 60,
  CONTENT_PADDING: 24,
} as const;
