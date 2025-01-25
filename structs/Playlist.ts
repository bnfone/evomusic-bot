import youtube, { Playlist as YoutubePlaylist } from "youtube-sr";
import { config } from "../utils/config";
import { Song } from "./Song";

const pattern = /^.*(youtu.be\/|list=)([^#\&\?]*).*/i;

export class Playlist {
  public data: YoutubePlaylist;
  public videos: Song[];

  public constructor(playlist: YoutubePlaylist) {
    this.data = playlist;

    // Zur Sicherheit: Prüfen, ob playlist.videos definiert ist
    const rawVideos = this.data?.videos || [];

    this.videos = rawVideos
      .filter((video) => {
        // Entferne private oder gelöschte Videos
        if (!video.title) return false;
        if (video.title === "Private video" || video.title === "Deleted video") return false;
        return true;
      })
      .slice(0, config.MAX_PLAYLIST_SIZE - 1)
      .map((video) => {
        return new Song({
          title: video.title!,
          url: `https://youtube.com/watch?v=${video.id}`,
          duration: video.duration / 1000,
        });
      });
  }

  public static async from(url: string = "", search: string = ""): Promise<Playlist> {
    const urlValid = pattern.test(url);
    let playlist;

    try {
      if (urlValid) {
        playlist = await youtube.getPlaylist(url);
      } else {
        const result = await youtube.searchOne(search, "playlist");
        if (!result || !result.url) {
          throw new Error("Keine Playlist gefunden");
        }
        playlist = await youtube.getPlaylist(result.url);
      }

      if (!playlist) {
        // Falls getPlaylist zwar kein Error geworfen hat, aber kein Ergebnis zurückgab
        throw new Error("Fehler: YouTube-Playlist konnte nicht geladen werden.");
      }
    } catch (error) {
      console.error("Fehler beim Abrufen der YouTube-Playlist:", error);
      throw new Error("Fehler beim Abrufen der YouTube-Playlist.");
    }

    return new this(playlist);
  }
}