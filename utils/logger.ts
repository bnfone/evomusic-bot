import fs from 'fs';
import path from 'path';
import { config } from '../utils/config';

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
export function log(message: string): void {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  try {
    // Synchronously append to ensure immediate write
    fs.appendFileSync(logFile, logEntry);
  } catch (err) {
    console.error("Failed to write log:", err);
  }
  if (config.LOG_TERMINAL) {
    console.log(logEntry);
  }
}

/**
 * Logs an error message (with an optional error stack trace) to the log file,
 * while printing only a short explanation (without the full stack trace) to the console.
 * @param message The error message.
 * @param err Optional Error object.
 */
export function error(message: string, err?: Error): void {
  const fullError = `${message}${err ? ' - ' + err.stack : ''}`;
  log(fullError);
  // Print only a short explanation to the console
  console.error(`${message}${err ? ' - ' + err.message : ''}`);
}

/**
 * Logs the usage of a command with its parameters.
 * This entry is appended to the same general log file.
 * @param userId The ID of the user executing the command.
 * @param command The command name.
 * @param parameters Optional parameters sent with the command.
 */
export function logCommandUsage(userId: string, command: string, parameters?: any): void {
  const entryMessage = `Command: ${command} executed by ${userId} with parameters: ${JSON.stringify(parameters)}`;
  log(entryMessage);
}