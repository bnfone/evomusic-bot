/********************************************
 * utils/voiceUtils.ts
 *
 * This module provides functionality to track users'
 * voice channel join times and accumulate listening time.
 *
 * It also automatically disconnects the bot from a voice channel
 * (and stops the corresponding queue) if no human user remains in that
 * specific voice channel (where the bot is active) for more than 1 minute.
 * Additionally, it sends i18n notifications:
 * - When the disconnect countdown starts.
 * - When the bot actually leaves the voice channel.
 *
 * All events are logged using the project's logger, and listening time
 * is updated via the stats module.
 ********************************************/

import { Client, VoiceState } from "discord.js";
import { MusicQueue } from "../structs/MusicQueue";
import { log, error as logError } from "./logger";
// Dynamically import the stats module to update listening time.
import { logListeningTime } from "./stats";
import { i18n } from "./i18n";

/**
 * Registers voice state update listeners on the provided client.
 *
 * @param client - The Discord client.
 * @param queues - The bot's collection of MusicQueue instances (keyed by guild ID).
 */
export function registerVoiceListeners(client: Client, queues: Map<string, MusicQueue>): void {
  // Map for tracking each user's join time (userId => timestamp)
  const voiceJoinTimestamps: Map<string, number> = new Map();
  // Map for tracking disconnect timers per guild (guildId => Timeout)
  const disconnectTimers: Map<string, NodeJS.Timeout> = new Map();

  client.on("voiceStateUpdate", (oldState: VoiceState, newState: VoiceState) => {
    // Retrieve a valid user ID from newState or oldState.
    const userId = newState.member?.id || oldState.member?.id;
    if (!userId) return;
    // Ignore bot users.
    if (newState.member?.user.bot) return;

    // Retrieve the guildId from the state.
    const guildId = newState.guild?.id || oldState.guild?.id;
    if (!guildId) return;
    
    // Get the active queue for this guild (if any).
    const queue = queues.get(guildId);

    // *** Process joins/moves only if the user is in the same channel as the bot.
    // When a user joins a voice channel or moves to a new channel:
    if (newState.channelId && newState.channelId !== oldState.channelId) {
      // Only record join time if the bot is active in that channel.
      if (queue && newState.channelId === queue.connection.joinConfig.channelId) {
        voiceJoinTimestamps.set(userId, Date.now());
      }
      // Cancel any scheduled disconnect if a human joined in the bot's channel.
      if (queue && disconnectTimers.has(guildId) && newState.channelId === queue.connection.joinConfig.channelId) {
        clearTimeout(disconnectTimers.get(guildId)!);
        disconnectTimers.delete(guildId);
      }
    }

    // When a user leaves a voice channel:
    if (oldState.channelId && !newState.channelId) {
      // Only update stats if the user was in the same channel as the bot.
      if (queue && oldState.channelId === queue.connection.joinConfig.channelId) {
        const joinTime = voiceJoinTimestamps.get(userId);
        if (joinTime) {
          const durationMinutes = (Date.now() - joinTime) / 60000;
          logListeningTime(userId, durationMinutes).catch(logError);
          voiceJoinTimestamps.delete(userId);
        }
        // Check if the bot's channel is now empty (ignoring bots).
        if (oldState.channel && oldState.channel.id === queue.connection.joinConfig.channelId &&
            oldState.channel.members.filter(m => !m.user.bot).size === 0) {
          // Notify and schedule disconnect.
          if (queue.textChannel) {
            queue.textChannel.send(i18n.__("voice.inactivityCountdown", { time: "1 minute" })).catch(logError);
          }
          if (!disconnectTimers.has(guildId)) {
            log(`[VoiceUtils] No human members in VC (${oldState.channel.id}) for guild ${guildId}. Scheduling disconnect in 60 seconds.`);
            const timer = setTimeout(() => {
              const activeQueue = queues.get(guildId);
              if (activeQueue && activeQueue.connection.state.status !== "destroyed") {
                if (activeQueue.textChannel) {
                  activeQueue.textChannel.send(i18n.__("voice.leftDueToInactivity")).catch(logError);
                }
                log(`[VoiceUtils] Disconnecting from VC in guild ${guildId} due to inactivity.`);
                activeQueue.stop();
                queues.delete(guildId);
              }
              disconnectTimers.delete(guildId);
            }, 60000);
            disconnectTimers.set(guildId, timer);
          }
        }
      }
    }

    // When a user moves from one channel to another:
    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      // If the user was in the bot's channel, log their elapsed time.
      if (queue && oldState.channelId === queue.connection.joinConfig.channelId) {
        const joinTime = voiceJoinTimestamps.get(userId);
        if (joinTime) {
          const durationMinutes = (Date.now() - joinTime) / 60000;
          logListeningTime(userId, durationMinutes).catch(logError);
        }
      }
      // Update join time if the user is now in the bot's channel.
      if (queue && newState.channelId === queue.connection.joinConfig.channelId) {
        voiceJoinTimestamps.set(userId, Date.now());
      }
      // If the old channel (bot's channel) is now empty, schedule disconnect.
      if (queue && oldState.channelId === queue.connection.joinConfig.channelId &&
          oldState.channel && oldState.channel.members.filter(m => !m.user.bot).size === 0) {
        if (queue.textChannel) {
          queue.textChannel.send(i18n.__("voice.inactivityCountdown", { time: "1 minute" })).catch(logError);
        }
        if (!disconnectTimers.has(guildId)) {
          log(`[VoiceUtils] No human members in previous VC (${oldState.channelId}) for guild ${guildId}. Scheduling disconnect in 60 seconds.`);
          const timer = setTimeout(() => {
            const activeQueue = queues.get(guildId);
            if (activeQueue && activeQueue.connection.state.status !== "destroyed") {
              if (activeQueue.textChannel) {
                activeQueue.textChannel.send(i18n.__("voice.leftDueToInactivity")).catch(logError);
              }
              log(`[VoiceUtils] Disconnecting from VC in guild ${guildId} due to inactivity.`);
              activeQueue.stop();
              queues.delete(guildId);
            }
            disconnectTimers.delete(guildId);
          }, 60000);
          disconnectTimers.set(guildId, timer);
        }
      }
      // If a user joins a new channel (and that channel is the bot's channel), cancel any scheduled disconnect.
      if (queue && newState.channelId === queue.connection.joinConfig.channelId && disconnectTimers.has(guildId)) {
        clearTimeout(disconnectTimers.get(guildId)!);
        disconnectTimers.delete(guildId);
      }
    }
  });

  // Periodic updater: every minute, check each active MusicQueue's voice channel
  // and ensure all human members are tracked—even if they were already present.
  setInterval(() => {
    const now = Date.now();
    // Iterate through each active MusicQueue.
    queues.forEach((queue, guildId) => {
      const channelId = queue.connection.joinConfig.channelId;
      if (!channelId) return;
      // Retrieve the guild from the client using the guildId.
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;
      // For each member in the bot's voice channel, ensure they are tracked.
      guild.members.cache
        .filter(m => !m.user.bot && m.voice.channelId === channelId)
        .forEach(member => {
          if (!voiceJoinTimestamps.has(member.id)) {
            voiceJoinTimestamps.set(member.id, now);
          }
        });
    });
    // For each tracked user, calculate elapsed time and update stats, then reset their join time.
    voiceJoinTimestamps.forEach((joinTime, userId) => {
      const durationMinutes = (now - joinTime) / 60000;
      logListeningTime(userId, durationMinutes).catch(logError);
      voiceJoinTimestamps.set(userId, now);
    });
  }, 60000); // Run every minute.
}