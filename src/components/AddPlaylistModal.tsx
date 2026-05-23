import React, { useState, useRef } from 'react';
import { X, Plus, UploadCloud, Link2, AlignLeft, AlertCircle } from 'lucide-react';
import { PlaylistSource, Channel, PlaybackSettings } from '../types';

interface AddPlaylistModalProps {
  onClose: () => void;
  onAddPlaylist: (source: PlaylistSource, newChannels: Channel[]) => void;
  playbackSettings: PlaybackSettings;
}

// Helper to extract attribute value from line with double quotes, single quotes, or no quotes
export function getAttributeValue(line: string, attrName: string): string {
  const regex = new RegExp(`${attrName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s,]*))`, 'i');
  const match = line.match(regex);
  if (match) {
    return (match[1] !== undefined ? match[1] : (match[2] !== undefined ? match[2] : match[3])) || '';
  }
  return '';
}

// Helper to find the index of the first comma outside of single/double quotes in the line
export function findSeparatorComma(line: string): number {
  let inDoubleQuotes = false;
  let inSingleQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && !inSingleQuotes) {
      inDoubleQuotes = !inDoubleQuotes;
    } else if (char === "'" && !inDoubleQuotes) {
      inSingleQuotes = !inSingleQuotes;
    } else if (char === ',' && !inDoubleQuotes && !inSingleQuotes) {
      return i;
    }
  }
  return -1;
}

// Robust M3U format parser
export function parseM3U(content: string, sourceId: string): Channel[] {
  // Strip BOM if present (e.g. \uFEFF from Windows Notepad exports)
  let cleanContent = content;
  if (cleanContent.charCodeAt(0) === 0xFEFF) {
    cleanContent = cleanContent.slice(1);
  }

  // Split on any combination of line ending (CRLF, LF, or CR)
  const lines = cleanContent.split(/\r?\n|\r/);
  const channels: Channel[] = [];
  let currentMeta: { name: string; logo: string; category: string; resolution?: string } | null = null;
  let chIdCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      const logo = getAttributeValue(line, 'tvg-logo') || getAttributeValue(line, 'logo') || getAttributeValue(line, 'icon');
      const group = getAttributeValue(line, 'group-title') || getAttributeValue(line, 'group') || getAttributeValue(line, 'category');
      
      const commaIndex = findSeparatorComma(line);
      let name = '';
      if (commaIndex !== -1) {
        name = line.substring(commaIndex + 1).trim();
      } else {
        name = getAttributeValue(line, 'tvg-name') || getAttributeValue(line, 'name') || '';
      }

      currentMeta = {
        name: name,
        logo: logo,
        category: group || 'Online',
        resolution: 'Auto'
      };
    } else if (!line.startsWith('#')) {
      // Treat any non-comment line as the channel streaming URL
      const finalUrl = line.trim();
      
      let finalName = currentMeta?.name;
      if (!finalName) {
        // Fallback: extract filename or assign counter
        try {
          const urlObj = new URL(finalUrl);
          const pathname = urlObj.pathname;
          const lastPart = pathname.substring(pathname.lastIndexOf('/') + 1);
          if (lastPart) {
            finalName = decodeURIComponent(lastPart).replace(/\.[^/.]+$/, '');
          }
        } catch (e) {
          // If URL parsing fails, ignore and build fallback
        }
        if (!finalName) {
          finalName = `Live Channel ${chIdCounter}`;
        }
      }

      const fallbackLogo = currentMeta?.logo || '📺';
      channels.push({
        id: `${sourceId}-${chIdCounter++}`,
        name: finalName,
        logo: fallbackLogo,
        url: finalUrl,
        category: currentMeta?.category || 'Online',
        sourceId: sourceId,
        online: true,
        resolution: '1920x1080',
      });
      currentMeta = null;
    }
  }

  return channels;
}

// JSON format parser fallback
export function parseJSON(content: string, sourceId: string): Channel[] {
  try {
    const trimmed = content.trim();
    const parsed = JSON.parse(trimmed);
    
    // Support either an array of channels, or a wrapped response like { channels: [...] } or { tracks: [...] }
    let items: any[] = [];
    if (Array.isArray(parsed)) {
      items = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const keys = ['channels', 'items', 'streams', 'tracks', 'data', 'list'];
      for (const k of keys) {
        if (Array.isArray(parsed[k])) {
          items = parsed[k];
          break;
        }
      }
    }

    if (items.length === 0) return [];
    
    return items.map((item: any, idx: number) => {
      const name = item.name || item.title || item.tvg_name || item.channel_name || `Channel ${idx + 1}`;
      const url = item.url || item.stream || item.streamUrl || item.link || item.source || '';
      const logo = item.logo || item.icon || item.tvg_logo || item.logo_url || '📺';
      const category = item.category || item.genre || item.group || item.group_title || 'Online';
      
      return {
        id: `${sourceId}-${idx + 1}`,
        name: name,
        logo: logo,
        url: url.trim(),
        category: category,
        sourceId: sourceId,
        online: true,
        resolution: item.resolution || '1920x1080',
      };
    }).filter((c: Channel) => c.url);
  } catch (e) {
    console.error('JSON parsing failure, string is not an array', e);
    return [];
  }
}

export default function AddPlaylistModal({
  onClose,
  onAddPlaylist,
  playbackSettings,
}: AddPlaylistModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [sourceName, setSourceName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [pastedContent, setPastedContent] = useState('');
  const [errorText, setErrorText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Colors mapping based on settings
  const accentClasses = {
    red: 'bg-red-600 hover:bg-red-700 text-white shadow-red-950/20 active:bg-red-800 focus:border-red-600 focus:ring-red-600',
    green: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-950/20 active:bg-emerald-800 focus:border-emerald-600 focus:ring-emerald-600',
    purple: 'bg-violet-600 hover:bg-violet-700 text-white shadow-violet-950/20 active:bg-violet-800 focus:border-violet-600 focus:ring-violet-600',
    orange: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-950/20 active:bg-amber-800 focus:border-amber-600 focus:ring-amber-600',
  }[playbackSettings.accentColor];

  // Helper file selector reader
  const handleFileChange = (file: File) => {
    setSelectedFile(file);
    setErrorText('');
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setFileContent(text);
      if (!sourceName) {
        // Use clean file name as source name placeholder
        const baseName = file.name.replace(/\.[^/.]+$/, '');
        setSourceName(baseName);
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // Submit form handler
  const handleSubmitSource = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText('');
    setIsLoading(true);

    const trimmedName = sourceName.trim();
    if (!trimmedName) {
      setErrorText('Please choose a Source Name (e.g., "My Playlist").');
      setIsLoading(false);
      return;
    }

    let channels: Channel[] = [];
    let method: 'file' | 'url' | 'pasted' = 'pasted';
    const cleanId = trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    let finalContent = '';

    try {
      if (fileContent) {
        // 1. Process Loaded File
        const isJson = selectedFile?.name?.toLowerCase().endsWith('.json') || fileContent.trim().startsWith('[');
        channels = isJson ? parseJSON(fileContent, cleanId) : parseM3U(fileContent, cleanId);
        method = 'file';
        finalContent = fileContent;
      } else if (urlInput.trim()) {
        // 2. Process URL input
        let url = urlInput.trim();
        
        // Convert typical GitHub browser links (containing /blob/) to raw content links automatically
        if (url.includes('github.com') && url.includes('/blob/')) {
          url = url.replace('github.com', 'raw.githubusercontent.com')
                   .replace('/blob/', '/');
        }
        
        method = 'url';
        
        let fetchedText = '';
        let fetchSuccess = false;
        let lastErrorMessage = '';
        
        // 1. Try our high-reliability server-side CORS-bypass proxy first
        try {
          const proxyUrl = `/api/fetch-playlist?url=${encodeURIComponent(url)}`;
          const response = await fetch(proxyUrl);
          if (response.ok) {
            fetchedText = await response.text();
            // Check if our server proxy returned a JSON-encoded error
            if (fetchedText.trim().startsWith('{')) {
              try {
                const parsed = JSON.parse(fetchedText);
                if (parsed.error) {
                  lastErrorMessage = parsed.error;
                } else {
                  fetchSuccess = true;
                }
              } catch (e) {
                // If JSON isn't error format, it might be JSON channel list, count as success
                fetchSuccess = true;
              }
            } else {
              fetchSuccess = true;
            }
          } else {
            const errBody = await response.json().catch(() => ({}));
            lastErrorMessage = errBody.error || `HTTP status ${response.status}`;
          }
        } catch (proxyErr: any) {
          console.warn('Backend proxy lookup failed. Falling back to client-side...', proxyErr);
          lastErrorMessage = proxyErr?.message || 'Server-side route unreachable';
        }

        // 2. Fallback: Try direct browser fetch
        if (!fetchSuccess) {
          try {
            const response = await fetch(url);
            if (response.ok) {
              fetchedText = await response.text();
              fetchSuccess = true;
            } else {
              lastErrorMessage = `HTTP status ${response.status}`;
            }
          } catch (fetchErr: any) {
            console.warn('Direct browser fetch blocked or failed. Trying public proxies...', fetchErr);
            lastErrorMessage = fetchErr?.message || 'Network block';
          }
        }
        
        // 3. Fallback: Try corsproxy.io
        if (!fetchSuccess) {
          try {
            const corsProxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
            const response = await fetch(corsProxyUrl);
            if (response.ok) {
              fetchedText = await response.text();
              fetchSuccess = true;
            } else {
              lastErrorMessage = `Corsproxy.io returned status ${response.status}`;
            }
          } catch (corsErr: any) {
            console.warn('Corsproxy.io failed. Trying AllOrigins...', corsErr);
            lastErrorMessage = corsErr?.message || 'Corsproxy.io failed';
          }
        }
        
        // 4. Fallback: Try AllOrigins raw proxy
        if (!fetchSuccess) {
          try {
            const allOriginsUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
            const response = await fetch(allOriginsUrl);
            if (response.ok) {
              fetchedText = await response.text();
              fetchSuccess = true;
            } else {
              lastErrorMessage = `AllOrigins returned status ${response.status}`;
            }
          } catch (allOriginsErr: any) {
            console.error('AllOrigins failed:', allOriginsErr);
            lastErrorMessage = allOriginsErr?.message || 'CORS proxy error';
          }
        }

        if (!fetchSuccess || !fetchedText || fetchedText.trim() === '') {
          throw new Error(`Failed to fetch the playlist from URL. Raw error: ${lastErrorMessage}. Please verify the URL is valid, active, and contains compatible list formats.`);
        }

        finalContent = fetchedText;
        const isJson = url.toLowerCase().endsWith('.json') || fetchedText.trim().startsWith('[') || fetchedText.trim().startsWith('{');
        channels = isJson ? parseJSON(fetchedText, cleanId) : parseM3U(fetchedText, cleanId);

      } else if (pastedContent.trim()) {
        // 3. Process Paste contents
        const text = pastedContent.trim();
        const isJson = text.startsWith('[') || text.startsWith('{');
        channels = isJson ? parseJSON(text, cleanId) : parseM3U(text, cleanId);
        method = 'pasted';
        finalContent = text;
      } else {
        setErrorText('Please select an M3U file, provide a Stream URL, or paste list contents.');
        setIsLoading(false);
        return;
      }

      if (channels.length === 0) {
        setErrorText('Could not find any valid channels in the provided list. Ensure it conforms to #EXTM3U formatting or correct fields.');
        setIsLoading(false);
        return;
      }

      const newSource: PlaylistSource = {
        id: cleanId,
        name: trimmedName,
        type: method,
        channelCount: channels.length,
        loaded: true,
        active: true,
        url: urlInput.trim() || undefined,
        content: finalContent || undefined,
      };

      onAddPlaylist(newSource, channels);
      setIsLoading(false);
      onClose();
    } catch (err: any) {
      console.error('Failed to parse network URL:', err);
      setErrorText(`Error loading playlist: ${err?.message || 'Access/Fetch failure.'}`);
      setIsLoading(false);
    }
  };

  return (
    <div
      id="add-playlist-source-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 uppercase-none backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl select-none overflow-hidden animate-zoom-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-neutral-800/80 flex items-center justify-between">
          <h2 className="text-white text-base font-bold tracking-wider flex items-center gap-2">
            <Plus size={18} className="text-red-500" />
            Add Playlist Source
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-white transition-all outline-none"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal form */}
        <form onSubmit={handleSubmitSource} className="p-6 space-y-4 text-xs font-sans tracking-wide">
          {errorText && (
            <div className="flex items-center gap-2 bg-red-950/40 border border-red-800/80 text-red-400 p-3 rounded-lg animate-pulse">
              <AlertCircle size={15} />
              <span>{errorText}</span>
            </div>
          )}

          {/* Source Name input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-neutral-400 font-bold uppercase text-[10px] tracking-widest">
              Source Name
            </label>
            <input
              type="text"
              placeholder="e.g. My Custom Playlist"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-700 transition"
              required
            />
          </div>

          {/* FROM FILE SECTION */}
          <div className="pt-2">
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-neutral-800/60"></div>
              <span className="flex-shrink mx-4 text-[10px] text-neutral-500 font-bold uppercase tracking-widest">
                FROM FILE
              </span>
              <div className="flex-grow border-t border-neutral-800/60"></div>
            </div>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition ${
                isDragging
                  ? 'border-red-600 bg-red-950/10'
                  : 'border-neutral-850 hover:border-neutral-800 hover:bg-neutral-950/20'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                accept=".m3u,.m3u8,.json,.txt"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
                className="hidden"
              />
              <UploadCloud size={32} className="text-neutral-500 mb-2" />
              <p className="text-neutral-300 font-semibold mb-1 text-center">
                {selectedFile ? selectedFile.name : 'Click to Upload or Drag and Drop'}
              </p>
              <p className="text-neutral-500 text-[10px] tracking-tight text-center">
                Supports Standard IPTV .M3U, .M3U8, or .JSON formats
              </p>
            </div>
          </div>

          {/* FROM URL SECTION */}
          <div>
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-neutral-800/60"></div>
              <span className="flex-shrink mx-4 text-[10px] text-neutral-500 font-bold uppercase tracking-widest">
                FROM URL
              </span>
              <div className="flex-grow border-t border-neutral-800/60"></div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-neutral-400 font-bold uppercase text-[10px] tracking-widest flex items-center gap-1">
                <Link2 size={10} /> M3U / JSON / M3U8 URL
              </label>
              <input
                type="url"
                placeholder="https://example.com/playlist.m3u OR .php .json .m3u8"
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  if (e.target.value && pastedContent) setPastedContent('');
                  if (e.target.value && selectedFile) {
                    setSelectedFile(null);
                    setFileContent('');
                  }
                }}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-700 transition"
              />
            </div>
          </div>

          {/* PASTE CONTENT */}
          <div>
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-neutral-800/60"></div>
              <span className="flex-shrink mx-4 text-[10px] text-neutral-500 font-bold uppercase tracking-widest">
                PASTE CONTENT
              </span>
              <div className="flex-grow border-t border-neutral-800/60"></div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-neutral-400 font-bold uppercase text-[10px] tracking-widest flex items-center gap-1">
                <AlignLeft size={10} /> Paste playlist content
              </label>
              <textarea
                placeholder="#EXTM3U&#10;#EXTINF:-1 tvg-logo=&quot;http://logo.url&quot; group-title=&quot;Cricket&quot;,Match Title&#10;https://stream.server/feed.m3u8"
                value={pastedContent}
                onChange={(e) => {
                  setPastedContent(e.target.value);
                  if (e.target.value && urlInput) setUrlInput('');
                  if (e.target.value && selectedFile) {
                    setSelectedFile(null);
                    setFileContent('');
                  }
                }}
                rows={5}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-white placeholder-neutral-600 font-mono text-[10px] focus:outline-none focus:border-neutral-700 transition resize-none"
              />
            </div>
          </div>

          {/* Playlists Footer */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800/85">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-5 py-2.5 rounded-lg bg-neutral-950 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-850 transition-all cursor-pointer font-bold select-none text-[12px] uppercase disabled:opacity-50 disabled:pointer-events-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className={`px-5 py-2.5 rounded-lg font-bold select-none text-[12px] uppercase transition-all flex items-center gap-1.5 shadow-lg cursor-pointer disabled:opacity-50 disabled:pointer-events-none ${accentClasses}`}
            >
              {isLoading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0"></span>
                  <span>Fetching...</span>
                </>
              ) : (
                <span>Add Source</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
