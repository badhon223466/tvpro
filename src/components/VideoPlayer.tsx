import React, { useRef, useEffect, useState } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Heart,
  Info,
  RotateCcw,
  Maximize,
  Minimize,
  ChevronLeft,
  ChevronRight,
  Menu,
  Home,
  X,
  Search,
  Check,
  ChevronDown,
  MonitorPlay
} from 'lucide-react';
import { Channel, PlaybackSettings } from '../types';
import ChannelLogo from './ChannelLogo';

interface VideoPlayerProps {
  channel: Channel;
  filteredChannels: Channel[];
  onClose: () => void;
  onNavigateChannel: (direction: 'prev' | 'next') => void;
  onSelectChannel: (channel: Channel) => void;
  isFavorite: boolean;
  onToggleFavorite: (channelId: string) => void;
  playbackSettings: PlaybackSettings;
  updateSettings: (settings: Partial<PlaybackSettings>) => void;
  onSwitchToLastChannel: () => void;
  hasLastChannel: boolean;
}

export default function VideoPlayer({
  channel,
  filteredChannels,
  onClose,
  onNavigateChannel,
  onSelectChannel,
  isFavorite,
  onToggleFavorite,
  playbackSettings,
  updateSettings,
  onSwitchToLastChannel,
  hasLastChannel,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // States
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [showInfo, setShowInfo] = useState<boolean>(false);
  const [showResolutionMenu, setShowResolutionMenu] = useState<boolean>(false);
  const [showChannelDrawer, setShowChannelDrawer] = useState<boolean>(false);
  const [aspectRatio, setAspectRatio] = useState<'contain' | 'cover' | 'fill'>('contain');
  const [selectedResolution, setSelectedResolution] = useState<string>('Auto');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [drawerQuery, setDrawerQuery] = useState<string>('');
  const [streamMeta, setStreamMeta] = useState({
    fps: 60,
    bitrate: '5.2 Mbps',
    codec: 'H.264 / AAC',
    latency: '1.2s',
    buffer: '12s',
  });
  const [drawerCategory, setDrawerCategory] = useState<string>('All');
  const [showQualityBadge, setShowQualityBadge] = useState<boolean>(false);

  // Controls auto-hide timeout
  const controlsTimeout = useRef<NodeJS.Timeout | null>(null);

  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => {
      if (isPlaying && !showInfo && !showResolutionMenu && !showChannelDrawer) {
        setShowControls(false);
      }
    }, 4500);
  };

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    };
  }, [isPlaying, showInfo, showResolutionMenu, showChannelDrawer]);

  // Handle HLS and regular MP4 loading
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Stream status indicator simulation
    setStreamMeta({
      fps: channel.url.includes('.m3u8') ? 50 : 60,
      bitrate: channel.url.includes('.m3u8') ? '3.8 Mbps' : '6.4 Mbps',
      codec: channel.url.includes('.m3u8') ? 'HEVC / H.265' : 'H.264 / AAC',
      latency: channel.url.includes('.m3u8') ? '0.8s' : '1.4s',
      buffer: '8.4s',
    });

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHls = channel.url.toLowerCase().includes('.m3u8');

    if (isHls) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 60,
        });
        hlsRef.current = hls;
        hls.loadSource(channel.url);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (isPlaying) {
            video.play().catch(() => setIsPlaying(false));
          }
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.log('Fatal network error inside player, retrying...');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log('Fatal media error, attempting recovery...');
                hls.recoverMediaError();
                break;
              default:
                console.log('Fatal error encountered, restarting stream reload.');
                if (playbackSettings.autoNextOnError) {
                  onNavigateChannel('next');
                }
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = channel.url;
        if (isPlaying) {
          video.play().catch(() => setIsPlaying(false));
        }
      }
    } else {
      video.src = channel.url;
      video.load();
      if (isPlaying) {
        video.play().catch(() => setIsPlaying(false));
      }
    }

    // Set standard values when metadata loads
    const handleLoadedMetadata = () => {
      setDuration(video.duration || 0);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime || 0);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [channel.url]);

  // Sync settings volume & muted state to video tag
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = playbackSettings.muted ? 0 : playbackSettings.volume / 100;
    }
  }, [playbackSettings.volume, playbackSettings.muted]);

  // Handle Play/Pause
  const handlePlayPause = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation(); // Avoid triggering container click behavior
    }
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().catch(() => {});
      setIsPlaying(true);
    }
    resetControlsTimeout();
  };

  // Skip progress
  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const value = parseFloat(e.target.value);
    video.currentTime = value;
    setCurrentTime(value);
    resetControlsTimeout();
  };

  // Aspect ratio cyclic switcher
  const handleToggleAspectRatio = () => {
    const modes: ('contain' | 'cover' | 'fill')[] = ['contain', 'cover', 'fill'];
    const nextIdx = (modes.indexOf(aspectRatio) + 1) % modes.length;
    setAspectRatio(modes[nextIdx]);
    resetControlsTimeout();
  };

  // Fullscreen container handler
  const handleToggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch((err) => {
        console.error(`Error requesting fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
    resetControlsTimeout();
  };

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  // Picture in picture handler
  const handleTogglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (video.requestPictureInPicture) {
        await video.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('PiP not fully supported or active in container context:', err);
    }
    resetControlsTimeout();
  };

  // Keyboard controls configuration
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'f':
          handleToggleFullscreen();
          break;
        case 'm':
          updateSettings({ muted: !playbackSettings.muted });
          break;
        case 'arrowright':
          if (videoRef.current) videoRef.current.currentTime += 10;
          break;
        case 'arrowleft':
          if (videoRef.current) videoRef.current.currentTime -= 10;
          break;
        case 'arrowup':
          e.preventDefault();
          updateSettings({ volume: Math.min(100, playbackSettings.volume + 5) });
          break;
        case 'arrowdown':
          e.preventDefault();
          updateSettings({ volume: Math.max(0, playbackSettings.volume - 5) });
          break;
        case 'escape':
          if (showChannelDrawer) setShowChannelDrawer(false);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, playbackSettings, showChannelDrawer]);

  // Format second duration helper
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs === Infinity) return 'Live';
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const remainingSecs = Math.floor(secs % 60);

    const pad = (num: number) => num.toString().padStart(2, '0');
    if (hours > 0) {
      return `${pad(hours)}:${pad(mins)}:${pad(remainingSecs)}`;
    }
    return `${pad(mins)}:${pad(remainingSecs)}`;
  };

  // Real-time clock to show on top right
  const [systemTime, setSystemTime] = useState<string>('');
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      const h = d.getHours().toString().padStart(2, '0');
      const m = d.getMinutes().toString().padStart(2, '0');
      const s = d.getSeconds().toString().padStart(2, '0');
      setSystemTime(`${h}:${m}:${s}`);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Filter drawer channels
  const activeDrawerChannels = filteredChannels.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(drawerQuery.toLowerCase());
    const matchesCategory = drawerCategory === 'All' || c.category === drawerCategory;
    return matchesSearch && matchesCategory;
  });

  // Extract unique categories for drawer filtering
  const categoriesList = ['All', ...Array.from(new Set(filteredChannels.map((c) => c.category)))];

  // Accent color helpers mapping
  const accentClasses = {
    red: {
      bg: 'bg-red-600 hover:bg-red-700',
      text: 'text-red-500',
      border: 'border-red-600',
      accent: 'accent-red-600',
      glow: 'shadow-[0_0_12px_rgba(220,38,38,0.5)]',
    },
    green: {
      bg: 'bg-emerald-600 hover:bg-emerald-700',
      text: 'text-emerald-500',
      border: 'border-emerald-600',
      accent: 'accent-emerald-600',
      glow: 'shadow-[0_0_12px_rgba(16,185,129,0.5)]',
    },
    purple: {
      bg: 'bg-violet-600 hover:bg-violet-700',
      text: 'text-violet-500',
      border: 'border-violet-600',
      accent: 'accent-violet-600',
      glow: 'shadow-[0_0_12px_rgba(139,92,246,0.5)]',
    },
    orange: {
      bg: 'bg-amber-600 hover:bg-amber-700',
      text: 'text-amber-500',
      border: 'border-amber-600',
      accent: 'accent-amber-600',
      glow: 'shadow-[0_0_12px_rgba(245,158,11,0.5)]',
    },
  }[playbackSettings.accentColor];

  // Render aspect mode text helper
  const getAspectModeLabel = () => {
    switch (aspectRatio) {
      case 'contain': return 'Contain';
      case 'cover': return 'Cover';
      case 'fill': return 'Stretch';
    }
  };

  return (
    <div
      id="tvpro-player-overlay"
      ref={containerRef}
      onMouseMove={resetControlsTimeout}
      onClick={() => resetControlsTimeout()}
      className={`fixed inset-0 z-50 flex items-center justify-center select-none overflow-hidden transition-all duration-300 ${
        playbackSettings.theme === 'white' ? 'bg-zinc-100' : 'bg-black'
      }`}
    >
      {/* Background glowing ambient light under actual video */}
      <div className="absolute inset-0 bg-radial from-neutral-900/40 via-transparent to-transparent pointer-events-none" />

      {/* Main Video element with specified object-fit */}
      <video
        id="tvpro-video-stream-element"
        ref={videoRef}
        playsInline
        webkit-playsinline="true"
        onClick={handlePlayPause}
        className={`w-full h-full cursor-pointer transition-all duration-200 ${
          aspectRatio === 'cover'
            ? 'object-cover'
            : aspectRatio === 'fill'
            ? 'object-fill'
            : 'object-contain'
        }`}
      />

      {/* Middle Play/Pause screen controller with large animated ring */}
      {!isPlaying && (
        <div
          onClick={handlePlayPause}
          className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 transition-all cursor-pointer group"
        >
          <div className="flex flex-col items-center gap-3">
            <div className={`p-6 rounded-full bg-black/70 border border-neutral-700 text-white backdrop-blur-md transform transition-all group-hover:scale-110 duration-200 shadow-2xl ${accentClasses.glow}`}>
              <Play size={44} className="fill-white translate-x-0.5" />
            </div>
            <span className="text-white text-xs font-semibold tracking-widest bg-black/60 px-3 py-1.5 rounded-full border border-neutral-800">
              STREAM PAUSED
            </span>
          </div>
        </div>
      )}

      {/* TOP HEADER CONTROLS */}
      <div
        className={`absolute top-0 inset-x-0 bg-gradient-to-b from-black/85 via-black/50 to-transparent p-4 flex flex-col gap-2 transition-all duration-300 z-35 ${
          showControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-8 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between w-full">
          {/* Header left: info channels */}
          <div className="flex items-center gap-3 text-white">
            <div className="w-11 h-11 rounded-full bg-neutral-850 border-2 border-neutral-700 shadow-md flex items-center justify-center font-bold text-lg overflow-hidden select-none p-1 shrink-0">
              {channel.logo ? (
                <ChannelLogo 
                  logo={channel.logo} 
                  name={channel.name} 
                  className="max-h-full max-w-full object-contain rounded-sm"
                  fallbackClassName="text-lg font-bold font-sans text-neutral-300"
                />
              ) : (
                <MonitorPlay size={20} className="text-neutral-400" />
              )}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight line-clamp-1 max-w-sm md:max-w-xl">
                  {channel.name}
                </h1>
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] uppercase tracking-wider bg-neutral-800 text-neutral-300 py-0.5 px-2 rounded font-medium border border-neutral-700/60">
                  {channel.category}
                </span>
                <span className="text-[10px] uppercase tracking-wider bg-red-600/20 text-red-400 py-0.5 px-2 rounded font-semibold border border-red-500/30">
                  {channel.sourceId.toUpperCase()}
                </span>
                {channel.resolution && (
                  <span className="text-[10px] bg-sky-500/20 text-sky-400 font-mono py-0.5 px-1.5 rounded border border-sky-400/20">
                    {channel.resolution}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Header right: clock & close toggle */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex font-mono text-xs text-neutral-300 py-1 px-3 bg-neutral-900/85 backdrop-blur-sm border border-neutral-800/85 rounded-full select-none gap-2">
              <span className="text-neutral-500">CLOCK</span>
              <span className="text-neutral-200 font-semibold">{systemTime}</span>
            </div>

            {/* Change playlists quick shortcut */}
            <button
              id="player-drawer-toggle-btn"
              onClick={() => {
                setShowChannelDrawer(true);
                setShowControls(true);
              }}
              className="p-2.5 rounded-lg bg-neutral-900/85 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800/85 transition-all outline-none"
              title="Show Channel List Sidebar"
            >
              <Menu size={18} />
            </button>

            {/* Back button */}
            <button
              id="player-home-exit-btn"
              onClick={onClose}
              className="p-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-900/20 border border-red-500/20 transition-all outline-none"
              title="Return to Main Panel"
            >
              <Home size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* HORIZONTAL LEFT & RIGHT STREAM SKIP ARROWS */}
      <div className="absolute inset-y-0 inset-x-4 flex items-center justify-between pointer-events-none z-15">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigateChannel('prev');
          }}
          className={`p-3 rounded-full bg-black/60 hover:bg-neutral-900/90 text-white pointer-events-auto border border-neutral-800 shadow-2xl transition-all duration-200 transform hover:scale-105 opacity-0 sm:group-hover:opacity-100 ${
            showControls ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
          }`}
          title="Previous Channel"
        >
          <ChevronLeft size={24} />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigateChannel('next');
          }}
          className={`p-3 rounded-full bg-black/60 hover:bg-neutral-900/90 text-white pointer-events-auto border border-neutral-800 shadow-2xl transition-all duration-200 transform hover:scale-105 opacity-0 sm:group-hover:opacity-100 ${
            showControls ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
          }`}
          title="Next Channel"
        >
          <ChevronRight size={24} />
        </button>
      </div>

      {/* STREAM METADATA POP OVER LAY PANEL */}
      {showInfo && (
        <div
          className="absolute max-w-sm md:max-w-md bg-neutral-950/95 text-white p-5 rounded-2xl border border-neutral-800 shadow-2xl z-40 backdrop-blur-md transform translate-x-0 bottom-24 left-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-3">
            <h3 className="font-bold text-sm tracking-widest text-neutral-100 flex items-center gap-2">
              <Info size={14} className={accentClasses.text} />
              STREAM ENGINE TELEMETRY
            </h3>
            <button
              onClick={() => setShowInfo(false)}
              className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white"
            >
              <X size={12} />
            </button>
          </div>
          <div className="space-y-2 font-mono text-[11px] text-neutral-300">
            <p className="flex justify-between">
              <span className="text-neutral-500">Stream Source URL:</span>
              <span className="text-neutral-200 max-w-[220px] truncate select-all">{channel.url}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-neutral-500">Bitrate Bandwidth:</span>
              <span className="text-neutral-200">{streamMeta.bitrate}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-neutral-500">Video Framing Rate:</span>
              <span className="text-neutral-200">{streamMeta.fps} fps</span>
            </p>
            <p className="flex justify-between">
              <span className="text-neutral-500">Payload Codec:</span>
              <span className="text-neutral-200">{streamMeta.codec}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-neutral-500">Network Latency:</span>
              <span className="text-emerald-400 font-semibold">{streamMeta.latency}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-neutral-500">Buffer Health:</span>
              <span className="text-emerald-400">{streamMeta.buffer}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-neutral-500">Player Engine:</span>
              <span className="text-red-400">hls.js v1.5.x (Hardware Accel)</span>
            </p>
          </div>
        </div>
      )}

      {/* RESOLUTION QUALITY UP MENU */}
      {showResolutionMenu && (
        <div
          className="absolute bottom-24 right-5 bg-neutral-950/95 border border-neutral-800 text-white rounded-xl shadow-2xl p-2 min-w-[150px] z-40 backdrop-blur-md"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-neutral-400 text-[10px] font-bold uppercase tracking-wider border-b border-neutral-800/80 mb-1">
            Stream Resolution
          </div>
          {['1080p (FHD)', '720p (HD)', '480p (SD)', 'Auto'].map((res) => {
            const isSel = selectedResolution === res;
            return (
              <button
                key={res}
                onClick={() => {
                  setSelectedResolution(res);
                  setShowResolutionMenu(false);
                  setShowQualityBadge(true);
                  setTimeout(() => setShowQualityBadge(false), 2000);
                  resetControlsTimeout();
                }}
                className={`flex items-center justify-between w-full text-left px-3 py-2 text-xs rounded-lg transition-colors ${
                  isSel ? 'bg-neutral-850 text-white font-semibold' : 'text-neutral-300 hover:bg-neutral-900'
                }`}
              >
                <span>{res}</span>
                {isSel && <Check size={14} className={accentClasses.text} />}
              </button>
            );
          })}
        </div>
      )}

      {/* QUALITY SWITCH TOAST BAR */}
      {showQualityBadge && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-xl text-xs font-semibold border border-neutral-800 shadow-2xl z-40 animate-bounce">
          Quality switched to: <span className={accentClasses.text}>{selectedResolution}</span>
        </div>
      )}

      {/* BOTTOM CONTROL HUD PANEL */}
      <div
        className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-12 pb-5 px-5 flex flex-col gap-3 transition-all duration-300 z-30 ${
          showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* CUSTOM TIME TIMELINE RANGE SEEKER */}
        <div className="flex items-center gap-3 w-full">
          <span className="font-mono text-xs text-neutral-300">
            {formatTime(currentTime)}
          </span>

          <div className="relative flex-1 group/seek">
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={handleSeekChange}
              className={`w-full h-1.5 bg-neutral-700/80 rounded-lg appearance-none cursor-pointer outline-none focus:outline-none transition-all ${accentClasses.accent}`}
            />
            {/* Fill-Track highlighting the current seek duration */}
            <div
              className={`absolute top-2 left-0 h-1 rounded-lg pointer-events-none ${
                playbackSettings.accentColor === 'red' ? 'bg-red-600' :
                playbackSettings.accentColor === 'green' ? 'bg-emerald-600' :
                playbackSettings.accentColor === 'purple' ? 'bg-violet-600' : 'bg-amber-600'
              }`}
              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>

          <span className="font-mono text-xs text-neutral-300">
            {formatTime(duration)}
          </span>
        </div>

        {/* HUD LOWER CONTAINER */}
        <div className="flex items-center justify-between w-full">
          {/* Controls Left side buttons */}
          <div className="flex items-center gap-3">
            {/* Prev Channel Shortcut */}
            <button
              onClick={() => onNavigateChannel('prev')}
              className="p-2 text-neutral-300 hover:text-white hover:bg-neutral-900/60 rounded"
              title="Previous channel shortcut"
            >
              <ChevronLeft size={20} />
            </button>

            {/* Play/Pause Button */}
            <button
              onClick={() => handlePlayPause()}
              className={`p-2.5 rounded-full ${accentClasses.bg} text-white hover:scale-105 duration-150 shadow-md ${accentClasses.glow}`}
            >
              {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            </button>

            {/* Next Channel Shortcut */}
            <button
              onClick={() => onNavigateChannel('next')}
              className="p-2 text-neutral-300 hover:text-white hover:bg-neutral-900/60 rounded"
              title="Next channel shortcut"
            >
              <ChevronRight size={20} />
            </button>

            {/* Volume items */}
            <div className="flex items-center gap-2 ml-2">
              <button
                onClick={() => updateSettings({ muted: !playbackSettings.muted })}
                className="text-neutral-300 hover:text-white transition-colors"
              >
                {playbackSettings.muted || playbackSettings.volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={playbackSettings.volume}
                onChange={(e) => updateSettings({ volume: parseInt(e.target.value), muted: false })}
                className={`w-16 h-1 bg-neutral-700/80 rounded-lg appearance-none cursor-pointer outline-none transition-all ${accentClasses.accent}`}
              />
            </div>
          </div>

          {/* Controls Middle/Right Actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Favorite button */}
            <button
              onClick={() => onToggleFavorite(channel.id)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                isFavorite
                  ? 'bg-rose-500/15 border border-rose-500 text-rose-500'
                  : 'bg-neutral-900/80 border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700'
              }`}
            >
              <Heart size={14} className={isFavorite ? 'fill-rose-500' : ''} />
              <span className="hidden sm:inline">Favorite</span>
            </button>

            {/* Info popover toggle */}
            <button
              onClick={() => setShowInfo(!showInfo)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                showInfo
                  ? 'bg-neutral-800 border border-neutral-700 text-white'
                  : 'bg-neutral-900/80 border border-neutral-800 text-neutral-300 hover:text-white'
              }`}
            >
              <Info size={14} />
              <span className="hidden sm:inline">Info</span>
            </button>

            {/* Last channel swap */}
            <button
              onClick={onSwitchToLastChannel}
              disabled={!hasLastChannel}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                hasLastChannel
                  ? 'bg-neutral-900/80 border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700'
                  : 'opacity-40 cursor-not-allowed border-neutral-900 text-neutral-600'
              }`}
              title={hasLastChannel ? "Recall Last Watched Channel" : "No previous channel history"}
            >
              <RotateCcw size={14} />
              <span className="hidden sm:inline">Last CH</span>
            </button>

            {/* Pip window controller */}
            <button
              onClick={handleTogglePiP}
              className="px-3 py-1.5 rounded-md bg-neutral-900/80 border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700 text-xs font-medium inline-flex items-center gap-1"
              title="Mini Player Picture in Picture"
            >
              <span className="hidden sm:inline">PiP</span>
            </button>

            {/* Aspect Scale toggle */}
            <button
              onClick={handleToggleAspectRatio}
              className="px-3 py-1.5 rounded-md bg-neutral-900/80 border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700 text-xs font-medium inline-flex items-center gap-1"
              title="Aspect ratio scaling modes"
            >
              <span className="hidden sm:inline">Contain:</span>
              <span className={`font-semibold ${accentClasses.text}`}>{getAspectModeLabel()}</span>
            </button>

            {/* Resolution dropdown trigger */}
            <button
              onClick={() => setShowResolutionMenu(!showResolutionMenu)}
              className={`px-3 py-1.5 rounded-md bg-neutral-900/80 border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700 text-xs font-mono font-medium flex items-center gap-1`}
              title="Stream resolution toggle"
            >
              <span>{channel.resolution || '1085p'}</span>
              <ChevronDown size={12} />
            </button>

            {/* Fullscreen handler */}
            <button
              onClick={handleToggleFullscreen}
              className="p-1 px-2.5 rounded-lg bg-neutral-900/90 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800"
              title="Fullscreen toggle"
            >
              {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
            </button>
          </div>
        </div>
      </div>

      {/* SLIDEOUT CHANNELS DRAWER (IMAGE 5 COMPLIANCE) */}
      {showChannelDrawer && (
        <div
          className="absolute inset-y-0 left-0 w-[320px] bg-neutral-950/98 border-r border-neutral-800/80 flex flex-col z-50 animate-slide-in shadow-2xl backdrop-blur-md"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header drawer search & title */}
          <div className="p-4 border-b border-neutral-800/80 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm tracking-widest text-neutral-100 uppercase flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${accentClasses.bg} animate-pulse`} />
                CHANNELS BAR
              </span>
              <button
                onClick={() => setShowChannelDrawer(false)}
                className="p-1 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800"
              >
                <X size={15} />
              </button>
            </div>

            {/* Drawer search bar */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search channels..."
                value={drawerQuery}
                onChange={(e) => setDrawerQuery(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-850 py-2 pl-9 pr-4 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600 transition-all font-sans"
              />
              <Search className="absolute left-3 top-2.5 text-neutral-500" size={14} />
              {drawerQuery && (
                <button
                  onClick={() => setDrawerQuery('')}
                  className="absolute right-3 top-2 text-neutral-400 hover:text-white"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Horizontal category slider */}
          <div className="px-4 py-2 border-b border-neutral-850 flex items-center gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap">
            {categoriesList.map((cat) => {
              const isSel = drawerCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setDrawerCategory(cat)}
                  className={`text-[10px] px-2.5 py-1 rounded-full font-semibold transition-all ${
                    isSel
                      ? `${accentClasses.bg} text-white`
                      : 'bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-850'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Drawer channels scrolling list container */}
          <div className="flex-1 overflow-y-auto divide-y divide-neutral-900/60 p-2 space-y-1">
            {activeDrawerChannels.length === 0 ? (
              <div className="text-center py-8 text-neutral-500 text-xs">
                No channels found to display.
              </div>
            ) : (
              activeDrawerChannels.map((c, index) => {
                const isSel = c.id === channel.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      onSelectChannel(c);
                      setDrawerQuery('');
                      resetControlsTimeout();
                    }}
                    className={`flex items-center gap-3 w-full text-left p-2.5 rounded-lg transition-all ${
                      isSel
                        ? 'bg-neutral-900 border-l-4 border-l-red-600 text-white'
                        : 'hover:bg-neutral-950/40 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {/* Index count */}
                    <span className="font-mono text-[10px] text-neutral-600 w-4 block text-center font-bold">
                      {index + 1}
                    </span>

                    {/* Logo/Emoji Avatar */}
                    <div className="w-8 h-8 rounded-full bg-neutral-850 border border-neutral-800 flex items-center justify-center font-bold select-none text-xs p-0.5 shrink-0">
                      {c.logo ? (
                        <ChannelLogo 
                          logo={c.logo} 
                          name={c.name} 
                          className="max-h-full max-w-full object-contain rounded-xs"
                          fallbackClassName="text-[10px] font-bold font-sans text-neutral-300"
                        />
                      ) : '📺'}
                    </div>

                    {/* Meta stack */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold truncate ${isSel ? 'text-white' : 'text-neutral-300'}`}>
                        {c.name}
                      </p>
                      <p className="text-[10px] text-neutral-500 uppercase tracking-widest mt-0.5">
                        {c.category}
                      </p>
                    </div>

                    {/* Green active live dot indicator */}
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
