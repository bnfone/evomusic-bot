/********************************************
 * utils/platform.ts
 *
 * This module provides a function to convert an input URL
 * (which may come from YouTube, Spotify, Apple Music, etc.)
 * into a corresponding YouTube link.
 *
 * For Spotify and Apple Music URLs, the module extracts metadata
 * (song title and artist) and uses that information to perform a YouTube search.
 * If the extraction fails or the input URL does not match a known platform,
 * the Odesli API is used as a fallback.
 *
 * All operations are logged using the project's logger and errors are handled
 * via the unified error handler.
 ********************************************/

import { spotifyTrackToYoutube } from './spotify';
import { getAppleMusicSongData } from './applemusic';
import { getOdesliLink } from './odesli';
import { config } from './config';
import { log, error as logError } from './logger';
import { handleError } from './errorHandler';
import youtube from 'youtube-sr';
import { getCacheEntry, updateCacheEntry } from './cache';
import { youtubeURLPattern, spotifyPattern, appleMusicPattern } from './patterns';

/**
 * Converts an Apple Music URL to a YouTube URL.
 *
 * This function uses the Apple Music metadata extraction function to retrieve
 * the song title and artist. It then builds a search query and uses youtube-sr to find
 * the best matching YouTube video. If any error occurs during metadata extraction or search,
 * it falls back to the Odesli API.
 *
 * @param appleMusicUrl - The Apple Music song URL to convert.
 * @returns A promise that resolves to the corresponding YouTube URL as a string, or null if conversion fails.
 */
async function appleMusicSongToYoutube(appleMusicUrl: string): Promise<string | null> {
  log(`[Platform] Converting Apple Music URL to YouTube: ${appleMusicUrl}`);
  try {
    // Retrieve metadata and standardized URL.
    const { title, artist, standardizedUrl } = await getAppleMusicSongData(appleMusicUrl);
    
    // Check the cache: if a valid YouTube URL exists, return it immediately.
    const cachedEntry = await getCacheEntry(standardizedUrl);
    if (cachedEntry && cachedEntry.youtubeUrl && cachedEntry.youtubeUrl.trim() !== "") {
      log(`[Platform] Cache hit with YouTube URL for ${standardizedUrl}: ${cachedEntry.youtubeUrl}`);
      return cachedEntry.youtubeUrl;
    }
    
    // Otherwise, build the search query.
    const searchQuery = `${title} ${artist}`;
    log(`[Platform] Apple Music search query: "${searchQuery}"`);
    
    // Use youtube-sr to find a matching YouTube video.
    const videoResult = await youtube.searchOne(searchQuery);
    if (videoResult && videoResult.url) {
      log(`[Platform] Found YouTube video for Apple Music URL: ${videoResult.url}`);
      // If cache entry exists, update it with the found YouTube URL.
      if (cachedEntry) {
        cachedEntry.youtubeUrl = videoResult.url;
        await updateCacheEntry(standardizedUrl, cachedEntry);
      }
      return videoResult.url;
    } else {
      logError(`[Platform] No YouTube video found for query: "${searchQuery}"`);
      return await getOdesliLink(appleMusicUrl);
    }
  } catch (err) {
    logError(`[Platform] Error converting Apple Music URL: ${appleMusicUrl}`, err as Error);
    handleError(null, err as Error);
    return await getOdesliLink(appleMusicUrl);
  }
}

/**
 * Converts an input URL from various platforms into a YouTube URL.
 *
 * The function performs the following steps:
 * 1. If the input URL is already a YouTube link, it returns it as-is.
 * 2. If the URL matches the Spotify pattern, it calls spotifyTrackToYoutube.
 * 3. If the URL matches the Apple Music pattern, it calls appleMusicSongToYoutube.
 * 4. For any other URL or if none of the above conditions apply,
 *    it falls back to using the Odesli API.
 *
 * @param originalUrl - The original URL to convert.
 * @returns A promise that resolves to a YouTube URL string, or null if conversion fails.
 */
export async function convertToYouTubeLink(originalUrl: string): Promise<string | null> {
  log(`[Platform] Converting URL: ${originalUrl}`);

  try {
    // If the URL is already a YouTube URL, return it directly.
    if (youtubeURLPattern.test(originalUrl)) {
      log(`[Platform] URL is already a YouTube link.`);
      return originalUrl;
    }

    // If the URL is recognized as a Spotify link, convert using Spotify logic.
    if (spotifyPattern.test(originalUrl)) {
      log(`[Platform] URL recognized as a Spotify link. Converting...`);
      return await spotifyTrackToYoutube(originalUrl);
    }

    // If the URL is recognized as an Apple Music link, convert using Apple Music logic.
    if (appleMusicPattern.test(originalUrl)) {
      log(`[Platform] URL recognized as an Apple Music link. Converting...`);
      return await appleMusicSongToYoutube(originalUrl);
    }

    // For any other URL, fall back to the Odesli API conversion.
    log(`[Platform] URL does not match Spotify or Apple Music. Falling back to Odesli.`);
    return await getOdesliLink(originalUrl);
  } catch (err) {
    logError(`[Platform] Error during conversion for URL: ${originalUrl}`, err as Error);
    handleError(null, err as Error);
    return null;
  }
}