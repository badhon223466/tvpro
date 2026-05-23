export interface Channel {
  id: string;
  name: string;
  logo: string;
  url: string;
  category: string;
  sourceId: string;
  online: boolean;
  tvgId?: string;
  resolution?: string;
  country?: string;
  isFavorite?: boolean;
}

export interface PlaylistSource {
  id: string;
  name: string;
  type: 'built-in' | 'file' | 'url' | 'pasted';
  channelCount: number;
  loaded: boolean;
  active: boolean;
  url?: string;
  content?: string;
}

export interface PlaybackSettings {
  autoNextOnError: boolean;
  theme: 'dark' | 'white' | 'black-oled';
  accentColor: 'red' | 'green' | 'purple' | 'orange';
  volume: number;
  muted: boolean;
}

export interface VisitorStats {
  online: number;
  totalVisitors: number;
}
