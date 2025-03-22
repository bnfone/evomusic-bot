import { promises as fs } from "fs";
import path from "path";

// Define the structure for a command log entry
interface CommandLogEntry {
  userId: string;
  command: string;
  timestamp: number;
}

// The log file path
const LOG_FILE = path.resolve(__dirname, "../data/commandLogs.json");

// In-memory log storage
let logs: CommandLogEntry[] = [];

/**
 * Logs the usage of a command by a user.
 * @param userId The ID of the user.
 * @param command The command name.
 */
export function logCommandUsage(userId: string, command: string): void {
  const entry: CommandLogEntry = { userId, command, timestamp: Date.now() };
  logs.push(entry);
  // For demonstration, we log to the console.
  console.log(`Logged command: ${command} by ${userId} at ${new Date(entry.timestamp).toISOString()}`);
}

/**
 * Saves the current logs to the log file.
 */
export async function saveLogs(): Promise<void> {
  try {
    await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2), "utf8");
    console.log("Command logs saved.");
  } catch (error) {
    console.error("Error saving command logs:", error);
  }
}

/**
 * Loads logs from the log file into memory.
 */
export async function loadLogs(): Promise<void> {
  try {
    const data = await fs.readFile(LOG_FILE, "utf8");
    logs = JSON.parse(data);
    console.log("Command logs loaded.");
  } catch (error) {
    console.error("Error loading command logs, starting with empty logs:", error);
    logs = [];
  }
}

/**
 * Returns all logged command entries.
 */
export function getLogs(): CommandLogEntry[] {
  return logs;
}