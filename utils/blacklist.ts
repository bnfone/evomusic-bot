import { readFileSync, promises as fs } from "fs";
import path from "path";

interface BlacklistData {
  users: string[]; // List of user IDs
  songs: string[]; // List of song URLs (or IDs) that are blacklisted
}

const BLACKLIST_FILE = path.resolve(__dirname, "../data/blacklist.json");

// In-memory cache is no longer used for checking,
// because we always re-read the file from disk.

// Normalizes a URL by returning its origin and pathname,
// effectively stripping off query parameters and fragments.
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // For YouTube links, include the "v" parameter if present.
    if (
      parsed.hostname.includes("youtube.com") &&
      parsed.pathname === "/watch" &&
      parsed.searchParams.has("v")
    ) {
      return `${parsed.origin}${parsed.pathname}?v=${parsed.searchParams.get("v")}`;
    }
    // Optionally handle youtu.be short links:
    if (parsed.hostname === "youtu.be") {
      // The pathname in a youtu.be URL is like "/<videoId>"
      return `${parsed.origin}${parsed.pathname}`;
    }
    return parsed.origin + parsed.pathname;
  } catch (error) {
    return url;
  }
}

// Loads the blacklist from file, creating the file if necessary.
export async function loadBlacklist(): Promise<void> {
  try {
    const data = await fs.readFile(BLACKLIST_FILE, "utf8");
    // If needed, you can use the parsed data to initialize an in-memory cache.
  } catch (error) {
    // File doesn't exist – initialize and save the empty blacklist.
    await saveBlacklist();
  }
}

// Saves the current blacklist to file (ensuring the directory exists).
export async function saveBlacklist(): Promise<void> {
  try {
    const dir = path.dirname(BLACKLIST_FILE);
    await fs.mkdir(dir, { recursive: true });
    // Here, you could also maintain an in-memory variable if desired.
    // For now, we assume that modifications are done through the below functions.
    // We'll write the current state to disk.
    // (In this implementation, add/remove functions directly update the file.)
    await fs.writeFile(BLACKLIST_FILE, JSON.stringify(getBlacklist(), null, 2), "utf8");
  } catch (error) {
    console.error("Error saving blacklist:", error);
  }
}

// --- User blacklist functions ---

// Adds a user to the blacklist.
export async function addUserToBlacklist(userId: string): Promise<void> {
  try {
    const data = readFileSync(BLACKLIST_FILE, "utf8");
    const fileData = JSON.parse(data) as BlacklistData;
    if (!fileData.users.includes(userId)) {
      fileData.users.push(userId);
      await fs.writeFile(BLACKLIST_FILE, JSON.stringify(fileData, null, 2), "utf8");
    }
  } catch (error) {
    console.error("Error in addUserToBlacklist:", error);
  }
}

// Removes a user from the blacklist.
export async function removeUserFromBlacklist(userId: string): Promise<void> {
  try {
    const data = readFileSync(BLACKLIST_FILE, "utf8");
    const fileData = JSON.parse(data) as BlacklistData;
    const index = fileData.users.indexOf(userId);
    if (index > -1) {
      fileData.users.splice(index, 1);
      await fs.writeFile(BLACKLIST_FILE, JSON.stringify(fileData, null, 2), "utf8");
    }
  } catch (error) {
    console.error("Error in removeUserFromBlacklist:", error);
  }
}

// Checks if a user is blacklisted by always reading the file.
export function isUserBlacklisted(userId: string): boolean {
  try {
    const data = readFileSync(BLACKLIST_FILE, "utf8");
    const fileData = JSON.parse(data) as BlacklistData;
    return fileData.users.includes(userId);
  } catch (error) {
    console.error("Error reading blacklist file in isUserBlacklisted:", error);
    return false;
  }
}

// --- Song blacklist functions (with URL normalization) ---

// Adds a song to the blacklist.
export async function addSongToBlacklist(songUrl: string): Promise<void> {
  const normalized = normalizeUrl(songUrl);
  try {
    const data = readFileSync(BLACKLIST_FILE, "utf8");
    const fileData = JSON.parse(data) as BlacklistData;
    const exists = fileData.songs.some(
      storedUrl => normalizeUrl(storedUrl) === normalized
    );
    if (!exists) {
      fileData.songs.push(songUrl);
      await fs.writeFile(BLACKLIST_FILE, JSON.stringify(fileData, null, 2), "utf8");
    }
  } catch (error) {
    console.error("Error in addSongToBlacklist:", error);
  }
}

// Removes a song from the blacklist.
export async function removeSongFromBlacklist(songUrl: string): Promise<void> {
  const normalized = normalizeUrl(songUrl);
  try {
    const data = readFileSync(BLACKLIST_FILE, "utf8");
    const fileData = JSON.parse(data) as BlacklistData;
    const index = fileData.songs.findIndex(
      storedUrl => normalizeUrl(storedUrl) === normalized
    );
    if (index > -1) {
      fileData.songs.splice(index, 1);
      await fs.writeFile(BLACKLIST_FILE, JSON.stringify(fileData, null, 2), "utf8");
    }
  } catch (error) {
    console.error("Error in removeSongFromBlacklist:", error);
  }
}

// Checks if a song is blacklisted by always reading the file.
export function isSongBlacklisted(songUrl: string): boolean {
  const normalized = normalizeUrl(songUrl);
  try {
    const data = readFileSync(BLACKLIST_FILE, "utf8");
    const fileData = JSON.parse(data) as BlacklistData;
    return fileData.songs.some(
      storedUrl => normalizeUrl(storedUrl) === normalized
    );
  } catch (error) {
    console.error("Error reading blacklist file in isSongBlacklisted:", error);
    return false;
  }
}

// Returns the complete blacklist (for export purposes) by reading from file.
export function getBlacklist(): BlacklistData {
  try {
    const data = readFileSync(BLACKLIST_FILE, "utf8");
    return JSON.parse(data) as BlacklistData;
  } catch (error) {
    console.error("Error reading blacklist file in getBlacklist:", error);
    return { users: [], songs: [] };
  }
}