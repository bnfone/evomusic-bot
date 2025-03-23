import { promises as fs } from "fs";
import path from "path";

export interface SongStats {
  played: number;
  skipped: number;
  requestedBy: { [userId: string]: number };
  title: string; // Neuer Eintrag: Songtitel
}

export interface PlaylistStats {
  requested: number;
  requestedBy: { [userId: string]: number };
}

export interface StatsData {
  songs: { [songUrl: string]: SongStats };
  playlists: { [playlistUrl: string]: PlaylistStats };
  sources: { [source: string]: number };
  totalListeningMinutes: {
    global: number;
    perUser: { [userId: string]: number };
  };
  totalSongsRequested: {
    global: number;
    perUser: { [userId: string]: number };
  };
  // Für den Fall, dass du auch nachverfolgen möchtest,
  // wie oft ein Song von welchem User angefragt wurde.
  songRequests: { [songUrl: string]: { [userId: string]: number } };
}

const STATS_FILE = path.resolve(__dirname, "../data/stats.json");

// Initial empty stats
let stats: StatsData = {
  songs: {},
  playlists: {},
  sources: {},
  totalListeningMinutes: { global: 0, perUser: {} },
  totalSongsRequested: { global: 0, perUser: {} },
  songRequests: {},
};

export async function loadStats(): Promise<void> {
  try {
    const data = await fs.readFile(STATS_FILE, "utf8");
    stats = JSON.parse(data);
  } catch (error) {
    await saveStats();
  }
}

export async function saveStats(): Promise<void> {
  try {
    const dir = path.dirname(STATS_FILE);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2), "utf8");
  } catch (error) {
    console.error("Error saving stats:", error);
  }
}

/**
 * Logs that a song was requested.
 */
export async function logSongRequested(userId: string, songUrl: string): Promise<void> {
  stats.totalSongsRequested.global++;
  stats.totalSongsRequested.perUser[userId] = (stats.totalSongsRequested.perUser[userId] || 0) + 1;
  if (!stats.songRequests[songUrl]) {
    stats.songRequests[songUrl] = {};
  }
  stats.songRequests[songUrl][userId] = (stats.songRequests[songUrl][userId] || 0) + 1;
  await saveStats();
}

/**
 * Logs that a song was played.
 * @param playedMinutes Minutes the song was played (rounded)
 * @param source e.g. "youtube", "spotify"
 * @param title The title of the song
 */
export async function logSongPlayed(
  userId: string,
  songUrl: string,
  playedMinutes: number,
  source: string,
  title: string
): Promise<void> {
  if (!stats.songs[songUrl]) {
    stats.songs[songUrl] = { played: 0, skipped: 0, requestedBy: {}, title };
  }
  stats.songs[songUrl].played++;
  stats.songs[songUrl].requestedBy[userId] = (stats.songs[songUrl].requestedBy[userId] || 0) + 1;

  stats.sources[source] = (stats.sources[source] || 0) + 1;

  stats.totalListeningMinutes.global += playedMinutes;
  stats.totalListeningMinutes.perUser[userId] = (stats.totalListeningMinutes.perUser[userId] || 0) + playedMinutes;

  await saveStats();
}

/**
 * Logs that a song was skipped.
 * @param title The title of the song
 */
export async function logSongSkipped(
  userId: string,
  songUrl: string,
  title: string
): Promise<void> {
  if (!stats.songs[songUrl]) {
    stats.songs[songUrl] = { played: 0, skipped: 0, requestedBy: {}, title };
  }
  stats.songs[songUrl].skipped++;
  await saveStats();
}

/**
 * Logs that a playlist was requested.
 */
export async function logPlaylistRequested(userId: string, playlistUrl: string): Promise<void> {
  if (!stats.playlists[playlistUrl]) {
    stats.playlists[playlistUrl] = { requested: 0, requestedBy: {} };
  }
  stats.playlists[playlistUrl].requested++;
  stats.playlists[playlistUrl].requestedBy[userId] = (stats.playlists[playlistUrl].requestedBy[userId] || 0) + 1;
  await saveStats();
}

/**
 * Returns the current stats data.
 */
export function getStats(): StatsData {
  return stats;
}