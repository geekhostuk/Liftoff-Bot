/**
 * Steam Workshop API helpers.
 *
 * fetchWorkshopItem  — fetch published file details (no API key required)
 * resolveAuthorName  — resolve a SteamID64 to a display name (requires STEAM_API_KEY)
 */

const PUBLISHED_FILE_URL =
  'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/';
const PLAYER_SUMMARIES_URL =
  'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/';

/**
 * Fetch Steam Workshop metadata for a single published file.
 * @param {string} steamId — the publishedfileid (numeric string)
 * @returns {object|null} normalised metadata or null if not found/banned/error
 */
async function fetchWorkshopItem(steamId) {
  const body = new URLSearchParams({
    itemcount: '1',
    'publishedfileids[0]': steamId,
  });

  const res = await fetch(PUBLISHED_FILE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`Steam API error: ${res.status}`);

  const json = await res.json();
  const item = json?.response?.publishedfiledetails?.[0];

  if (!item || item.result !== 1) return null;

  const votesUp = item.vote_data?.votes_up ?? null;
  const votesDown = item.vote_data?.votes_down ?? null;
  const score = item.vote_data?.score != null
    ? parseFloat(item.vote_data.score.toFixed(4))
    : null;

  return {
    title: item.title || null,
    authorId: item.creator || null,
    previewUrl: item.preview_url || null,
    description: item.short_description || item.file_description || null,
    subscriptions: item.subscriptions ?? null,
    votesUp,
    votesDown,
    score,
    tags: Array.isArray(item.tags) ? item.tags.map(t => t.tag) : [],
    timeCreated: item.time_created ? new Date(item.time_created * 1000) : null,
    timeUpdated: item.time_updated ? new Date(item.time_updated * 1000) : null,
  };
}

/**
 * Resolve a SteamID64 to a display name.
 * Requires STEAM_API_KEY env var. Returns null if key not set or on error.
 * @param {string} steamId64
 * @returns {string|null}
 */
async function resolveAuthorName(steamId64) {
  const key = process.env.STEAM_API_KEY;
  if (!key || !steamId64) return null;

  const url = `${PLAYER_SUMMARIES_URL}?key=${encodeURIComponent(key)}&steamids=${encodeURIComponent(steamId64)}`;
  const res = await fetch(url);

  if (!res.ok) return null;

  const json = await res.json();
  const player = json?.response?.players?.[0];
  return player?.personaname || null;
}

module.exports = { fetchWorkshopItem, resolveAuthorName };
