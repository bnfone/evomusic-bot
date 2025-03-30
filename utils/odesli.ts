/********************************************
 * utils/odesli.ts
 *
 * This module provides a function to convert an original URL (e.g., from Apple Music or other platforms)
 * into a corresponding YouTube URL using the Odesli API as a fallback mechanism.
 *
 * The module implements rate-limiting: after a set number of requests, it enforces a cooldown period to
 * avoid hitting API rate limits.
 *
 * It also integrates with the new cache system (utils/cache.ts) to store and retrieve results,
 * reducing redundant API calls.
 *
 * All steps are logged and any errors are handled via the unified error handler.
 ********************************************/

import axios from 'axios';
import { log, error as logError } from './logger';
import { handleError } from './errorHandler';
import { getCacheEntry, updateCacheEntry, CacheEntry } from './cache';

// Rate limiting configuration
const MAX_REQUESTS_BEFORE_COOLDOWN = 8;
const COOLDOWN_TIME_MS = 90_000; // 90 seconds

// In-memory variables for rate limiting.
let requestsSinceCooldown = 0;
let isCooldownActive = false;

// Request queue to serialize Odesli API requests.
let isProcessing = false;
let pendingPromises: Array<() => void> = [];

/**
 * Enqueues a request to ensure that only one Odesli API call is processed at a time.
 *
 * @returns A promise that resolves when it's this request's turn.
 */
async function enqueue(): Promise<void> {
  return new Promise((resolve) => {
    pendingPromises.push(resolve);
    if (!isProcessing) {
      isProcessing = true;
      processQueue();
    }
  });
}

/**
 * Processes the queued requests sequentially.
 */
async function processQueue(): Promise<void> {
  while (pendingPromises.length > 0) {
    const resolve = pendingPromises.shift();
    if (resolve) resolve();
    // Wait for the next event loop tick.
    await new Promise((r) => setImmediate(r));
  }
  isProcessing = false;
}

/**
 * Converts an original URL into a corresponding YouTube URL using the Odesli API as a fallback.
 *
 * This function first checks the cache to see if a result already exists.
 * If not, it enforces rate limiting (after MAX_REQUESTS_BEFORE_COOLDOWN requests, a cooldown is applied)
 * and then makes an API call to Odesli to retrieve the YouTube URL.
 *
 * The result is stored in the cache with additional metadata.
 *
 * @param originalUrl - The URL to be converted.
 * @returns A promise that resolves to the corresponding YouTube URL as a string, or null if not found.
 */
export async function getOdesliLink(originalUrl: string): Promise<string | null> {
  // First, check the cache.
  try {
    const cachedEntry = await getCacheEntry(originalUrl);
    if (cachedEntry !== undefined) {
      log(`[Odesli] Cache hit for URL: ${originalUrl}`);
      return cachedEntry.youtubeUrl;
    }
  } catch (err) {
    logError(`[Odesli] Error checking cache for URL: ${originalUrl}`, err as Error);
  }

  // Enqueue this request to ensure serialized processing.
  await enqueue();

  // Rate limiting: if the number of requests reaches the threshold, enforce a cooldown.
  if (requestsSinceCooldown >= MAX_REQUESTS_BEFORE_COOLDOWN && !isCooldownActive) {
    log(`[Odesli] Reached ${MAX_REQUESTS_BEFORE_COOLDOWN} requests. Initiating cooldown for ${COOLDOWN_TIME_MS / 1000} seconds.`);
    isCooldownActive = true;
    await new Promise((resolve) => setTimeout(resolve, COOLDOWN_TIME_MS));
    requestsSinceCooldown = 0;
    isCooldownActive = false;
  }

  requestsSinceCooldown++;

  // Make the Odesli API request.
  log(`[Odesli] Making API request for URL: ${originalUrl}`);
  try {
    const response = await axios.get("https://api.song.link/v1-alpha.1/links", {
      params: { url: originalUrl },
    });

    // Extract the YouTube URL from the API response.
    const youtubeUrl: string | null = response.data.linksByPlatform?.youtube?.url || null;

    // Build a cache entry. Since Odesli does not provide song metadata,
    // we mark the song name and artist as "Unknown".
    const entry: CacheEntry = {
      platform: 'odesli',
      songName: "Unknown",
      artist: "Unknown",
      youtubeUrl: youtubeUrl || "",
      updatedAt: Date.now(),
    };

    // Update the cache with the result.
    await updateCacheEntry(originalUrl, entry);

    if (youtubeUrl) {
      log(`[Odesli] Found YouTube URL: ${youtubeUrl}`);
    } else {
      logError(`[Odesli] No YouTube URL found for: ${originalUrl}`);
    }
    return youtubeUrl;
  } catch (err) {
    logError(`[Odesli] Error during API request for URL: ${originalUrl}`, err as Error);
    // Even in case of error, store a cache entry with an empty YouTube URL.
    const entry: CacheEntry = {
      platform: 'odesli',
      songName: "Unknown",
      artist: "Unknown",
      youtubeUrl: "",
      updatedAt: Date.now(),
    };
    await updateCacheEntry(originalUrl, entry);
    handleError(null, err as Error);
    return null;
  }
}