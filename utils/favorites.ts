import { promises as fs } from "fs";
import path from "path";
import { log, error as logError } from "./logger";
import { i18n } from "./i18n";

/**
 * Interface for global favorite data.
 */
interface GlobalFavorite {
  title: string;
  count: number;
}

/**
 * Overall favorites data structure.
 * 'global' stores global counts for each song.
 * 'individual' stores an array of song URLs per user.
 */
interface FavoritesData {
  global: { [songUrl: string]: GlobalFavorite };
  individual: { [userId: string]: string[] };
}

// Define the path to the favorites file in the /data folder.
const FAVORITES_FILE = path.resolve(__dirname, "../data/favorites.json");

// In-memory storage for favorites (will be overwritten when loaded).
let favorites: FavoritesData = {
  global: {},
  individual: {}
};

/**
 * Loads favorites from the file.
 * If the file does not exist, it initializes and saves an empty favorites object.
 */
export async function loadFavorites(): Promise<void> {
  try {
    const data = await fs.readFile(FAVORITES_FILE, "utf8");
    favorites = JSON.parse(data);
    log("[Favorites] Successfully loaded favorites.");
  } catch (error) {
    logError("[Favorites] Error loading favorites, initializing new favorites object.", error as Error);
    await saveFavorites();
  }
}

/**
 * Saves the current favorites data to disk.
 */
export async function saveFavorites(): Promise<void> {
  try {
    const dir = path.dirname(FAVORITES_FILE);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(FAVORITES_FILE, JSON.stringify(favorites, null, 2), "utf8");
    log("[Favorites] Successfully saved favorites.");
  } catch (error) {
    logError("[Favorites] Error saving favorites:", error as Error);
  }
}

/**
 * Adds a song to a user's favorites and updates the global count.
 * Also logs the operation.
 *
 * @param userId - The ID of the user.
 * @param songUrl - The song's URL.
 * @param title - The song's title.
 */
export function addFavorite(userId: string, songUrl: string, title: string): void {
  try {
    // Ensure the user's favorites list exists.
    if (!favorites.individual[userId]) {
      favorites.individual[userId] = [];
    }
    // Add the song URL if not already present.
    if (!favorites.individual[userId].includes(songUrl)) {
      favorites.individual[userId].push(songUrl);
    }

    // Update global favorite counts.
    if (!favorites.global[songUrl]) {
      favorites.global[songUrl] = { title, count: 0 };
    }
    favorites.global[songUrl].count++;

    // Save the updated favorites asynchronously.
    saveFavorites().catch((err) =>
      logError("[Favorites] Error saving favorites after adding:", err as Error)
    );
    log(`[Favorites] User ${userId} added favorite: ${title}`);
  } catch (error) {
    logError("[Favorites] Error in addFavorite:", error as Error);
  }
}

/**
 * Removes a song from a user's favorites and adjusts the global count.
 *
 * @param userId - The ID of the user.
 * @param songUrl - The song's URL.
 */
export function removeFavorite(userId: string, songUrl: string): void {
  try {
    // Remove from individual's list if present.
    if (favorites.individual[userId]) {
      favorites.individual[userId] = favorites.individual[userId].filter(url => url !== songUrl);
    }
    // Decrease the global count; remove the entry if count reaches zero.
    if (favorites.global[songUrl]) {
      favorites.global[songUrl].count = Math.max(favorites.global[songUrl].count - 1, 0);
      if (favorites.global[songUrl].count === 0) {
        delete favorites.global[songUrl];
      }
    }
    saveFavorites().catch((err) =>
      logError("[Favorites] Error saving favorites after removal:", err as Error)
    );
    log(`[Favorites] User ${userId} removed favorite: ${songUrl}`);
  } catch (error) {
    logError("[Favorites] Error in removeFavorite:", error as Error);
  }
}

/**
 * Returns an array of favorite song URLs for the given user.
 *
 * @param userId - The user ID.
 * @returns An array of song URLs.
 */
export function getUserFavorites(userId: string): string[] {
  return favorites.individual[userId] || [];
}

/**
 * Returns an array of global favorite songs, sorted in descending order by count.
 *
 * @returns An array of objects containing songUrl, title, and count.
 */
export function getGlobalFavorites(): { songUrl: string; title: string; count: number }[] {
  const arr = Object.entries(favorites.global).map(([songUrl, data]) => ({
    songUrl,
    title: data.title,
    count: data.count,
  }));
  arr.sort((a, b) => b.count - a.count);
  return arr;
}

/**
 * Returns the complete favorites data.
 *
 * @returns The favorites data object.
 */
export function getFavoritesData(): FavoritesData {
  return favorites;
}