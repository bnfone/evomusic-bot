/********************************************
 * utils/spotify.ts
 ********************************************/

// Import necessary modules and configuration
import axios from "axios";
import { config } from "./config";
import { getOdesliLink } from "./odesliUtils";
// Use the centralized logger functions from logger.ts
import { log, error as logError } from "../utils/logger";

/**
 * Type definition for the result of parseSpotifyLinkType().
 * It categorizes a Spotify URL as either an album, playlist, track, or unknown.
 */
interface SpotifyLinkTypeResult {
  type: "album" | "playlist" | "track" | "unknown";
  id: string | null;
}

/**
 * Retrieves the Spotify Access Token using the Client Credentials Flow.
 * Utilizes centralized logging and error handling.
 *
 * @returns {Promise<string>} The Spotify API access token.
 * @throws Throws an error if the token cannot be retrieved.
 */
export async function getSpotifyAccessToken(): Promise<string> {
  log("Requesting Spotify Access Token...");
  try {
    const { data } = await axios.post(
      "https://accounts.spotify.com/api/token",
      "grant_type=client_credentials",
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(
            `${config.SPOTIFY_CLIENT_ID}:${config.SPOTIFY_CLIENT_SECRET}`
          ).toString("base64")}`,
        },
      }
    );
    log("Successfully received Spotify Access Token.");
    return data.access_token;
  } catch (err) {
    // Cast error to Error to satisfy TypeScript
    logError("Error retrieving Spotify Access Token:", err as Error);
    throw err;
  }
}

/**
 * Parses the provided Spotify URL to determine whether it is an album, playlist, or track.
 *
 * Examples:
 *   - https://open.spotify.com/playlist/XYZ?si=...
 *   - https://open.spotify.com/album/XYZ?si=...
 *   - https://open.spotify.com/track/XYZ?si=...
 *
 * @param spotifyUrl - The Spotify URL to parse.
 * @returns {SpotifyLinkTypeResult} An object containing the type and the extracted ID.
 */
export function parseSpotifyLinkType(spotifyUrl: string): SpotifyLinkTypeResult {
  try {
    const url = new URL(spotifyUrl);
    // Split the URL's pathname into parts (e.g., ["playlist", "<ID>"])
    const parts = url.pathname.split("/").filter(Boolean);
    if (!parts[0] || !parts[1]) {
      return { type: "unknown", id: null };
    }
    const typeStr = parts[0];
    const id = parts[1].split("?")[0];

    if (typeStr === "playlist") {
      return { type: "playlist", id };
    } else if (typeStr === "album") {
      return { type: "album", id };
    } else if (typeStr === "track") {
      return { type: "track", id };
    }
    return { type: "unknown", id: null };
  } catch (err) {
    return { type: "unknown", id: null };
  }
}

/**
 * Helper function that fetches all tracks from a Spotify playlist using pagination.
 *
 * @param playlistId - The Spotify playlist ID.
 * @param accessToken - The access token obtained from Spotify.
 * @returns {Promise<string[]>} An array of Spotify track URLs from the playlist.
 */
async function fetchSpotifyPlaylistTracks(
  playlistId: string,
  accessToken: string
): Promise<string[]> {
  let tracks: string[] = [];
  let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

  while (nextUrl) {
    if (config.DEBUG) {
      log(`[Spotify] Loading playlist tracks from: ${nextUrl}`);
    }
    try {
      const { data } = await axios.get(nextUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      // Map each item to the Spotify URL of the track.
      const newTracks = data.items
        .map((item: any) => item.track?.external_urls?.spotify)
        .filter(Boolean);
      tracks.push(...newTracks);
      nextUrl = data.next; // Continue if there is a next page, otherwise null.
    } catch (err) {
      logError("[Spotify] Error fetching playlist tracks:", err as Error);
      break;
    }
  }
  return tracks;
}

/**
 * Helper function that fetches all tracks from a Spotify album using pagination.
 *
 * @param albumId - The Spotify album ID.
 * @param accessToken - The access token obtained from Spotify.
 * @returns {Promise<string[]>} An array of Spotify track URLs from the album.
 */
async function fetchSpotifyAlbumTracks(
  albumId: string,
  accessToken: string
): Promise<string[]> {
  let tracks: string[] = [];
  let nextUrl = `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`;

  while (nextUrl) {
    if (config.DEBUG) {
      log(`[Spotify] Loading album tracks from: ${nextUrl}`);
    }
    try {
      const { data } = await axios.get(nextUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      // Map each track to its Spotify URL.
      const newTracks = data.items
        .map((track: any) => track.external_urls?.spotify)
        .filter(Boolean);
      tracks.push(...newTracks);
      nextUrl = data.next;
    } catch (err) {
      logError("[Spotify] Error fetching album tracks:", err as Error);
      break;
    }
  }
  return tracks;
}

/**
 * Main function that accepts any Spotify URL (playlist or album),
 * fetches all contained song links, and returns an array of Spotify track URLs.
 *
 * For a track URL, it returns an empty array (or can be modified to return [spotifyUrl]).
 *
 * @param spotifyUrl - The Spotify URL to process.
 * @returns {Promise<string[]>} Array of Spotify track URLs.
 */
export async function getSpotifyTracks(spotifyUrl: string): Promise<string[]> {
  const accessToken = await getSpotifyAccessToken();
  const { type, id } = parseSpotifyLinkType(spotifyUrl);

  if (!id) {
    if (config.DEBUG) {
      log("[Spotify] No valid ID detected in URL.");
    }
    return [];
  }

  try {
    if (type === "playlist") {
      if (config.DEBUG) {
        log(`[Spotify] Loading playlist with ID: ${id}`);
      }
      return await fetchSpotifyPlaylistTracks(id, accessToken);
    } else if (type === "album") {
      if (config.DEBUG) {
        log(`[Spotify] Loading album as a playlist with ID: ${id}`);
      }
      return await fetchSpotifyAlbumTracks(id, accessToken);
    } else if (type === "track") {
      if (config.DEBUG) {
        log("[Spotify] URL is a track link. Returning empty array.");
      }
      return [];
    } else {
      if (config.DEBUG) {
        log("[Spotify] Unknown link type. Returning empty array.");
      }
      return [];
    }
  } catch (err) {
    logError("[Spotify] Error fetching tracks:", err as Error);
    return [];
  }
}

/**
 * Converts a Spotify track URL to a YouTube URL using the Odesli API.
 * This function is intended for single tracks.
 *
 * @param spotifyUrl - The Spotify track URL.
 * @returns {Promise<string | null>} The corresponding YouTube URL, or null if conversion fails.
 */
export async function spotifyTrackToYoutube(spotifyUrl: string): Promise<string | null> {
  if (config.DEBUG) {
    log(`[Spotify] Converting track to YouTube: ${spotifyUrl}`);
  }
  try {
    const youtubeUrl = await getOdesliLink(spotifyUrl);
    return youtubeUrl;
  } catch (err) {
    logError("[Spotify] Error converting track to YouTube:", err as Error);
    return null;
  }
}