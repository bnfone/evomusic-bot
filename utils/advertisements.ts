// utils/advertisements.ts
// This module handles advertisement functionality, including selecting a weighted random advertisement
// configuration from the data/advertisements/advertisements.json file and sending an advertisement embed to a text channel.
// Each advertisement consists of an embed, buttons, priority, and associated audio file(s).
// The complete ad is played (embed/buttons and the corresponding audio file).

import { readdir, readFile } from 'fs/promises';
import path from 'path';
import {
  TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ColorResolvable,
  Message
} from 'discord.js';
import { config } from './config';
import { log, error as logError } from './logger';
import { handleError } from './errorHandler';

/**
 * Interface for an advertisement configuration.
 */
interface AdConfig {
  embed: {
    title: string;
    description: string;
    color: string; // Hex color string (e.g. "#F8AA2A")
  };
  buttons: Array<{
    label: string;
    style: "PRIMARY" | "SECONDARY" | "SUCCESS" | "DANGER" | "LINK";
    url?: string;       // For LINK buttons.
    custom_id?: string; // For non-LINK buttons.
    emoji?: string;
  }>;
  priority: number;
  audioFiles: string[]; // List of advertisement audio file names.
}

/**
 * Loads the advertisement configurations from the JSON file located at
 * /data/advertisements/advertisements.json.
 * Returns an array of AdConfig.
 */
export async function loadAdConfigs(): Promise<AdConfig[]> {
  const adConfigPath = path.resolve(__dirname, '../data/advertisements/advertisements.json');
  try {
    const data = await readFile(adConfigPath, 'utf8');
    const configData = JSON.parse(data) as AdConfig[];
    log(`[Advertisements] Loaded ${configData.length} advertisement configurations from ${adConfigPath}`);
    return configData;
  } catch (error) {
    logError(`[Advertisements] Error loading advertisement configurations from ${adConfigPath}. Using default config.`, error as Error);
    // Return an array with one default advertisement configuration.
    return [{
      embed: {
        title: "🎶 Enjoying the vibes?",
        description:
          "This bot is fully open source and made with way too much love (and caffeine).\n" +
          "👉 Drop a ⭐ on the GitHub repo to support it!\n" +
          "💸 Feeling generous? Donations help with updates & server costs!\n" +
          "Every click fuels the music… and prevents one developer meltdown 😌❤️",
        color: "#F8AA2A"
      },
      buttons: [
        {
          label: "Star on GitHub",
          style: "LINK",
          url: "https://github.com/bnfone/discord-bot-evomusic"
        },
        {
          label: "Donate",
          style: "LINK",
          url: "https://bnf.one/devdonations"
        },
        {
          label: "Skip Ad",
          style: "PRIMARY",
          custom_id: "ad_skip",
          emoji: "🤝"
        }
      ],
      priority: 1,
      audioFiles: []
    }];
  }
}

/**
 * Selects one advertisement configuration using weighted random selection based on priority.
 * Higher priority values make the ad more likely to be selected.
 */
async function getWeightedRandomAdConfig(): Promise<AdConfig> {
  const adConfigs = await loadAdConfigs();
  const totalWeight = adConfigs.reduce((sum, ad) => sum + ad.priority, 0);
  let randomWeight = Math.random() * totalWeight;
  for (const ad of adConfigs) {
    if (randomWeight < ad.priority) {
      return ad;
    }
    randomWeight -= ad.priority;
  }
  return adConfigs[adConfigs.length - 1]; // fallback
}

/**
 * Converts a style string from the configuration to a valid ButtonStyle.
 * @param styleStr - The style string from the config.
 * @returns A ButtonStyle.
 */
function convertButtonStyle(styleStr: string): ButtonStyle {
  switch (styleStr.toLowerCase()) {
    case "primary":
      return ButtonStyle.Primary;
    case "secondary":
      return ButtonStyle.Secondary;
    case "success":
      return ButtonStyle.Success;
    case "danger":
      return ButtonStyle.Danger;
    case "link":
      return ButtonStyle.Link;
    default:
      logError(`[Advertisements] Unknown button style: ${styleStr}. Defaulting to Secondary.`);
      return ButtonStyle.Secondary;
  }
}

/**
 * Returns a random audio file path for the given advertisement configuration.
 * If the ad configuration specifies an audioFiles list, one file is selected at random.
 * Otherwise, returns null.
 */
export function getRandomAudioFileForAd(adConfig: AdConfig): string | null {
  if (adConfig.audioFiles && adConfig.audioFiles.length > 0) {
    const randomIndex = Math.floor(Math.random() * adConfig.audioFiles.length);
    const adsDir = path.resolve(__dirname, '../data/advertisements');
    const selectedFile = adConfig.audioFiles[randomIndex];
    log(`[Advertisements] Selected audio file for ad "${adConfig.embed.title}": ${selectedFile}`);
    return path.join(adsDir, selectedFile);
  }
  return null;
}

/**
 * Sends an advertisement embed to the specified text channel.
 * The embed and buttons are built using a weighted random advertisement configuration.
 * Returns an object containing the sent message and the ad configuration used.
 */
export async function sendAdvertisementEmbed(textChannel: TextChannel): Promise<{ message: Message | null, adConfig: AdConfig }> {
  try {
    const adConfig = await getWeightedRandomAdConfig();
    // Convert the embed color from hex to number.
    const colorNumber = parseInt(adConfig.embed.color.replace(/^#/, ''), 16);
    const embed = new EmbedBuilder()
      .setTitle(adConfig.embed.title)
      .setDescription(adConfig.embed.description)
      .setColor(colorNumber as ColorResolvable)
      .setTimestamp();

    // Build an action row from the configured buttons.
    const actionRow = new ActionRowBuilder<ButtonBuilder>();
    adConfig.buttons.forEach((btn) => {
      const button = new ButtonBuilder()
        .setLabel(btn.label)
        .setStyle(convertButtonStyle(btn.style));
      if (btn.style.toLowerCase() === "link" && btn.url) {
        button.setURL(btn.url);
      } else if (btn.custom_id) {
        button.setCustomId(btn.custom_id);
      }
      if (btn.emoji) {
        button.setEmoji(btn.emoji);
      }
      actionRow.addComponents(button);
    });
    
    const sentMessage = await textChannel.send({ embeds: [embed], components: [actionRow] });
    log('[Advertisements] Advertisement embed sent.');
    return { message: sentMessage, adConfig };
  } catch (error) {
    logError('[Advertisements] Error sending advertisement embed:', error as Error);
    // Optionally, you could call handleError(error) here.
    // Returning a default ad configuration along with null message.
    return {
      message: null,
      adConfig: {
        embed: {
          title: "Default Ad",
          description: "Default advertisement.",
          color: "#F8AA2A"
        },
        buttons: [],
        priority: 1,
        audioFiles: []
      }
    };
  }
}