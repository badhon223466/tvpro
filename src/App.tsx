import React, { useState, useEffect } from 'react';
import {
  Radio,
  Search,
  Plus,
  SlidersHorizontal,
  RefreshCw,
  LayoutGrid,
  Wifi,
  WifiOff,
  Trophy,
  Target,
  Flame,
  CircleDot,
  Newspaper,
  Clapperboard,
  Heart,
  MonitorPlay,
  Play,
  X,
  Check,
  Zap,
  CheckCircle2,
  Facebook,
  ExternalLink
} from 'lucide-react';

import { Channel, PlaylistSource, PlaybackSettings, VisitorStats } from './types';
import { BUILT_IN_SOURCES, INITIAL_CHANNELS } from './data';
import VideoPlayer from './components/VideoPlayer';
import AddPlaylistModal, { parseM3U, parseJSON } from './components/AddPlaylistModal';
import ManageSourcesModal from './components/ManageSourcesModal';
import ChannelLogo from './components/ChannelLogo';

// Firebase imports
import { db, handleFirestoreError, OperationType } from './lib/firebase';
import { doc, setDoc, deleteDoc, writeBatch, collection, getDocs, getDocFromServer } from 'firebase/firestore';

export default function App() {
  // --- Persistent States from LocalStorage ---
  const [sources, setSources] = useState<PlaylistSource[]>(() => {
    const local = localStorage.getItem('tvpro_sources');
    return local ? JSON.parse(local) : BUILT_IN_SOURCES;
  });

  const [channels, setChannels] = useState<Channel[]>(() => {
    const local = localStorage.getItem('tvpro_channels');
    return local ? JSON.parse(local) : INITIAL_CHANNELS;
  });

  const [playbackSettings, setPlaybackSettings] = useState<PlaybackSettings>(() => {
    const local = localStorage.getItem('tvpro_settings');
    if (local) {
      try {
        return JSON.parse(local);
      } catch (e) {
         // Fallback
      }
    }
    return {
      autoNextOnError: true,
      theme: 'dark',
      accentColor: 'red',
      volume: 80,
      muted: false,
    };
  });

  const [favoritedChannelIds, setFavoritedChannelIds] = useState<string[]>(() => {
    const local = localStorage.getItem('tvpro_favorites');
    return local ? JSON.parse(local) : [];
  });

  // --- Beautiful App Intro Loader State ---
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [loadingProgress, setLoadingProgress] = useState<number>(0);

  // Startup simulator for beautiful intro loader with site name
  useEffect(() => {
    let progressTimer: any;
    const startTime = Date.now();
    const duration = 1600; // 1.6 seconds loading visual duration

    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setLoadingProgress(pct);
      
      if (pct < 100) {
        progressTimer = requestAnimationFrame(updateProgress);
      } else {
        setTimeout(() => {
          setIsInitialLoading(false);
        }, 200);
      }
    };

    progressTimer = requestAnimationFrame(updateProgress);
    return () => cancelAnimationFrame(progressTimer);
  }, []);

  // --- Initialize connection test and fetch from Firestore ---
  useEffect(() => {
    async function initFirestore() {
      // 1. Connection Test (per critical skill guidelines)
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }

      // 2. Fetch all custom sources and channels
      try {
        const sourcesSnap = await getDocs(collection(db, 'playlist_sources'));
        const fbSources: PlaylistSource[] = [];
        sourcesSnap.forEach((d) => {
          fbSources.push(d.data() as PlaylistSource);
        });

        const channelsSnap = await getDocs(collection(db, 'channels'));
        const fbChannels: Channel[] = [];
        channelsSnap.forEach((d) => {
          fbChannels.push(d.data() as Channel);
        });

        if (fbSources.length > 0) {
          setSources((prev) => {
            const builtIns = prev.filter((s) => BUILT_IN_SOURCES.some((b) => b.id === s.id));
            const localCustoms = prev.filter((s) => !BUILT_IN_SOURCES.some((b) => b.id === s.id));
            const mergedCustoms = [...localCustoms];
            fbSources.forEach((fs) => {
              const exIdx = mergedCustoms.findIndex((mc) => mc.id === fs.id);
              if (exIdx !== -1) {
                mergedCustoms[exIdx] = fs;
              } else {
                mergedCustoms.push(fs);
              }
            });
            return [...builtIns, ...mergedCustoms];
          });
        }

        if (fbChannels.length > 0) {
          setChannels((prev) => {
            const builtIns = prev.filter((c) => INITIAL_CHANNELS.some((ic) => ic.id === c.id));
            const localCustoms = prev.filter((c) => !INITIAL_CHANNELS.some((ic) => ic.id === c.id));
            const mergedCustoms = [...localCustoms];
            fbChannels.forEach((fc) => {
              const exIdx = mergedCustoms.findIndex((mc) => mc.id === fc.id);
              if (exIdx !== -1) {
                mergedCustoms[exIdx] = fc;
              } else {
                mergedCustoms.push(fc);
              }
            });
            return [...builtIns, ...mergedCustoms];
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'playlist_sources_and_channels');
      }
    }

    initFirestore();
  }, []);

  // --- Normal UI States ---
  const [selectedSourceId, setSelectedSourceId] = useState<string>('fancode');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  const [loadingSourceId, setLoadingSourceId] = useState<string | null>(null);
  const [isRescanning, setIsRescanning] = useState<boolean>(false);
  const [rescanMessage, setRescanMessage] = useState<string>('');

  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [lastChannelId, setLastChannelId] = useState<string | null>(null);

  // --- Modals togglers ---
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showManageModal, setShowManageModal] = useState<boolean>(false);
  const [showSettingsSidebar, setShowSettingsSidebar] = useState<boolean>(false);

  // --- Admin Mode states ---
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    return localStorage.getItem('tvpro_is_admin') === 'true';
  });
  const [showAdminLoginModal, setShowAdminLoginModal] = useState<boolean>(false);
  const [adminPasscode, setAdminPasscode] = useState<string>('');
  const [adminPasscodeError, setAdminPasscodeError] = useState<string>('');

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const entered = adminPasscode.trim();
    // Strictly require badhon223466
    if (entered === 'badhon223466') {
      setIsAdmin(true);
      localStorage.setItem('tvpro_is_admin', 'true');
      setShowAdminLoginModal(false);
      setAdminPasscode('');
      setAdminPasscodeError('');
    } else {
      setAdminPasscodeError('Incorrect passcode. Access is restricted to site admin!');
    }
  };

  // --- Live visitor stats engine ---
  const [visitorStats, setVisitorStats] = useState<VisitorStats>({
    online: 28,
    totalVisitors: 3012,
  });

  // Save changes to localStorage
  useEffect(() => {
    localStorage.setItem('tvpro_sources', JSON.stringify(sources));
  }, [sources]);

  useEffect(() => {
    localStorage.setItem('tvpro_channels', JSON.stringify(channels));
  }, [channels]);

  useEffect(() => {
    localStorage.setItem('tvpro_settings', JSON.stringify(playbackSettings));
  }, [playbackSettings]);

  useEffect(() => {
    localStorage.setItem('tvpro_favorites', JSON.stringify(favoritedChannelIds));
  }, [favoritedChannelIds]);

  // Simulate updating visitor statistics
  useEffect(() => {
    const interval = setInterval(() => {
      setVisitorStats((prev) => {
        const delta = Math.random() > 0.5 ? 1 : -1;
        const newOnline = Math.max(12, Math.min(65, prev.online + delta));
        const newTotal = prev.totalVisitors + (Math.random() > 0.85 ? 1 : 0);
        return {
          online: newOnline,
          totalVisitors: newTotal,
        };
      });
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  // Update Settings Shortcut
  const updateSettings = (updates: Partial<PlaybackSettings>) => {
    setPlaybackSettings((prev) => ({ ...prev, ...updates }));
  };

  // Switch/Load Playlists
  const handleSourceTabClick = (id: string) => {
    const source = sources.find((s) => s.id === id);
    if (!source) return;

    if (!source.loaded) {
      // Simulate network playlist loader
      setLoadingSourceId(id);
      setTimeout(() => {
        setSources((prev) =>
          prev.map((s) => (s.id === id ? { ...s, loaded: true, active: true } : s))
        );
        setChannels((prev) =>
          prev.map((c) => (c.sourceId === id ? { ...c, online: true } : c))
        );
        setSelectedSourceId(id);
        setLoadingSourceId(null);
      }, 700);
    } else {
      setSelectedSourceId(id);
    }
  };

  // Rescan all channels handler
  const handleRescan = () => {
    setIsRescanning(true);
    setRescanMessage('Connecting to streams metadata...');
    setTimeout(() => {
      setRescanMessage('Analyzing ping latencies...');
      setTimeout(() => {
        // Randomize live statuses a bit for premium IPTV simulator
        setChannels((prev) =>
          prev.map((c) => ({
            ...c,
            online: Math.random() > 0.04, // 96% online accuracy
          }))
        );
        setRescanMessage('Optimal bitrate nodes selected!');
        setTimeout(() => {
          setIsRescanning(false);
          setRescanMessage('');
        }, 600);
      }, 700);
    }, 700);
  };

  // Add source action callbacks
  const handleAddPlaylist = async (newSource: PlaylistSource, newChannels: Channel[]) => {
    setSources((prev) => [...prev, newSource]);
    setChannels((prev) => [...prev, ...newChannels]);
    setSelectedSourceId(newSource.id);

    try {
      const cleanSource = {
        id: newSource.id,
        name: newSource.name,
        type: newSource.type,
        channelCount: newSource.channelCount,
        loaded: newSource.loaded,
        active: newSource.active,
        url: newSource.url || '',
        content: newSource.content || ''
      };
      await setDoc(doc(db, 'playlist_sources', newSource.id), cleanSource);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `playlist_sources/${newSource.id}`);
    }

    try {
      const batchSize = 400;
      for (let i = 0; i < newChannels.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = newChannels.slice(i, i + batchSize);
        chunk.forEach((ch) => {
          const cleanChan = {
            id: ch.id,
            name: ch.name || '',
            logo: ch.logo || '',
            url: ch.url || '',
            category: ch.category || 'Other',
            sourceId: ch.sourceId,
            online: ch.online !== false,
            tvgId: ch.tvgId || '',
            resolution: ch.resolution || '',
            country: ch.country || ''
          };
          batch.set(doc(db, 'channels', ch.id), cleanChan);
        });
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'channels/batch');
    }
  };

  const handleToggleSourceActive = async (id: string) => {
    setSources((prev) =>
      prev.map((s) => {
        if (s.id === id) {
          const updated = { ...s, active: !s.active };
          const isBuiltIn = BUILT_IN_SOURCES.some((b) => b.id === id);
          if (!isBuiltIn) {
            const cleanSource = {
              id: updated.id,
              name: updated.name,
              type: updated.type,
              channelCount: updated.channelCount,
              loaded: updated.loaded,
              active: updated.active,
              url: updated.url || '',
              content: updated.content || ''
            };
            setDoc(doc(db, 'playlist_sources', id), cleanSource).catch((err) => {
              handleFirestoreError(err, OperationType.WRITE, `playlist_sources/${id}`);
            });
          }
          return updated;
        }
        return s;
      })
    );
  };

  const handleRemoveSource = async (id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
    setChannels((prev) => prev.filter((c) => c.sourceId !== id));
    if (selectedSourceId === id) {
      setSelectedSourceId('fancode');
    }

    try {
      await deleteDoc(doc(db, 'playlist_sources', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `playlist_sources/${id}`);
    }

    try {
      const toDelete = channels.filter((c) => c.sourceId === id);
      const batchSize = 400;
      for (let i = 0; i < toDelete.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = toDelete.slice(i, i + batchSize);
        chunk.forEach((ch) => {
          batch.delete(doc(db, 'channels', ch.id));
        });
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'channels/batch_delete');
    }
  };

  const handleEditSource = async (id: string, updatedName: string, updatedUrl?: string, updatedContent?: string) => {
    let finalChannels = [...channels];
    let parsedCount: number | null = null;
    let newChannelsList: Channel[] = [];
    
    if (updatedContent !== undefined) {
      const isJson = updatedContent.trim().startsWith('{') || updatedContent.trim().startsWith('[');
      const newChannels = isJson ? parseJSON(updatedContent, id) : parseM3U(updatedContent, id);
      newChannelsList = newChannels;
      parsedCount = newChannels.length;

      // Filter out existing channels from this source ID
      finalChannels = finalChannels.filter((c) => c.sourceId !== id);
      // Append the newly parsed channels
      finalChannels = [...finalChannels, ...newChannels];
    }

    setSources((prev) =>
      prev.map((s) => {
        if (s.id === id) {
          const updated = {
            ...s,
            name: updatedName,
            url: updatedUrl !== undefined ? updatedUrl : s.url,
            content: updatedContent !== undefined ? updatedContent : s.content,
            channelCount: parsedCount !== null ? parsedCount : s.channelCount,
          };

          const isBuiltIn = BUILT_IN_SOURCES.some((b) => b.id === id);
          if (!isBuiltIn) {
            const cleanSource = {
              id: updated.id,
              name: updated.name,
              type: updated.type,
              channelCount: updated.channelCount,
              loaded: updated.loaded,
              active: updated.active,
              url: updated.url || '',
              content: updated.content || ''
            };
            setDoc(doc(db, 'playlist_sources', id), cleanSource).catch((err) => {
              handleFirestoreError(err, OperationType.WRITE, `playlist_sources/${id}`);
            });
          }

          return updated;
        }
        return s;
      })
    );

    if (updatedContent !== undefined) {
      setChannels(finalChannels);

      const isBuiltIn = BUILT_IN_SOURCES.some((b) => b.id === id);
      if (!isBuiltIn) {
        try {
          const oldChannels = channels.filter((c) => c.sourceId === id);
          const deleteBatchSize = 400;
          for (let i = 0; i < oldChannels.length; i += deleteBatchSize) {
            const batch = writeBatch(db);
            const chunk = oldChannels.slice(i, i + deleteBatchSize);
            chunk.forEach((ch) => {
              batch.delete(doc(db, 'channels', ch.id));
            });
            await batch.commit();
          }

          const writeBatchSize = 400;
          for (let i = 0; i < newChannelsList.length; i += writeBatchSize) {
            const batch = writeBatch(db);
            const chunk = newChannelsList.slice(i, i + writeBatchSize);
            chunk.forEach((ch) => {
              const cleanChan = {
                id: ch.id,
                name: ch.name || '',
                logo: ch.logo || '',
                url: ch.url || '',
                category: ch.category || 'Other',
                sourceId: ch.sourceId,
                online: ch.online !== false,
                tvgId: ch.tvgId || '',
                resolution: ch.resolution || '',
                country: ch.country || ''
              };
              batch.set(doc(db, 'channels', ch.id), cleanChan);
            });
            await batch.commit();
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'channels/edit_batch');
        }
      }
    }
  };

  const handleToggleFavorite = (channelId: string) => {
    setFavoritedChannelIds((prev) =>
      prev.includes(channelId) ? prev.filter((id) => id !== channelId) : [...prev, channelId]
    );
  };

  // Play selection control
  const handleSetSelectedChannel = (channel: Channel) => {
    if (selectedChannel) {
      setLastChannelId(selectedChannel.id);
    }
    setSelectedChannel(channel);
  };

  const handleSwitchToLastChannel = () => {
    if (lastChannelId) {
      const match = channels.find((c) => c.id === lastChannelId);
      if (match) {
        handleSetSelectedChannel(match);
      }
    }
  };

  // Active filters and query listings
  const activeSources = sources.filter((s) => s.active);
  const activeSourceIdList = activeSources.map((s) => s.id);

  // Filter channels based on selected source tabs
  const sourceChannels = channels.filter((c) => {
    if (selectedSourceId === 'favorites') {
      return favoritedChannelIds.includes(c.id);
    }
    return c.sourceId === selectedSourceId && activeSourceIdList.includes(c.sourceId);
  });

  // Category statistics counts based on currently selected source
  const getCategoryCount = (catName: string) => {
    if (selectedSourceId === 'favorites') {
      const favs = channels.filter((c) => favoritedChannelIds.includes(c.id));
      if (catName === 'All') return favs.length;
      if (catName === 'Online') return favs.filter((c) => c.online !== false).length;
      if (catName === 'Offline') return favs.filter((c) => c.online === false).length;
      return favs.filter((c) => c.category === catName).length;
    }
    
    const relevant = channels.filter((c) => c.sourceId === selectedSourceId && activeSourceIdList.includes(c.sourceId));
    if (catName === 'All') return relevant.length;
    if (catName === 'Online') return relevant.filter((c) => c.online !== false).length;
    if (catName === 'Offline') return relevant.filter((c) => c.online === false).length;
    return relevant.filter((c) => c.category === catName).length;
  };

  // Filter channels on search query & selected category list
  const filteredChannelsOnDisplay = sourceChannels.filter((c) => {
    const matchesCategory =
      activeCategory === 'All' ||
      (activeCategory === 'Online' && c.online !== false) ||
      (activeCategory === 'Offline' && c.online === false) ||
      c.category.toLowerCase() === activeCategory.toLowerCase();

    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.category.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  // Calculate dynamic list navigation index for next/prev inside active filter stream list
  const handleNavigateChannel = (direction: 'prev' | 'next') => {
    if (!selectedChannel || filteredChannelsOnDisplay.length === 0) return;
    const currentIdx = filteredChannelsOnDisplay.findIndex((c) => c.id === selectedChannel.id);
    if (currentIdx === -1) return;

    let nextIdx = currentIdx;
    if (direction === 'next') {
      nextIdx = (currentIdx + 1) % filteredChannelsOnDisplay.length;
    } else {
      nextIdx = (currentIdx - 1 + filteredChannelsOnDisplay.length) % filteredChannelsOnDisplay.length;
    }
    handleSetSelectedChannel(filteredChannelsOnDisplay[nextIdx]);
  };

  // Color schemes mapping depending on selected Settings accent color
  const colorsAccent = {
    red: {
      text: 'text-red-500',
      bgSelect: 'bg-red-600',
      bgHover: 'hover:bg-red-700',
      border: 'border-red-600/70 focus:border-red-600',
      ring: 'focus:ring-red-500/20',
      tabActive: 'bg-red-600 shadow-[0_0_12px_rgba(220,38,38,0.3)]',
      cardHover: 'hover:border-red-500/55',
    },
    green: {
      text: 'text-emerald-500',
      bgSelect: 'bg-emerald-600',
      bgHover: 'hover:bg-emerald-700',
      border: 'border-emerald-600/70 focus:border-emerald-600',
      ring: 'focus:ring-emerald-500/20',
      tabActive: 'bg-emerald-600 shadow-[0_0_12px_rgba(16,185,129,0.3)]',
      cardHover: 'hover:border-emerald-500/55',
    },
    purple: {
      text: 'text-violet-500',
      bgSelect: 'bg-violet-600',
      bgHover: 'hover:bg-violet-700',
      border: 'border-violet-600/70 focus:border-violet-600',
      ring: 'focus:ring-violet-500/20',
      tabActive: 'bg-violet-600 shadow-[0_0_12px_rgba(139,92,246,0.3)]',
      cardHover: 'hover:border-violet-500/55',
    },
    orange: {
      text: 'text-amber-500',
      bgSelect: 'bg-amber-600',
      bgHover: 'hover:bg-amber-700',
      border: 'border-amber-600/70 focus:border-amber-600',
      ring: 'focus:ring-amber-500/20',
      tabActive: 'bg-amber-600 shadow-[0_0_12px_rgba(245,158,11,0.3)]',
      cardHover: 'hover:border-amber-500/55',
    },
  }[playbackSettings.accentColor];

  // Theme variable colors configurations
  const themeClasses = {
    dark: {
      container: 'bg-slate-950 text-neutral-200',
      header: 'bg-slate-900/90 border-slate-850',
      sidebar: 'bg-slate-900 md:bg-slate-900/60 border-slate-850',
      subribbon: 'bg-slate-900/40 border-slate-850',
      card: 'bg-slate-900/40 hover:bg-slate-900 border-slate-850 shadow-md',
      input: 'bg-neutral-900 border-neutral-800 text-white placeholder-neutral-500 focus:border-neutral-700',
      buttonSec: 'bg-white/5 hover:bg-white/10 text-neutral-300 border-neutral-800',
      title: 'text-white',
      badgeNum: 'bg-slate-800 text-slate-400',
    },
    white: {
      container: 'bg-stone-50 text-stone-800',
      header: 'bg-white border-stone-200 shadow-xs',
      sidebar: 'bg-white border-stone-200',
      subribbon: 'bg-stone-100/55 border-stone-200',
      card: 'bg-white hover:bg-stone-50 border-stone-200 shadow-sm',
      input: 'bg-stone-100 border-stone-300 text-stone-900 placeholder-stone-400 focus:border-stone-400',
      buttonSec: 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-300',
      title: 'text-stone-900',
      badgeNum: 'bg-stone-200 text-stone-600',
    },
    'black-oled': {
      container: 'bg-black text-neutral-300',
      header: 'bg-black border-neutral-900',
      sidebar: 'bg-black border-neutral-900',
      subribbon: 'bg-black border-neutral-900',
      card: 'bg-neutral-950 hover:bg-neutral-900/80 border-neutral-900 shadow-none',
      input: 'bg-black border-neutral-900 text-white placeholder-neutral-700 focus:border-neutral-800',
      buttonSec: 'bg-neutral-950 hover:bg-neutral-900 text-neutral-300 border-neutral-900',
      title: 'text-white',
      badgeNum: 'bg-neutral-900 text-neutral-500',
    },
  }[playbackSettings.theme];

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-all duration-300 overflow-hidden ${themeClasses.container}`}>
      
      {/* INITIAL CINEMATIC LOAD SCREEN INTRO */}
      {isInitialLoading && (
        <div className="fixed inset-0 z-[99999] bg-[#070a0f] flex flex-col items-center justify-center p-6 select-none overflow-hidden font-sans">
          
          {/* Ambient glowing background circles */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-red-650/10 rounded-full blur-[100px] pointer-events-none animate-pulse" />
          <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-red-800/5 rounded-full blur-[120px] pointer-events-none animate-pulse" />

          {/* Centered Logo container */}
          <div className="flex flex-col items-center text-center max-w-sm z-10">
            {/* Glowing active Radar icon logo */}
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-red-650/20 rounded-3xl blur-xl animate-pulse" />
              <div className="relative h-16 w-16 bg-red-650 rounded-2xl flex items-center justify-center text-white scale-100 shadow-[0_0_30px_rgba(220,38,38,0.3)] border border-red-500/20">
                <Radio size={32} className="stroke-[2.5]" />
              </div>
            </div>

            {/* Site Name and Slogan */}
            <div className="space-y-1.5">
              <h1 className="text-3xl font-black tracking-widest text-white uppercase font-sans flex items-center justify-center gap-1">
                <span className="text-red-500 font-extrabold pr-2 border-r border-neutral-800">TV</span>
                <span className="tracking-tighter font-extrabold">Pro</span>
                <span className="text-[10px] bg-red-650 text-white font-black tracking-widest uppercase px-1.5 py-0.5 rounded ml-1">
                  PREMIUM
                </span>
              </h1>
              <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-[0.22em]">
                Elite IPTV Stream Engine
              </p>
            </div>

            {/* Custom Interactive Progress Bar */}
            <div className="w-60 mt-10 space-y-2">
              <div className="h-[3px] w-full bg-neutral-900 border border-neutral-850/30 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-red-600 via-rose-500 to-red-650 rounded-full transition-all duration-100 ease-out"
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>
              
              {/* Dynamic Loading Logs */}
              <div className="flex justify-between items-center text-[9px] font-mono text-neutral-500">
                <span className="uppercase tracking-wider font-bold">
                  {loadingProgress < 40 ? 'Initializing Decoders...' :
                   loadingProgress < 75 ? 'Parsing Playlists...' :
                   loadingProgress < 95 ? 'Caching Stream Links...' : 'System Ready ✓'}
                </span>
                <span className="font-extrabold text-neutral-400">{loadingProgress}%</span>
              </div>
            </div>
          </div>

          {/* User watermark and system footer */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-center text-[10px] tracking-widest font-mono text-neutral-600 space-y-1 z-10">
            <p className="uppercase select-none">Licensed to <span className="text-neutral-400 font-bold">Md Badhon</span></p>
            <div className="flex flex-col items-center gap-1 pt-1">
              <a 
                href="https://www.facebook.com/MDBADHON0/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-950/20 hover:bg-blue-900/40 border border-blue-900/30 text-[9px] text-blue-400 hover:text-blue-300 transition-all font-sans cursor-pointer pointer-events-auto shadow-sm"
              >
                <Facebook size={11} className="fill-blue-500/10 shrink-0" />
                <span>Md Badhon</span>
                <ExternalLink size={9} className="opacity-65 shrink-0" />
              </a>
              <p className="text-[8px] opacity-60 select-none uppercase tracking-[0.18em] text-neutral-500 mt-1">
                SECURE SANDBOX SESSION • ACTIVE PRO
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 1. TOP NAV BAR SECTION */}
      <header className={`border-b shrink-0 flex flex-col sm:flex-row items-center justify-between p-4 px-6 gap-3 z-30 transition-all ${themeClasses.header}`}>
        
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl text-white ${colorsAccent.bgSelect} flex items-center justify-center animate-pulse`}>
            {/* Custom live radar glow badge */}
            <Radio size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-sans font-black tracking-tighter text-xl text-white">
                <span className="text-red-550">TV</span>Pro
              </span>
              <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded text-white bg-red-600 uppercase tracking-widest`}>
                Live Pro
              </span>
            </div>
            <p className="text-[9px] -mt-0.5 text-neutral-500 font-semibold tracking-wider">PREMIUM STREAM PLATFORM</p>
          </div>
        </div>

        {/* Global Search Channels Input */}
        <div className="relative w-full sm:max-w-xs md:max-w-md">
          <input
            type="text"
            placeholder="Search channels, matches or categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full text-xs py-2.5 pl-10 pr-9 rounded-xl border focus:outline-none transition-all ${themeClasses.input} ${colorsAccent.border} ${colorsAccent.ring}`}
          />
          <Search size={14} className="absolute left-3.5 top-3.5 text-neutral-500" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-3 text-neutral-400 hover:text-white transition-colors"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Header Action Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {isAdmin && (
            <>
              {/* Add custom source file trigger */}
              <button
                id="header-add-button"
                onClick={() => setShowAddModal(true)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-md transform active:scale-95 cursor-pointer text-white bg-red-650 hover:bg-red-750`}
              >
                <Plus size={14} className="stroke-[3]" />
                <span>Add</span>
              </button>

              {/* Manage loaded playlist streams sources */}
              <button
                id="header-manage-button"
                onClick={() => setShowManageModal(true)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${themeClasses.buttonSec}`}
              >
                <SlidersHorizontal size={14} />
                <span>Manage</span>
              </button>
            </>
          )}

          {/* Settings panel sidebar toggler */}
          <button
            id="header-settings-button"
            onClick={() => setShowSettingsSidebar(true)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${themeClasses.buttonSec}`}
          >
            {/* Pulsing indicator tag */}
            <span className="relative flex h-1.5 w-1.5 -mr-0.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${colorsAccent.bgSelect}`} />
              <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${colorsAccent.bgSelect}`} />
            </span>
            <span>Settings</span>
          </button>
        </div>
      </header>

      {/* 2. PLAYLIST SOURCES HORIZONTAL CAROUSEL TABS ribbon */}
      <section className={`px-6 py-3 border-b flex items-center overflow-x-auto no-scrollbar gap-2 max-w-full shrink-0 ${themeClasses.subribbon}`}>
        
        {/* Favorited Channel tab */}
        <button
          onClick={() => {
            setSelectedSourceId('favorites');
            setActiveCategory('All');
          }}
          className={`flex items-center shrink-0 py-2.5 px-4 rounded-xl text-xs font-bold tracking-wide transition-all uppercase-none select-none border border-transparent cursor-pointer ${
            selectedSourceId === 'favorites'
              ? `${colorsAccent.tabActive} text-white`
              : `${themeClasses.buttonSec}`
          }`}
        >
          <Heart size={14} className={`mr-2 ${selectedSourceId === 'favorites' ? 'fill-white text-white' : 'text-rose-500 fill-rose-500/20'}`} />
          <span>My Favorites ({favoritedChannelIds.length})</span>
        </button>

        <div className="h-6 w-[1px] bg-neutral-800 shrink-0 mx-1.5" />

        {/* List of Loaded Sources */}
        {[...sources].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })).map((src) => {
          const isSel = selectedSourceId === src.id;
          const isLoading = loadingSourceId === src.id;

          return (
            <button
              key={src.id}
              onClick={() => handleSourceTabClick(src.id)}
              disabled={isLoading}
              className={`flex items-center shrink-0 py-2.5 px-4 rounded-xl text-xs font-bold select-none border transition-all cursor-pointer ${
                isSel
                  ? `${colorsAccent.tabActive} text-white border-transparent`
                  : src.loaded
                  ? `${themeClasses.buttonSec} border-transparent`
                  : 'bg-neutral-900/40 text-neutral-500 border border-neutral-850/70 hover:text-neutral-300'
              }`}
            >
              {isLoading ? (
                /* Buffering mini-loading status stream maker click icon */
                <span className="flex items-center gap-2">
                  <RefreshCw size={13} className="animate-spin text-neutral-400" />
                  <span>Loading Source...</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span className="capitalize">{src.name}</span>
                  {src.loaded ? (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-sans whitespace-nowrap ${
                      isSel ? 'bg-white/20 text-white' : 'bg-neutral-800 text-neutral-400'
                    }`}>
                      {src.channelCount} ch
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase font-mono tracking-widest text-[#22C55E] flex items-center gap-0.5 font-bold">
                      <Zap size={10} className="fill-[#22C55E]" /> Load
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </section>

      {/* 3. SPLIT WORKSPACE SIDEBAR & CARDS PANEL SECTION */}
      <main className="flex-1 flex overflow-hidden w-full relative">
        
        {/* LEFT SIDEBAR FILTERS (DESKTOP) */}
        <aside className={`w-64 border-r shrink-0 hidden md:flex flex-col p-5 gap-6 overflow-y-auto ${themeClasses.sidebar}`}>
          
          {/* Rescan streams button */}
          <button
            id="rescan-streams-button"
            onClick={handleRescan}
            disabled={isRescanning}
            className={`w-full flex items-center justify-center gap-2 p-3 font-bold text-xs uppercase tracking-wider rounded-xl border border-neutral-800 hover:border-neutral-700 bg-neutral-950/40 text-neutral-300 hover:text-white transition-all shadow-inner relative disabled:opacity-50 cursor-pointer`}
          >
            <RefreshCw size={14} className={`${isRescanning ? 'animate-spin text-red-500' : ''}`} />
            <span>{isRescanning ? 'Scanning Network...' : 'Rescan'}</span>
          </button>

          {/* Categories List filter */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] uppercase font-bold text-neutral-500 tracking-widest pl-1">
              Live TV Categories List
            </span>
            <div className="space-y-1">
              {[
                { id: 'All', name: 'All Channels', icon: LayoutGrid },
                { id: 'Online', name: 'Online Only', icon: Wifi },
                { id: 'Offline', name: 'Offline Only', icon: WifiOff },
                { id: 'Cricket', name: 'Cricket', icon: Trophy },
                { id: 'Football', name: 'Football', icon: Trophy },
                { id: 'Golf', name: 'Golf Category', icon: Target },
                { id: 'Motorsports', name: 'Motorsports', icon: Flame },
                { id: 'Tennis', name: 'Tennis Category', icon: CircleDot },
                { id: 'News', name: 'News Stream', icon: Newspaper },
                { id: 'Entertainment', name: 'Entertainment', icon: Clapperboard },
              ].map((cat) => {
                const isSel = activeCategory === cat.id;
                const count = getCategoryCount(cat.id);
                const Icon = cat.icon;

                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`flex items-center justify-between w-full p-2.5 rounded-xl transition-all cursor-pointer ${
                      isSel
                        ? 'bg-neutral-800/80 text-white font-bold border-l-4 border-l-red-600'
                        : `text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/30`
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon size={14} className={isSel ? colorsAccent.text : 'text-neutral-500'} />
                      <span className="text-xs truncate">{cat.name}</span>
                    </div>
                    {count > 0 && (
                      <span className={`text-[10px] font-mono py-0.5 px-2 rounded-full font-semibold ${themeClasses.badgeNum}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-auto border-t border-neutral-850 pt-4 flex flex-col gap-2 relative">
            {isAdmin ? (
              <div className="p-3 bg-emerald-950/20 border border-emerald-900/30 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-405 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-550"></span>
                  </span>
                  <span className="text-[10px] font-sans font-extrabold uppercase tracking-widest text-emerald-400">
                    Admin Session Active
                  </span>
                </div>
                
                <button
                  onClick={() => {
                    setIsAdmin(false);
                    localStorage.setItem('tvpro_is_admin', 'false');
                  }}
                  className="w-full text-center py-1.5 text-[10px] uppercase tracking-wider font-extrabold bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 rounded-lg text-red-500 hover:text-red-400 transition-colors cursor-pointer"
                >
                  End Session
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setShowAdminLoginModal(true);
                  setAdminPasscode('');
                  setAdminPasscodeError('');
                }}
                className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border border-neutral-850 bg-neutral-900/40 text-neutral-400 hover:text-neutral-200 hover:border-neutral-750 transition-all text-xs font-bold cursor-pointer"
              >
                <span>🔒 Admin Passcode Login</span>
              </button>
            )}
            <p className="text-[9.5px] text-neutral-500 font-medium text-center select-none mt-0.5">
              Strictly protected live administrative controls
            </p>
          </div>
        </aside>

        {/* RIGHT DISPLAY GRID CARDS CONTAINER PANEL */}
        <section className="flex-1 flex flex-col overflow-y-auto p-4 md:p-6 pb-20 select-none">
          
          {/* Main heading with dynamic status report */}
          <div className="flex items-center justify-between mb-6 shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-tight flex items-center gap-2 text-white">
                  {selectedSourceId === 'favorites' ? 'My Favorites' : sources.find((s) => s.id === selectedSourceId)?.name || 'Streams'} ({filteredChannelsOnDisplay.length})
                </h2>
                {isRescanning && (
                  <span className="text-[10px] text-emerald-400 font-medium animate-pulse bg-emerald-900/10 border border-emerald-800/20 px-2 py-0.5 rounded">
                    {rescanMessage}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Displaying interactive channels based on active query, categories and provider sources lists.
              </p>
            </div>

            {/* Quick Filter toggle badge right side of header */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] text-neutral-400 font-bold bg-neutral-900 px-2.5 py-1 rounded-full border border-neutral-850">
                Category: <span className={colorsAccent.text}>{activeCategory}</span>
              </span>
            </div>
          </div>

          {/* Grid channels display elements */}
          {filteredChannelsOnDisplay.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-dashed border-neutral-850 rounded-2xl bg-neutral-950/20 mt-2 select-none animate-scale-in">
              <div className="p-4 bg-neutral-900 rounded-full border border-neutral-800 outline-none text-neutral-400 mb-3">
                <MonitorPlay size={36} />
              </div>
              <h3 className="text-neutral-300 font-bold text-sm tracking-wide">No stream feeds match active filter</h3>
              <p className="text-neutral-500 text-xs mt-1 max-w-sm">
                Try searching for something else, select a different Category, or load/activate loaded IPTV sources.
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className={`mt-4 px-4 py-2 rounded-lg text-xs font-semibold uppercase ${colorsAccent.bgSelect} ${colorsAccent.bgHover} text-white transition`}
                >
                  Clear Search Input
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 animate-zoom-in">
              {filteredChannelsOnDisplay.map((c) => {
                const isFav = favoritedChannelIds.includes(c.id);
                return (
                  <div
                    key={c.id}
                    onClick={() => handleSetSelectedChannel(c)}
                    className={`group relative flex flex-col justify-between overflow-hidden cursor-pointer p-4 rounded-xl border aspect-square transition-all duration-300 select-none ${themeClasses.card} ${colorsAccent.cardHover} ${c.online === false ? 'opacity-85 border-red-950/60' : ''}`}
                  >
                    {/* Top Row: Country on left, Premium status/Fav state on right */}
                    <div className="flex items-center justify-between w-full gap-2 shrink-0">
                      <span className="text-[10px] font-sans font-extrabold tracking-wider select-none px-2.5 py-1 rounded bg-slate-950/65 group-hover:bg-slate-950 transition border border-neutral-800/60 text-neutral-305 uppercase max-w-[110px] truncate">
                        {c.country || 'GLOBAL'}
                      </span>
                      <div className="flex items-center gap-2">
                        {isFav && (
                           <Heart size={12} className="text-rose-550 fill-rose-550 min-w-[12px]" />
                        )}
                        {c.online !== false ? (
                          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/30 border border-emerald-950/40 text-[9px] font-bold text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                            <span>LIVE</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-950/40 border border-red-900/40 text-[9px] font-bold text-red-500 animate-pulse">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                            <span>OFFLINE</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Middle Row: Massive sports/channel logo frame */}
                    <div className="my-3.5 flex flex-col items-center justify-center p-3 rounded-2xl bg-slate-950/50 group-hover:bg-slate-950/80 border border-neutral-900/60 flex-1 relative overflow-hidden transition-all duration-300">
                      <div className="absolute inset-0 bg-gradient-to-b from-neutral-900/40 via-transparent to-neutral-950/20 pointer-events-none" />
                      <div className="relative z-10 text-center flex flex-col items-center justify-center w-full h-full">
                        <ChannelLogo 
                          logo={c.logo} 
                          name={c.name} 
                          className="max-h-16 max-w-[85%] object-contain rounded-lg drop-shadow-md transition duration-350 transform group-hover:scale-110"
                          fallbackClassName="text-3xl drop-shadow-lg font-bold font-sans text-neutral-400 select-none transition duration-350 transform group-hover:scale-110"
                        />
                      </div>
                      
                      {c.online === false && (
                        <div className="absolute inset-0 bg-red-950/20 border border-red-900/10 flex flex-col items-center justify-center backdrop-blur-[0.5px]">
                          <WifiOff size={16} className="text-red-550 mb-0.5" />
                          <span className="text-[8px] font-sans font-black tracking-widest text-red-500 uppercase">
                            Feed Offline
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Bottom Details Row */}
                    <div className="space-y-2.5 shrink-0">
                      <p className={`text-xs font-black tracking-tight leading-4 line-clamp-2 select-none group-hover:text-white transition-colors duration-250 ${themeClasses.title}`}>
                        {c.name}
                      </p>
                      
                      <div className="flex items-center justify-between w-full pt-2 border-t border-neutral-900/50">
                        {/* Left Category tag */}
                        <span className="text-[8.5px] font-extrabold uppercase tracking-widest text-neutral-400 py-0.5 px-2.5 bg-neutral-850 rounded border border-neutral-800">
                          {c.category}
                        </span>
                        
                        {/* Right active stream branding source identifier */}
                        <span className="text-[8.5px] font-extrabold uppercase tracking-widest text-red-400 py-0.5 px-2.5 rounded bg-red-950/25 border border-red-900/25">
                          {c.sourceId.substring(0, 10).toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {/* Hover play buttons overlay badge */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-black/55 backdrop-blur-[1px] transition-all duration-300 flex items-center justify-center">
                      {c.online !== false ? (
                        <div className={`p-4 rounded-full bg-red-650 text-white shadow-xl ${colorsAccent.glow} transform translate-y-3 group-hover:translate-y-0 transition-all duration-300`}>
                          <Play size={20} className="fill-white translate-x-0.5" />
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 transform translate-y-3 group-hover:translate-y-0 transition-all duration-300">
                          <div className="p-3 bg-neutral-800 text-neutral-400 border border-neutral-700/60 rounded-full shadow-lg">
                            <WifiOff size={16} />
                          </div>
                          <span className="text-[8px] font-mono font-bold uppercase tracking-widest text-neutral-300 px-1.5 py-0.5 rounded bg-neutral-900/90 border border-neutral-800">
                            Offline Feed
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* 4. SETTINGS PANEL SIDEBAR DRAMATIC (IMAGE 3 COMPLIANT) */}
      {showSettingsSidebar && (
        <div
          id="tvpro-settings-sidemenu-overlay"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end"
          onClick={() => setShowSettingsSidebar(false)}
        >
          {/* Main Sidebar contents */}
          <div
            id="settings-drawer-interior"
            className="w-full max-w-sm bg-neutral-950 border-l border-neutral-850 flex flex-col h-full shadow-2xl animate-slide-in-right transform translate-x-0 select-none text-xs font-sans tracking-wide"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Settings panel */}
            <div className="p-5 border-b border-neutral-850 flex items-center justify-between">
              <h3 className="text-white text-base font-bold tracking-widest uppercase-none flex items-center gap-2">
                <SlidersHorizontal size={16} className={colorsAccent.text} />
                Settings Settings
              </h3>
              <button
                onClick={() => setShowSettingsSidebar(false)}
                className="p-1 rounded-md hover:bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800 transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Sidebar content compartments scroll container */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              
              {/* PLAYBACK COMPARTMENT */}
              <div className="space-y-3">
                <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider block">
                  PLAYBACK CONFIG
                </span>

                <div className="flex items-center justify-between p-3 bg-neutral-900/60 border border-neutral-850 rounded-xl">
                  <span className="text-neutral-300 font-semibold">Auto-Next on Error</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={playbackSettings.autoNextOnError}
                      onChange={(e) => updateSettings({ autoNextOnError: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-neutral-805 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-350 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-650"></div>
                  </label>
                </div>
              </div>

              {/* THEEME SELECTION SECTION */}
              <div className="space-y-3">
                <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider block">
                  THEME PRESET
                </span>

                <div className="flex flex-col gap-2">
                  {[
                    { id: 'dark', label: 'Dark Default', classes: 'bg-slate-900 border-slate-800 hover:border-slate-750 text-white' },
                    { id: 'white', label: 'Canvas White', classes: 'bg-stone-50 border-stone-300 hover:border-stone-400 text-stone-900' },
                    { id: 'black-oled', label: 'Black (OLED)', classes: 'bg-black border-neutral-900 hover:border-neutral-850 text-white' },
                  ].map((preset) => {
                    const isSel = playbackSettings.theme === preset.id;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => updateSettings({ theme: preset.id as any })}
                        className={`flex items-center justify-between p-3.5 rounded-xl border text-left font-bold transition-all cursor-pointer ${preset.classes} ${
                          isSel ? 'ring-2 ring-red-650' : ''
                        }`}
                      >
                        <span>{preset.label}</span>
                        {isSel && <CheckCircle2 size={16} className={`${colorsAccent.text} fill-black/20`} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ACCENT CHANGER COLOR SECTION */}
              <div className="space-y-3">
                <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider block">
                  ACCENT STYLE COLOR
                </span>

                {/* Color pick grid */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'red', hex: '#EF4444', name: 'Coral Red' },
                    { id: 'green', hex: '#10B981', name: 'Emerald' },
                    { id: 'purple', hex: '#8B5CF6', name: 'Amethyst' },
                    { id: 'orange', hex: '#F59E0B', name: 'Amber' },
                  ].map((clr) => {
                    const isSel = playbackSettings.accentColor === clr.id;
                    return (
                      <button
                        key={clr.id}
                        onClick={() => updateSettings({ accentColor: clr.id as any })}
                        className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all cursor-pointer bg-neutral-900/40 hover:bg-neutral-900 border-neutral-850`}
                        title={clr.name}
                      >
                        <div
                          className="w-7 h-7 rounded-full shadow space-inner"
                          style={{ backgroundColor: clr.hex }}
                        />
                        <span className={`text-[9px] font-sans font-bold hover:text-white ${isSel ? 'text-white underline' : 'text-neutral-500'}`}>
                          {clr.id.toUpperCase()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* STATS SECTION PANEL */}
              <div className="pt-4 border-t border-neutral-850 space-y-3">
                <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider block">
                  IPTV TRAFFIC telemetry
                </span>

                <div className="p-4 bg-neutral-900/60 border border-neutral-850 rounded-xl space-y-2.5 font-mono text-[11px]">
                  <p className="flex justify-between items-center text-neutral-400">
                    <span>Online Viewers:</span>
                    <span className="text-emerald-400 font-extrabold text-xs animate-pulse">
                      {visitorStats.online}
                    </span>
                  </p>
                  <p className="flex justify-between items-center text-neutral-400">
                    <span>Total Visitors:</span>
                    <span className="text-neutral-200 font-bold select-all">
                      {visitorStats.totalVisitors}
                    </span>
                  </p>
                </div>
              </div>

              {/* MOBILE ADMIN SYSTEM CONTROLS */}
              <div className="pt-4 border-t border-neutral-850 space-y-3">
                <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider block">
                  ADMINISTRATIVE CREDENTIALS
                </span>
                
                {isAdmin ? (
                  <div className="p-3.5 bg-emerald-950/20 border border-emerald-955/35 rounded-xl space-y-2">
                    <div className="flex items-center gap-1.5 text-emerald-400">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-emerald-400">Admin Mode Active</span>
                    </div>
                    <button
                      onClick={() => {
                        setIsAdmin(false);
                        localStorage.setItem('tvpro_is_admin', 'false');
                      }}
                      className="w-full text-center py-2 text-[10px] uppercase tracking-wider font-extrabold bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 rounded-lg text-red-500 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      End Admin Session
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setShowAdminLoginModal(true);
                      setAdminPasscode('');
                      setAdminPasscodeError('');
                    }}
                    className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border border-neutral-850 bg-neutral-900/40 text-neutral-400 hover:text-neutral-200 hover:border-neutral-750 transition-all text-xs font-bold cursor-pointer"
                  >
                    <span>🔒 Authenticate as Admin</span>
                  </button>
                )}
              </div>

            </div>

            {/* Save selection footer items */}
            <div className="p-5 border-t border-neutral-850 bg-neutral-950/20 flex items-center justify-end">
              <button
                onClick={() => setShowSettingsSidebar(false)}
                className={`w-full py-2.5 font-bold uppercase tracking-wider text-xs rounded-xl transition cursor-pointer text-white ${colorsAccent.bgSelect} ${colorsAccent.bgHover}`}
              >
                Apply Preferences
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. ADD PLAYLIST MODAL TRIGGER */}
      {showAddModal && (
        <AddPlaylistModal
          onClose={() => setShowAddModal(false)}
          onAddPlaylist={handleAddPlaylist}
          playbackSettings={playbackSettings}
        />
      )}

      {/* 6. MANAGE SOURCES MODAL TRIGGER */}
      {showManageModal && (
        <ManageSourcesModal
          onClose={() => setShowManageModal(false)}
          sources={sources}
          onToggleActive={handleToggleSourceActive}
          onRemoveSource={handleRemoveSource}
          onEditSource={handleEditSource}
          playbackSettings={playbackSettings}
        />
      )}

      {/* 7. FULLSCREEN STREAM PLAYER POPUP OVERLAY */}
      {selectedChannel && (
        <VideoPlayer
          channel={selectedChannel}
          filteredChannels={filteredChannelsOnDisplay}
          onClose={() => setSelectedChannel(null)}
          onNavigateChannel={handleNavigateChannel}
          onSelectChannel={handleSetSelectedChannel}
          isFavorite={favoritedChannelIds.includes(selectedChannel.id)}
          onToggleFavorite={handleToggleFavorite}
          playbackSettings={playbackSettings}
          updateSettings={updateSettings}
          onSwitchToLastChannel={handleSwitchToLastChannel}
          hasLastChannel={lastChannelId !== null && channels.some((c) => c.id === lastChannelId)}
        />
      )}

      {/* 8. ADMIN LOGIN PASSCODE DIALOG MODAL */}
      {showAdminLoginModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setShowAdminLoginModal(false)}
        >
          <div 
            className="w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl p-6 relative animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowAdminLoginModal(false)}
              className="absolute right-4 top-4 p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-900 border border-neutral-850 transition"
            >
              <X size={16} />
            </button>

            <div className="flex flex-col items-center text-center mt-3 mb-6">
              <div className="h-12 w-12 rounded-2xl bg-red-600/10 border border-red-500/30 flex items-center justify-center text-red-500 mb-3 animate-pulse">
                <span className="text-xl">🔑</span>
              </div>
              <h3 className="text-lg font-black tracking-tight text-white font-sans">
                Admin Panel Credentials
              </h3>
              <p className="text-xs text-neutral-400 mt-1.5 max-w-xs">
                Enter the secret administrator passcode to unlock playlist sources generation and stream management options.
              </p>
            </div>

            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-neutral-500 tracking-wider">
                  Admin Passcode
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={adminPasscode}
                  onChange={(e) => {
                    setAdminPasscode(e.target.value);
                    if (adminPasscodeError) setAdminPasscodeError('');
                  }}
                  autoFocus
                  className="w-full bg-neutral-900 border border-neutral-800 text-white placeholder-neutral-600 text-sm p-3 rounded-xl focus:outline-none focus:border-red-600/80 focus:ring-2 focus:ring-red-600/20 text-center tracking-widest font-mono transition-all"
                />
              </div>

              {adminPasscodeError && (
                <p className="text-center text-xs text-red-500 font-bold bg-red-950/20 border border-red-900/30 py-2 rounded-lg animate-shake">
                  {adminPasscodeError}
                </p>
              )}

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="submit"
                  className="w-full py-3 bg-red-600 hover:bg-red-750 text-white font-extrabold text-xs tracking-wider uppercase rounded-xl transition shadow-lg shadow-red-950/40 cursor-pointer"
                >
                  Confirm Authenticate
                </button>
                
                <button
                  type="button"
                  onClick={() => setShowAdminLoginModal(false)}
                  className="w-full py-2.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 font-bold text-xs rounded-xl border border-neutral-850 transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>

            <div className="mt-5 pt-4 border-t border-neutral-900 text-center">
              <span className="text-[10px] text-neutral-500 font-mono tracking-wide">
                🔐 Access authorized for verified system administrators only.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
