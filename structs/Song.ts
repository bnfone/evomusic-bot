import { AudioResource, createAudioResource, StreamType } from "@discordjs/voice";
import youtube from "youtube-sr";
import { i18n } from "../utils/i18n";
import { videoPattern, isURL } from "../utils/patterns";
import { config } from "../utils/config";
import { extractYoutubeVideoId, fetchPipedAudioStream } from "../utils/piped";
import { Readable } from "stream";
import { log, error as logError } from "../utils/logger";

const ytdl = require('@distube/ytdl-core');

export interface SongData {
  url: string;
  title: string;
  duration: number;
}

export class Song {
  public readonly url: string;
  public readonly title: string;
  public readonly duration: number;

  public constructor({ url, title, duration }: SongData) {
    this.url = url;
    this.title = title;
    this.duration = duration;
  }

  public static async from(url: string = "", search: string = "") {
    const isYoutubeUrl = videoPattern.test(url);

    let songInfo;

    if (isYoutubeUrl) {
      try {
        songInfo = await ytdl.getBasicInfo(url);
        // Only log the YouTube link
      } catch (error) {
      logError('[Song] Error fetching song info', error as Error);
        throw error;
      }

      return new this({
        url: songInfo.videoDetails.video_url,
        title: songInfo.videoDetails.title,
        duration: parseInt(songInfo.videoDetails.lengthSeconds)
      });
    } else {
      const result = await youtube.searchOne(search);

      if (!result) {
        let err = new Error(`No search results found for ${search}`);
        err.name = "NoResults";
        if (isURL.test(url)) err.name = "InvalidURL";
        throw err;
      }

      try {
        songInfo = await ytdl.getBasicInfo(`https://youtube.com/watch?v=${result.id}`);
        // Only log the YouTube link
      } catch (error) {
        logError('[Song] Error fetching song info (search)', error as Error);
        throw error;
      }

      return new this({
        url: songInfo.videoDetails.video_url,
        title: songInfo.videoDetails.title,
        duration: parseInt(songInfo.videoDetails.lengthSeconds)
      });
    }
  }

  public async makeResource(): Promise<AudioResource<Song> | void> {
    let playStream;

    if (!this.url) {
      logError('[Song] URL is undefined or null');
      return;
    }

    if (this.url.includes("youtube")) {
      try {
        // Wrap the ytdl-core call in a Promise to catch early stream errors
        playStream = await new Promise((resolve, reject) => {
          const stream = ytdl(this.url, {
            filter: 'audioonly',
            quality: 'highestaudio',
            highWaterMark: 1 << 25 // Increase buffer size
          });
          stream.once("error", reject);
          stream.once("response", () => resolve(stream));
        });
      } catch (primaryError) {
        logError('[Song] Error fetching stream with ytdl-core', primaryError as Error);
        // Attempt fallback only if enabled in config
        if (config.PIPED_FALLBACK && config.PIPED_API_URL) {
          const videoId = extractYoutubeVideoId(this.url);
          if (videoId) {
            try {
              log(`Attempting Piped API fallback for video ID: ${videoId}`);
              playStream = await fetchPipedAudioStream(videoId, config.PIPED_API_URL);
            } catch (fallbackError) {
              logError('[Song] Error fetching piped API stream', fallbackError as Error);
              return;
            }
          } else {
            logError('[Song] Could not extract video ID from URL', new Error(this.url));
            return;
          }
        } else {
          return;
        }
      }
    } else {
      // Handling for other sources if needed
    }

    if (!playStream) {
      logError('[Song] Stream could not be retrieved');
      return;
    }

    // Cast playStream as a Readable stream to satisfy createAudioResource's type requirement
    return createAudioResource(playStream as Readable, {
      metadata: this,
      inputType: StreamType.Arbitrary,
      inlineVolume: true
    });
  }

  public startMessage() {
    return i18n.__mf("play.startedPlaying", { title: this.title, url: this.url });
  }
}