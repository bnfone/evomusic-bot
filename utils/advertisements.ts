// utils/advertisements.ts
// This module handles advertisement functionality, including selecting a random advertisement file
// from the data/advertisements folder and sending an advertisement embed to a text channel.

import { readdir } from 'fs/promises';
import path from 'path';
import { TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { config } from './config';

/**
 * Reads the advertisements directory and returns the full path of a randomly selected
 * .mp3 file. Returns null if no advertisement files are found.
 */
export async function getRandomAdFile(): Promise<string | null> {
  try {
    // Define the advertisement directory relative to the project root
    const adsDir = path.resolve(__dirname, '../data/advertisements');
    const files = await readdir(adsDir);
    // Filter only .mp3 files (case-insensitive)
    const adFiles = files.filter(file => file.toLowerCase().endsWith('.mp3'));

    if (adFiles.length === 0) {
      if (config.DEBUG) console.log('[Advertisements] No advertisement files found in the directory.');
      return null;
    }

    // Select a random advertisement file
    const randomIndex = Math.floor(Math.random() * adFiles.length);
    const selectedFile = adFiles[randomIndex];
    if (config.DEBUG) console.log(`[Advertisements] Selected advertisement file: ${selectedFile}`);
    return path.join(adsDir, selectedFile);
  } catch (error) {
    console.error('[Advertisements] Error reading advertisement directory:', error);
    return null;
  }
}

/**
 * Sends an advertisement embed to the specified text channel.
 * The embed contains a call-to-action with buttons for "Star on GitHub" and "Donate".
 */
export async function sendAdvertisementEmbed(textChannel: TextChannel): Promise<void> {
  try {
    const embed = new EmbedBuilder()
      .setTitle("Help the bot keep alive")
      .setDescription(
        "This bot is open source on GitHub! If you like the vibes, drop a star on the repo — it helps a lot.\n" +
        "Wanna support the project even more? Type `/donate` to help cover server costs. Building and running this thing takes time and money, so every bit means the world.\n" +
        "Thanks for being awesome!"
      )
      .setColor("#F8AA2A")
      .setTimestamp();

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("Star on GitHub")
        .setStyle(ButtonStyle.Link)
        .setURL("https://github.com/bnfone/discord-bot-evomusic"), // Replace with your GitHub repository URL
      new ButtonBuilder()
        .setLabel("Donate")
        .setStyle(ButtonStyle.Link)
        .setURL("https://bnf.one/donate") // Replace with your donation URL
    );

    await textChannel.send({ embeds: [embed], components: [actionRow] });
    if (config.DEBUG) console.log('[Advertisements] Advertisement embed sent.');
  } catch (error) {
    console.error('[Advertisements] Error sending advertisement embed:', error);
  }
}