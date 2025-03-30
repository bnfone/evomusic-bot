/********************************************
 * utils/stats.ts
 *
 * This module is responsible for tracking and persisting various
 * statistics related to the usage of the music bot. It tracks:
 *
 * - Song statistics: how many times each song was played or skipped,
 *   which users requested each song, and the song title.
 *
 * - Playlist statistics: how many times each playlist was requested
 *   and which users requested it.
 *
 * - Source statistics: counts per source (e.g., YouTube, Spotify).
 *
 * - Global and per-user listening minutes and total song requests.
 *
 * All statistics are maintained in an in-memory object and persisted
 * to a JSON file located in /data/stats.json.
 *
 * NOTE: This implementation saves the stats immediately on every update.
 *       For high-load environments, consider batching saves (e.g. by saving every N seconds)
 *       to reduce file I/O overhead.
 ********************************************/

import { promises as fs } from "fs";
import path from "path";
import { log } from "./logger";

// Define interfaces for song and playlist statistics, as well as overall stats.
export interface SongStats {
  played: number;
  skipped: number;
  requestedBy: { [userId: string]: number };
  title: string; // The title of the song.
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
  // Tracks how often each song was requested by each user.
  songRequests: { [songUrl: string]: { [userId: string]: number } };
}

// The file where stats are persisted.
const STATS_FILE = path.resolve(__dirname, "../data/stats.json");

// Initialize the in-memory stats object with empty values.
let stats: StatsData = {
  songs: {},
  playlists: {},
  sources: {},
  totalListeningMinutes: { global: 0, perUser: {} },
  totalSongsRequested: { global: 0, perUser: {} },
  songRequests: {},
};

/**
 * Loads the statistics from the STATS_FILE.
 *
 * If the file does not exist or cannot be read, a new file is created with empty stats.
 */
export async function loadStats(): Promise<void> {
  try {
    const data = await fs.readFile(STATS_FILE, "utf8");
    const parsed = JSON.parse(data);
    stats = {
      songs: parsed.songs || {},
      playlists: parsed.playlists || {},
      sources: parsed.sources || {},
      totalListeningMinutes: parsed.totalListeningMinutes || { global: 0, perUser: {} },
      totalSongsRequested: parsed.totalSongsRequested || { global: 0, perUser: {} },
      songRequests: parsed.songRequests || {}
    };
    log("[Stats] Successfully loaded stats.");
  } catch (error) {
    console.error("[Stats] Error loading stats, initializing new stats object.", error);
    await saveStats();
  }
}


/**
 * Logs additional listening time for a user.
 *
 * This function updates the global and per-user total listening minutes.
 *
 * @param userId - The ID of the user.
 * @param minutes - The number of minutes to add.
 */
export async function logListeningTime(userId: string, minutes: number): Promise<void> {
  stats.totalListeningMinutes.global += minutes;
  stats.totalListeningMinutes.perUser[userId] = (stats.totalListeningMinutes.perUser[userId] || 0) + minutes;
  await saveStats();
}

/**
 * Saves the current in-memory statistics to the STATS_FILE.
 *
 * This function writes the stats object to disk in JSON format.
 * Consider batching calls to this function for performance under high load.
 */
export async function saveStats(): Promise<void> {
  try {
    const dir = path.dirname(STATS_FILE);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2), "utf8");
    log("[Stats] Successfully saved stats.");
  } catch (error) {
    console.error("[Stats] Error saving stats:", error);
  }
}

/**
 * Logs that a song was requested by a user.
 *
 * This updates the global and per-user song request counts,
 * and records how often each song was requested by each user.
 *
 * @param userId - The ID of the user who requested the song.
 * @param songUrl - The URL of the requested song.
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
 *
 * This function increments the play count for the song,
 * updates per-user request counts, records the source used,
 * and accumulates the total listening time both globally and per user.
 *
 * @param userId - The ID of the user (for tracking per-user statistics).
 * @param songUrl - The URL of the song played.
 * @param playedMinutes - The number of minutes the song was played (rounded).
 * @param source - The source of the song (e.g., "youtube", "spotify").
 * @param title - The title of the song.
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
 *
 * This function increments the skipped count for a song.
 *
 * @param userId - The ID of the user who skipped the song.
 * @param songUrl - The URL of the song skipped.
 * @param title - The title of the song.
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
 * Logs that a playlist was requested by a user.
 *
 * This function updates the global and per-user playlist request counts.
 *
 * @param userId - The ID of the user who requested the playlist.
 * @param playlistUrl - The URL of the requested playlist.
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
 * Returns the current statistics data.
 *
 * @returns The StatsData object containing all current statistics.
 */
export function getStats(): StatsData {
  return stats;
}