/********************************************
 * utils/spotify.ts
 *
 * This module provides functions to interact with the Spotify API
 * for extracting track metadata (track name and primary artist) from a given
 * Spotify track URL. This metadata is then used to perform a YouTube search (using youtube‑sr)
 * to find a matching YouTube video that will be used in the Discord music bot queue.
 *
 * If metadata extraction fails or is disabled (via config.USE_METADATA_EXTRACTION),
 * the conversion falls back to using the Odesli API.
 *
 * Additionally, a helper function to retrieve Spotify playlist track URLs is included.
 *
 * All functions include detailed logging and error handling.
 ********************************************/

import axios, { AxiosResponse } from 'axios';
import { config } from './config';
import { log, error as logError } from './logger';
import { handleError } from './errorHandler';
import { getOdesliLink } from './odesli';
import youtube from 'youtube-sr';
// Import cache functions from the cache module.
import { CacheEntry, getCacheEntry, updateCacheEntry } from './cache';

/**
 * Retrieves the Spotify Access Token using the Client Credentials Flow.
 *
 * This function makes a POST request to Spotify's token endpoint using the
 * client credentials provided in the configuration.
 *
 * @returns A promise that resolves to a Spotify access token as a string.
 */
export async function getSpotifyAccessToken(): Promise<string> {
  log('[Spotify] Requesting Spotify Access Token...');
  try {
    const { data } = await axios.post(
      'https://accounts.spotify.com/api/token',
      'grant_type=client_credentials',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${config.SPOTIFY_CLIENT_ID}:${config.SPOTIFY_CLIENT_SECRET}`
          ).toString('base64')}`,
        },
      }
    );
    log('[Spotify] Successfully received Spotify Access Token.');
    return data.access_token;
  } catch (err) {
    logError('[Spotify] Error retrieving Spotify Access Token:', err as Error);
    throw err;
  }
}

/**
 * Parses a Spotify URL to determine its type and extract the relevant ID.
 *
 * The function supports track, album, and playlist URLs. For track conversion,
 * only URLs of type "track" with a valid ID are acceptable.
 *
 * @param spotifyUrl - The Spotify URL to parse.
 * @returns An object containing the type ('track', 'album', 'playlist', or 'unknown') and the extracted ID.
 */
export function parseSpotifyLinkType(spotifyUrl: string): { type: 'track' | 'album' | 'playlist' | 'unknown'; id: string | null } {
  try {
    const url = new URL(spotifyUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) {
      return { type: 'unknown', id: null };
    }
    const typeStr = parts[0];
    const id = parts[1].split('?')[0];
    if (typeStr === 'track') {
      return { type: 'track', id };
    } else if (typeStr === 'album') {
      return { type: 'album', id };
    } else if (typeStr === 'playlist') {
      return { type: 'playlist', id };
    }
    return { type: 'unknown', id: null };
  } catch (err) {
    logError('[Spotify] Error parsing Spotify URL:', err as Error);
    return { type: 'unknown', id: null };
  }
}

/**
 * Retrieves track metadata (name and primary artist) from Spotify using the track ID.
 *
 * This function calls the Spotify API's track endpoint and extracts the track's name
 * and the name of the first artist (assumed to be the primary artist).
 *
 * @param trackId - The Spotify track ID.
 * @param accessToken - A valid Spotify access token.
 * @returns An object containing the track name and primary artist.
 */
export async function getSpotifyTrackData(trackId: string, accessToken: string): Promise<{ trackName: string; artist: string }> {
  const endpoint = `https://api.spotify.com/v1/tracks/${trackId}`;
  log(`[Spotify] Fetching track data for ID: ${trackId}`);
  try {
    const { data } = await axios.get(endpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const trackName = data.name || 'Unknown';
    // Assume that the first artist in the array is the primary artist.
    const artist = (data.artists && data.artists.length > 0 && data.artists[0].name) ? data.artists[0].name : 'Unknown';
    log(`[Spotify] Retrieved track data - Name: ${trackName}, Artist: ${artist}`);
    return { trackName, artist };
  } catch (err) {
    logError(`[Spotify] Error fetching track data from API for ID: ${trackId}`, err as Error);
    throw err;
  }
}

/**
 * Converts a Spotify track URL to a YouTube URL using Spotify metadata and YouTube search.
 *
 * The function performs the following steps:
 * 1. Parses the Spotify URL to extract the track ID.
 * 2. If metadata extraction is enabled (config.USE_METADATA_EXTRACTION is true):
 *    a. Retrieves an access token.
 *    b. Fetches track metadata (track name and artist) via the Spotify API.
 *    c. Constructs a search query using the track name and artist.
 *    d. Checks the cache for an existing YouTube URL for the standardized track URL.
 *    e. Uses youtube-sr to search for the first matching YouTube video if needed.
 *    f. Updates the cache with the found YouTube URL.
 *    g. Returns the YouTube URL if found.
 * 3. If any step fails or if metadata extraction is disabled, it falls back to using Odesli.
 *
 * @param spotifyUrl - The Spotify track URL to convert.
 * @returns A promise that resolves to a YouTube URL string, or null if conversion fails.
 */
export async function spotifyTrackToYoutube(spotifyUrl: string): Promise<string | null> {
  log(`[Spotify] Converting Spotify track to YouTube: ${spotifyUrl}`);

  if (config.USE_METADATA_EXTRACTION) {
    try {
      // Parse the Spotify URL to ensure it's a track URL and extract the track ID.
      const { type, id } = parseSpotifyLinkType(spotifyUrl);
      if (type !== 'track' || !id) {
        logError(`[Spotify] Provided URL is not a valid track URL: ${spotifyUrl}`);
        return await getOdesliLink(spotifyUrl);
      }
      
      // Standardize the track URL for caching.
      const standardizedUrl = `https://open.spotify.com/track/${id}`;
      
      // Check if a YouTube URL is already cached for this Spotify track.
      const cachedEntry = await getCacheEntry(standardizedUrl);
      if (cachedEntry && cachedEntry.youtubeUrl && cachedEntry.youtubeUrl.trim() !== "") {
        log(`[Spotify] Cache hit for ${standardizedUrl}: ${cachedEntry.youtubeUrl}`);
        return cachedEntry.youtubeUrl;
      }
      
      // Retrieve the Spotify access token.
      const accessToken = await getSpotifyAccessToken();
      
      // Fetch track metadata using the Spotify API.
      const { trackName, artist } = await getSpotifyTrackData(id, accessToken);
      
      // Construct a search query using the track name and artist.
      const searchQuery = `${trackName} ${artist}`;
      log(`[Spotify] Searching YouTube for query: "${searchQuery}"`);

      // Use youtube-sr to search for the first matching YouTube video.
      const videoResult = await youtube.searchOne(searchQuery);
      if (videoResult && videoResult.url) {
        log(`[Spotify] Found YouTube video: ${videoResult.url}`);
        // Update the cache with the new YouTube URL.
        const newCacheEntry: CacheEntry = {
          platform: 'spotify',
          songName: trackName,
          artist: artist,
          youtubeUrl: videoResult.url,
          updatedAt: Date.now(),
        };
        await updateCacheEntry(standardizedUrl, newCacheEntry);
        return videoResult.url;
      } else {
        logError(`[Spotify] No YouTube video found for query: "${searchQuery}"`);
        return await getOdesliLink(spotifyUrl);
      }
    } catch (err) {
      logError('[Spotify] Error during metadata extraction and YouTube search. Falling back to Odesli.', err as Error);
      return await getOdesliLink(spotifyUrl);
    }
  } else {
    log('[Spotify] Metadata extraction disabled. Using Odesli for URL conversion.');
    return await getOdesliLink(spotifyUrl);
  }
}

/**
 * Retrieves Spotify track URLs from a Spotify playlist.
 *
 * This helper function:
 * 1. Parses the playlist URL to extract the playlist ID.
 * 2. Retrieves a Spotify access token.
 * 3. Calls the Spotify API endpoint to fetch playlist tracks (handling pagination).
 * 4. Returns an array of Spotify track URLs.
 *
 * @param playlistUrl - The Spotify playlist URL.
 * @returns An array of Spotify track URLs.
 */
export async function getSpotifyPlaylistTracks(playlistUrl: string): Promise<string[]> {
  try {
    const urlObj = new URL(playlistUrl);
    const parts = urlObj.pathname.split("/").filter(Boolean);
    if (parts[0] !== "playlist" || !parts[1]) return [];
    const playlistId = parts[1].split("?")[0];

    const accessToken = await getSpotifyAccessToken();
    const trackUrls: string[] = [];
    let nextUrl: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

    while (nextUrl) {
      // Provide explicit type annotation for the response.
      const response: AxiosResponse<any> = await axios.get(nextUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      // Extract the data.
      const data: any = response.data;
      const newUrls = data.items
        .map((item: any) => item.track?.external_urls?.spotify)
        .filter((url: string) => !!url);
      trackUrls.push(...newUrls);
      nextUrl = data.next; // This will be null when no further pages exist.
    }
    return trackUrls;
  } catch (error) {
    logError("[Spotify] Error retrieving Spotify playlist tracks:", error as Error);
    return [];
  }
}