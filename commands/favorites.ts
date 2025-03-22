import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    PermissionsBitField,
    User,
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
  } from "../utils/favorites";
  // Import statically from @discordjs/voice
  import { DiscordGatewayAdapterCreator, joinVoiceChannel } from "@discordjs/voice";
  
  export default {
    data: new SlashCommandBuilder()
      .setName("favorite")
      .setDescription("Manage and play your favorite songs")
      // Subcommand: add favorite
      .addSubcommand((subcommand) =>
        subcommand
          .setName("add")
          .setDescription(
            "Add a song to your favorites. Use 'current' to mark the currently playing song."
          )
          .addStringOption((option) =>
            option
              .setName("song")
              .setDescription("Song URL or 'current'")
              .setRequired(true)
          )
      )
      // Subcommand: remove favorite
      .addSubcommand((subcommand) =>
        subcommand
          .setName("remove")
          .setDescription("Remove a song from your favorites by URL.")
          .addStringOption((option) =>
            option
              .setName("song")
              .setDescription("Song URL")
              .setRequired(true)
          )
      )
      // Subcommand: list your favorites
      .addSubcommand((subcommand) =>
        subcommand.setName("list").setDescription("List your favorite songs.")
      )
      // Subcommand: show global favorites
      .addSubcommand((subcommand) =>
        subcommand.setName("global").setDescription("Show the most popular songs globally.")
      )
      // Subcommand: play favorites
      .addSubcommand((subcommand) =>
        subcommand
          .setName("play")
          .setDescription("Play favorite songs.")
          .addStringOption((option) =>
            option
              .setName("source")
              .setDescription("Which favorites to play?")
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
              .setDescription(
                "Comma-separated list of user IDs or mentions (only used when source is 'users')"
              )
              .setRequired(false)
          )
      ),
    async execute(interaction: ChatInputCommandInteraction) {
      const subcommand = interaction.options.getSubcommand();
  
      // Subcommand: add
      if (subcommand === "add") {
        const songOption = interaction.options.getString("song", true);
        let songUrl: string;
        let title: string;
        if (songOption.toLowerCase() === "current") {
          // Get the currently playing song from the guild's queue.
          const queue = bot.queues.get(interaction.guild!.id);
          if (!queue || queue.songs.length === 0) {
            return interaction.reply({
              content: "No song is currently playing.",
              ephemeral: true,
            });
          }
          const currentSong = queue.songs[0];
          songUrl = currentSong.url;
          title = currentSong.title;
        } else {
          songUrl = songOption;
          // Try to fetch song info to get a nicer title
          try {
            const songObj = await Song.from(songUrl, songUrl);
            title = songObj.title;
          } catch (error) {
            // Fallback: use URL as title
            title = songUrl;
          }
        }
        addFavorite(interaction.user.id, songUrl, title);
        return interaction.reply({
          content: `Added song "${title}" to your favorites.`,
          ephemeral: true,
        });
      }
      // Subcommand: remove
      else if (subcommand === "remove") {
        const songUrl = interaction.options.getString("song", true);
        removeFavorite(interaction.user.id, songUrl);
        return interaction.reply({
          content: `Removed song from your favorites.`,
          ephemeral: true,
        });
      }
      // Subcommand: list (individual favorites)
      else if (subcommand === "list") {
        const favs = getUserFavorites(interaction.user.id);
        if (favs.length === 0) {
          return interaction.reply({
            content: "You have no favorite songs.",
            ephemeral: true,
          });
        }
        const output = favs.map((url, index) => `${index + 1}. ${url}`).join("\n");
        return interaction.reply({
          content: `Your favorite songs:\n${output}`,
          ephemeral: true,
        });
      }
      // Subcommand: global (global favorites)
      else if (subcommand === "global") {
        const globalFavs = getGlobalFavorites();
        if (globalFavs.length === 0) {
          return interaction.reply({
            content: "No global favorites yet.",
            ephemeral: true,
          });
        }
        const output = globalFavs
          .map(
            (fav, index) =>
              `${index + 1}. [${fav.title}](${fav.songUrl}) - ${fav.count} favorites`
          )
          .join("\n");
        return interaction.reply({
          content: `Global favorite songs:\n${output}`,
          ephemeral: true,
        });
      }
      // Subcommand: play (play favorites)
      else if (subcommand === "play") {
        const source = interaction.options.getString("source", true);
        let songUrls: string[] = [];
  
        if (source === "mine") {
          songUrls = getUserFavorites(interaction.user.id);
          if (songUrls.length === 0) {
            return interaction.reply({
              content: "You have no favorite songs to play.",
              ephemeral: true,
            });
          }
        } else if (source === "global") {
          const globalFavs = getGlobalFavorites();
          songUrls = globalFavs.map(fav => fav.songUrl);
          if (songUrls.length === 0) {
            return interaction.reply({
              content: "No global favorites available.",
              ephemeral: true,
            });
          }
        } else if (source === "users") {
          const usersInput = interaction.options.getString("users", false);
          if (!usersInput) {
            return interaction.reply({
              content: "Please provide one or more user IDs or mentions.",
              ephemeral: true,
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
            return interaction.reply({
              content: "None of the specified users have favorite songs.",
              ephemeral: true,
            });
          }
        }
  
        // Convert favorite URLs to Song objects.
        const songsToPlay = [];
        for (const url of songUrls) {
          try {
            const song = await Song.from(url, url);
            songsToPlay.push(song);
          } catch (error) {
            console.error(`Error fetching song from ${url}:`, error);
          }
        }
  
        if (songsToPlay.length === 0) {
          return interaction.reply({
            content: "Could not retrieve any songs from the selected favorites.",
            ephemeral: true,
          });
        }
  
        // Get or create a MusicQueue for the guild.
        let queue = bot.queues.get(interaction.guild!.id);
        const guildMember = interaction.guild!.members.cache.get(interaction.user.id);
        const channel = guildMember!.voice.channel;
        if (!channel) {
          return interaction.reply({
            content: i18n.__("play.errorNotChannel"),
            ephemeral: true,
          });
        }
        if (queue && channel.id !== queue.connection.joinConfig.channelId) {
          return interaction.reply({
            content: i18n.__mf("play.errorNotInSameChannel", { user: bot.client.user!.username }),
            ephemeral: true,
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
        
        return interaction.reply({
          content: `Queued ${songsToPlay.length} favorite song(s).`,
          ephemeral: true,
        });
      }
    },
  };