/********************************************
 * utils/cache.ts
 *
 * This module provides functions to load and save a cache object
 * to a JSON file located in /data/cache.json. The cache is used to store
 * platform-dependent song metadata, including song name, artist, and the associated
 * YouTube link. This cache helps to reduce redundant API calls.
 *
 * The cache structure is defined as a mapping from the original URL (as key)
 * to a CacheEntry object.
 *
 * All operations are logged using the project's logger and errors are handled
 * via the unified error handler.
 ********************************************/

import { promises as fs } from 'fs';
import path from 'path';
import { config } from './config';
import { log, error as logError } from './logger';
import { handleError } from './errorHandler';

// Define the path to the cache file in the /data folder.
const CACHE_PATH = path.resolve(__dirname, '../data/cache.json');

// Define an interface for a cache entry.
export interface CacheEntry {
  platform: 'appleMusic' | 'spotify' | 'odesli' | 'other';
  songName: string;
  artist: string;
  youtubeUrl: string;
  updatedAt: number;
}

// Define the type for the entire cache object.
export type Cache = {
  [originalUrl: string]: CacheEntry;
};

/**
 * Loads the cache from the JSON file located at CACHE_PATH.
 *
 * If the file does not exist, it creates an empty cache file.
 * Any errors encountered are logged and handled.
 *
 * @returns A promise that resolves to the cache object.
 */
export async function loadCache(): Promise<Cache> {
  try {
    // Check if the cache file exists.
    try {
      await fs.stat(CACHE_PATH);
    } catch {
      // If file does not exist, create an empty cache file.
      await fs.writeFile(CACHE_PATH, JSON.stringify({}, null, 2), 'utf-8');
      log('[Cache] Created new empty cache file.');
    }
    // Read the file contents.
    const rawData = await fs.readFile(CACHE_PATH, 'utf-8');
    const cache: Cache = JSON.parse(rawData);
    log('[Cache] Successfully loaded cache.');
    return cache;
  } catch (err) {
    logError('[Cache] Error loading cache:', err as Error);
    handleError(null, err as Error);
    return {};
  }
}

/**
 * Saves the given cache object to the JSON file at CACHE_PATH.
 *
 * All operations are logged, and errors are handled via the error handler.
 *
 * @param cache - The cache object to save.
 */
export async function saveCache(cache: Cache): Promise<void> {
  try {
    await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
    log('[Cache] Successfully saved cache.');
  } catch (err) {
    logError('[Cache] Error saving cache:', err as Error);
    handleError(null, err as Error);
  }
}

/**
 * Retrieves a cache entry for a given original URL.
 *
 * @param originalUrl - The key URL to lookup in the cache.
 * @returns A promise that resolves to the CacheEntry if found, or undefined if not.
 */
export async function getCacheEntry(originalUrl: string): Promise<CacheEntry | undefined> {
  const cache = await loadCache();
  return cache[originalUrl];
}

/**
 * Updates or creates a cache entry for the given original URL.
 *
 * The new entry is merged into the existing cache, and then the cache file is saved.
 *
 * @param originalUrl - The key URL for which to update the cache.
 * @param entry - The CacheEntry object to store.
 */
export async function updateCacheEntry(originalUrl: string, entry: CacheEntry): Promise<void> {
  const cache = await loadCache();
  cache[originalUrl] = entry;
  await saveCache(cache);
}