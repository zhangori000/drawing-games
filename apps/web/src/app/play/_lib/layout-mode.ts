/**
 * - `stacked`: portrait phones and narrow windows.
 * - `wide`: canvas left, full sidebar right.
 * - `wide-short`: landscape phones. The canvas pane holds only the banner
 *   and the paper; a sidebar holds the drawer's tools (narrow) or the guess
 *   dock (wider), plus the opponent tile and the feed. Nothing floats over
 *   the paper, so the drawer can reach every corner.
 */
export type PlayLayoutMode = 'stacked' | 'wide' | 'wide-short'

/** At most this tall (CSS px) is a landscape phone: `(max-height: 559px)`. */
export const SHORT_LAYOUT_MAX_HEIGHT = 559

/**
 * The play layout for a viewport, the same rule as the media queries in
 * `use-media-query` (`WIDE_LAYOUT_QUERY` and `max-height: 559px`): wide
 * from 1024 px, or on touch screens from 560 px wide at a 4:3 or wider
 * aspect ratio; short at 559 px tall or less. Callers pass the
 * keyboard-closed height, so a soft keyboard never changes the layout.
 */
export function playLayoutMode(
  width: number,
  height: number,
  coarsePointer: boolean,
): PlayLayoutMode {
  const wide =
    width >= 1024 || (coarsePointer && width >= 560 && width * 3 >= height * 4)
  if (!wide) return 'stacked'
  return height <= SHORT_LAYOUT_MAX_HEIGHT ? 'wide-short' : 'wide'
}
