declare module 'discord-rpc' {
    export class Client {
      constructor(options: { transport: 'ipc' });
      login(options: { clientId: string }): Promise<void>;
      setActivity(presence: Presence): void;
      clearActivity(): void;
      on(event: string, listener: (...args: any[]) => void): this;
    }
  
    export interface Presence {
      details?: string;
      state?: string;
      startTimestamp?: number;
      endTimestamp?: number;
      largeImageKey?: string;
      largeImageText?: string;
      smallImageKey?: string;
      smallImageText?: string;
      instance?: boolean;
      buttons?: { label: string; url: string }[];
    }
  }
  