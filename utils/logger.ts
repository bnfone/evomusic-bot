// File: utils/logger.ts

import fs from 'fs';
import path from 'path';
// Da wir uns schon in utils/ befinden, geht’s direkt auf config.ts
import { config } from './config';

// =======================
// General Logging Section
// =======================

// Define the logs directory (absolute path)
const logsDir = path.resolve(__dirname, '../data/logs');
// Ensure the directory exists
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}
// Use a log file name based on the current date (YYYY-MM-DD.log)
const logFile = path.join(logsDir, `${new Date().toISOString().split('T')[0]}.log`);

/**
 * Appends a log message with a timestamp to the general log file.
 * If config.LOG_TERMINAL is enabled, the log message is also printed to the terminal.
 * @param message The message to log.
 */
function info(message: string): void {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  try {
    // Synchronously append to ensure immediate write
    fs.appendFileSync(logFile, logEntry);
  } catch (err) {
    console.error("Failed to write log:", err);
  }
  if (config.LOG_TERMINAL) {
    console.log(logEntry.trim());
  }
}

/**
 * Logs an error message (with an optional error stack trace) to the log file,
 * while printing only a short explanation (without the full stack trace) to the console.
 * @param message The error message.
 * @param err Optional Error object.
 */
function error(message: string, err?: Error): void {
  const fullError = `${message}${err ? ' - ' + err.stack : ''}`;
  // Schreibe Stacktrace ins File
  info(fullError);
  // Und nur die Kurzfassung auf die Konsole
  console.error(`${message}${err ? ' - ' + err.message : ''}`);
}

/**
 * Logs the usage of a command mit User‑ID und Parametern.
 * @param userId The ID of the user executing the command.
 * @param command The command name.
 * @param parameters Optional parameters sent with the command.
 */
function logCommandUsage(userId: string, command: string, parameters?: any): void {
  const entryMessage = `Command: ${command} executed by ${userId}` +
    (parameters ? ` with parameters: ${JSON.stringify(parameters)}` : '');
  info(entryMessage);
}

// Wir stellen sowohl einen Named‑Export als auch den Default‑Export bereit:
export const logger = { info, error, logCommandUsage };
export default logger;
