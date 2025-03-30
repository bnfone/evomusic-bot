import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionsBitField,
  EmbedBuilder,
  TextChannel
} from "discord.js";
import { i18n } from "../utils/i18n";
import { bot } from "../index";
import { Song } from "../structs/Song";
import {
  addFavorite,
  removeFavorite,
  getUserFavorites,
  getGlobalFavorites,
  getFavoritesData
} from "../utils/favorites";
import { DiscordGatewayAdapterCreator, joinVoiceChannel } from "@discordjs/voice";
import { log, error as logError } from "../utils/logger";

export default {
  data: new SlashCommandBuilder()
    .setName("favorite")
    .setDescription(i18n.__("favorite.description"))
    // Subcommand: add favorite
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription(i18n.__("favorite.add.description"))
        .addStringOption((option) =>
          option
            .setName("song")
            .setDescription(i18n.__("favorite.add.optionSong"))
            .setRequired(true)
        )
    )
    // Subcommand: remove favorite
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription(i18n.__("favorite.remove.description"))
        .addStringOption((option) =>
          option
            .setName("song")
            .setDescription(i18n.__("favorite.remove.optionSong"))
            .setRequired(true)
        )
    )
    // Subcommand: list your favorites
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription(i18n.__("favorite.list.description"))
    )
    // Subcommand: show global favorites
    .addSubcommand((subcommand) =>
      subcommand.setName("global").setDescription(i18n.__("favorite.global.description"))
    )
    // Subcommand: play favorites
    .addSubcommand((subcommand) =>
      subcommand
        .setName("play")
        .setDescription(i18n.__("favorite.play.description"))
        .addStringOption((option) =>
          option
            .setName("source")
            .setDescription(i18n.__("favorite.play.optionSource"))
            .setRequired(true)
            .addChoices(
              { name: "Mine", value: "mine" },
              { name: "Global", value: "global" },
              { name: "Users", value: "users" }
            )
        )
        .addStringOption((option) =>
          option
            .setName("users")
            .setDescription(i18n.__("favorite.play.optionUsers"))
            .setRequired(false)
        )
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const subcommand = interaction.options.getSubcommand();

      // === Subcommand: ADD ===
      if (subcommand === "add") {
        const songOption = interaction.options.getString("song", true);
        let songUrl: string;
        let title: string;
        if (songOption.toLowerCase() === "current") {
          const queue = bot.queues.get(interaction.guild!.id);
          if (!queue || queue.songs.length === 0) {
            return interaction.reply({
              content: i18n.__("favorite.add.noCurrentSong"),
              ephemeral: true,
            });
          }
          const currentSong = queue.songs[0];
          songUrl = currentSong.url;
          title = currentSong.title;
        } else {
          songUrl = songOption;
          try {
            const songObj = await Song.from(songUrl, songUrl);
            title = songObj.title;
          } catch (error) {
            title = songUrl;
          }
        }
        addFavorite(interaction.user.id, songUrl, title);
        log(`User ${interaction.user.id} added favorite: ${title}`);
        const embed = new EmbedBuilder()
          .setTitle(i18n.__("favorite.add.successTitle"))
          .setDescription(i18n.__mf("favorite.add.success", { title }))
          .setColor(0x00ae86)
          .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
      // === Subcommand: REMOVE ===
      else if (subcommand === "remove") {
        const songUrl = interaction.options.getString("song", true);
        removeFavorite(interaction.user.id, songUrl);
        log(`User ${interaction.user.id} removed favorite: ${songUrl}`);
        const embed = new EmbedBuilder()
          .setTitle(i18n.__("favorite.remove.successTitle"))
          .setDescription(i18n.__("favorite.remove.success"))
          .setColor(0xff0000)
          .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
      // === Subcommand: LIST ===
      else if (subcommand === "list") {
        const favUrls = getUserFavorites(interaction.user.id);
        if (favUrls.length === 0) {
          const embed = new EmbedBuilder()
            .setTitle(i18n.__("favorite.list.noneTitle"))
            .setDescription(i18n.__("favorite.list.none"))
            .setColor(0xffa500)
            .setTimestamp();
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        const favData = getFavoritesData();
        const fields = favUrls.map((url, index) => ({
          name: `${index + 1}. ${favData.global[url]?.title || url}`,
          value: `<${url}>`,
          inline: false,
        }));
        const embed = new EmbedBuilder()
          .setTitle(i18n.__("favorite.list.title"))
          .addFields(fields)
          .setColor(0x00ae86)
          .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
      // === Subcommand: GLOBAL ===
      else if (subcommand === "global") {
        const globalFavs = getGlobalFavorites();
        if (globalFavs.length === 0) {
          const embed = new EmbedBuilder()
            .setTitle(i18n.__("favorite.global.noneTitle"))
            .setDescription(i18n.__("favorite.global.none"))
            .setColor(0xffa500)
            .setTimestamp();
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        const fields = globalFavs.map((fav, index) => ({
          name: `${index + 1}. ${fav.title}`,
          value: `<${fav.songUrl}> — ${fav.count} favorites`,
          inline: false,
        }));
        const embed = new EmbedBuilder()
          .setTitle(i18n.__("favorite.global.title"))
          .addFields(fields)
          .setColor(0x00ae86)
          .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
      // === Subcommand: PLAY ===
      else if (subcommand === "play") {
        // Defer the reply to avoid timeout issues with lengthy processing.
        await interaction.deferReply({ ephemeral: true });
        const source = interaction.options.getString("source", true);
        let songUrls: string[] = [];

        if (source === "mine") {
          songUrls = getUserFavorites(interaction.user.id);
          if (songUrls.length === 0) {
            return interaction.editReply({
              content: i18n.__("favorite.play.noneMine")
            });
          }
        } else if (source === "global") {
          const globalFavs = getGlobalFavorites();
          songUrls = globalFavs.map(fav => fav.songUrl);
          if (songUrls.length === 0) {
            return interaction.editReply({
              content: i18n.__("favorite.play.noneGlobal")
            });
          }
        } else if (source === "users") {
          const usersInput = interaction.options.getString("users", false);
          if (!usersInput) {
            return interaction.editReply({
              content: i18n.__("favorite.play.usersMissing")
            });
          }
          const userIds = usersInput.split(",").map(str => {
            const trimmed = str.trim();
            const match = trimmed.match(/^<@!?(\d+)>$/);
            return match ? match[1] : trimmed;
          });
          userIds.forEach((uid) => {
            const favs = getUserFavorites(uid);
            songUrls.push(...favs);
          });
          songUrls = Array.from(new Set(songUrls));
          if (songUrls.length === 0) {
            return interaction.editReply({
              content: i18n.__("favorite.play.noneUsers")
            });
          }
        }

        // Convert favorite URLs to Song objects.
        const songsToPlay: Song[] = [];
        for (const url of songUrls) {
          try {
            const song = await Song.from(url, url);
            songsToPlay.push(song);
          } catch (error) {
            logError(`Error fetching song from ${url}:`, error as Error);
          }
        }
  
        if (songsToPlay.length === 0) {
          return interaction.editReply({
            content: i18n.__("favorite.play.errorNoSongs")
          });
        }
  
        // Get or create a MusicQueue for the guild.
        let queue = bot.queues.get(interaction.guild!.id);
        const guildMember = interaction.guild!.members.cache.get(interaction.user.id);
        const channel = guildMember?.voice.channel;
        if (!channel) {
          return interaction.editReply({
            content: i18n.__("play.errorNotChannel")
          });
        }
        if (queue && channel.id !== queue.connection.joinConfig.channelId) {
          return interaction.editReply({
            content: i18n.__mf("play.errorNotInSameChannel", { user: bot.client.user!.username })
          });
        }
        if (!queue) {
          queue = new (await import("../structs/MusicQueue")).MusicQueue({
            interaction,
            textChannel: interaction.channel as TextChannel,
            connection: joinVoiceChannel({
              channelId: channel.id,
              guildId: channel.guild.id,
              adapterCreator: channel.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
            }),
          });
          bot.queues.set(interaction.guild!.id, queue);
        }
  
        // Enqueue all songs.
        for (const song of songsToPlay) {
          queue.enqueue(song);
        }
  
        // Start playback if not already playing.
        if (!queue.isPlaying) {
          queue.play();
        }
  
        const embed = new EmbedBuilder()
          .setTitle(i18n.__("favorite.play.successTitle"))
          .setDescription(i18n.__mf("favorite.play.success", { count: songsToPlay.length }))
          .setColor(0x00ae86)
          .setTimestamp();
  
        return interaction.editReply({ embeds: [embed] });
      }
    } catch (err) {
      logError("[Favorite] Error executing favorite command:", err as Error);
      return interaction.reply({
        content: i18n.__("favorite.error"),
        ephemeral: true,
      });
    }
  },
};