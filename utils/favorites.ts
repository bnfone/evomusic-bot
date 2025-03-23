import { promises as fs } from "fs";
import path from "path";

// Define the structure for global favorite data.
interface GlobalFavorite {
  title: string;
  count: number;
}

// The overall structure for favorites data.
interface FavoritesData {
  global: { [songUrl: string]: GlobalFavorite };
  individual: { [userId: string]: string[] }; // Array of song URLs per user
}

const FAVORITES_FILE = path.resolve(__dirname, "../data/favorites.json");

// In-memory storage (wird initial beim Laden überschrieben)
let favorites: FavoritesData = {
  global: {},
  individual: {}
};

/**
 * Loads favorites from file. If file does not exist, it is created.
 */
export async function loadFavorites(): Promise<void> {
  try {
    const data = await fs.readFile(FAVORITES_FILE, "utf8");
    favorites = JSON.parse(data);
  } catch (error) {
    // If file doesn't exist, initialize and save an empty favorites object.
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
  } catch (error) {
    console.error("Error saving favorites:", error);
  }
}

/**
 * Adds a song to a user's favorites and updates the global count.
 * @param userId The ID of the user.
 * @param songUrl The song's URL.
 * @param title The song's title.
 */
export function addFavorite(userId: string, songUrl: string, title: string): void {
  // Update individual favorites:
  if (!favorites.individual[userId]) {
    favorites.individual[userId] = [];
  }
  if (!favorites.individual[userId].includes(songUrl)) {
    favorites.individual[userId].push(songUrl);
  }

  // Update global favorites:
  if (!favorites.global[songUrl]) {
    favorites.global[songUrl] = { title, count: 0 };
  }
  favorites.global[songUrl].count++;

  saveFavorites().catch(console.error);
}

/**
 * Removes a song from a user's favorites and adjusts the global count.
 * @param userId The ID of the user.
 * @param songUrl The song's URL.
 */
export function removeFavorite(userId: string, songUrl: string): void {
  if (favorites.individual[userId]) {
    favorites.individual[userId] = favorites.individual[userId].filter(url => url !== songUrl);
  }
  if (favorites.global[songUrl]) {
    favorites.global[songUrl].count = Math.max(favorites.global[songUrl].count - 1, 0);
    if (favorites.global[songUrl].count === 0) {
      delete favorites.global[songUrl];
    }
  }
  saveFavorites().catch(console.error);
}

/**
 * Returns an array of favorite song URLs for the given user.
 * @param userId The user ID.
 */
export function getUserFavorites(userId: string): string[] {
  return favorites.individual[userId] || [];
}

/**
 * Returns an array of global favorite songs, sorted descending by count.
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



export function getFavoritesData(): { global: { [songUrl: string]: { title: string; count: number } }, individual: { [userId: string]: string[] } } {
    return favorites;
  }