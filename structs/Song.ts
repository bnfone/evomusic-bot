import { AudioResource, createAudioResource, StreamType } from "@discordjs/voice";
import youtube from "youtube-sr";
import { i18n } from "../utils/i18n";
import { videoPattern, isURL } from "../utils/patterns";
// Import the updated ytdl-core fork from @distube
import ytdl from "@distube/ytdl-core";

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
      const info = await ytdl.getInfo(url);
      return new this({
        url: info.videoDetails.video_url,
        title: info.videoDetails.title,
        duration: parseInt(info.videoDetails.lengthSeconds)
      });
    } else {
      const result = await youtube.searchOne(search);
      if (!result) {
        const err = new Error(`No search results found for ${search}`);
        err.name = isURL.test(url) ? "InvalidURL" : "NoResults";
        throw err;
      }
      const info = await ytdl.getInfo(`https://youtube.com/watch?v=${result.id}`);
      return new this({
        url: info.videoDetails.video_url,
        title: info.videoDetails.title,
        duration: parseInt(info.videoDetails.lengthSeconds)
      });
    }
  }

  public async makeResource(): Promise<AudioResource<Song> | void> {
    const stream = ytdl(this.url, {
      filter: "audioonly",
      quality: "highestaudio",
      highWaterMark: 1 << 25 // Increased buffer size for stability
    });

    return createAudioResource(stream, {
      metadata: this,
      inputType: StreamType.Arbitrary,
      inlineVolume: true
    });
  }

  public startMessage() {
    return i18n.__mf("play.startedPlaying", { title: this.title, url: this.url });
  }
}