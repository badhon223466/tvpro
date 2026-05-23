import React, { useState } from 'react';
import { X, Trash2, ToggleLeft, ToggleRight, Radio, Pencil, Check, FileCode, ExternalLink } from 'lucide-react';
import { PlaylistSource, PlaybackSettings } from '../types';

interface ManageSourcesModalProps {
  onClose: () => void;
  sources: PlaylistSource[];
  onToggleActive: (id: string) => void;
  onRemoveSource: (id: string) => void;
  onEditSource: (id: string, updatedName: string, updatedUrl?: string, updatedContent?: string) => void;
  playbackSettings: PlaybackSettings;
}

export default function ManageSourcesModal({
  onClose,
  sources,
  onToggleActive,
  onRemoveSource,
  onEditSource,
  playbackSettings,
}: ManageSourcesModalProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editUrl, setEditUrl] = useState<string>('');
  const [editContent, setEditContent] = useState<string>('');

  const accentClasses = {
    red: { bg: 'bg-red-600 hover:bg-red-700', text: 'text-red-500' },
    green: { bg: 'bg-emerald-600 hover:bg-emerald-700', text: 'text-emerald-500' },
    purple: { bg: 'bg-violet-600 hover:bg-violet-700', text: 'text-violet-500' },
    orange: { bg: 'bg-amber-600 hover:bg-amber-700', text: 'text-amber-500' },
  }[playbackSettings.accentColor];

  const handleStartEdit = (src: PlaylistSource) => {
    setEditingId(src.id);
    setEditName(src.name || '');
    setEditUrl(src.url || '');
    setEditContent(src.content || '');
  };

  const handleSaveEdit = (id: string, type: string) => {
    if (editName.trim()) {
      onEditSource(
        id, 
        editName.trim(), 
        type === 'url' ? editUrl.trim() : undefined, 
        editContent
      );
    }
    setEditingId(null);
  };

  // Sort playlist sources alphabetically (from A to Z) by name
  const sortedSources = [...sources].sort((a, b) => 
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden animate-zoom-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-800/80 flex items-center justify-between">
          <h2 className="text-white text-base font-bold tracking-wider flex items-center gap-2">
            <Radio size={18} className={accentClasses.text} />
            Manage Playlist Sources (Sorted A to Z)
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-white transition-all outline-none"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content list */}
        <div className="p-6 space-y-4 max-h-[500px] overflow-y-auto">
          {sortedSources.length === 0 ? (
            <div className="text-center py-12 text-neutral-500 text-sm">
              No playoff / playlist sources loaded. Please add some starting from primary screen.
            </div>
          ) : (
            <div className="space-y-3">
              {sortedSources.map((src) => {
                const isBuiltIn = src.type === 'built-in';
                const isEditing = editingId === src.id;

                if (isEditing) {
                  return (
                    <div
                      key={src.id}
                      className="flex flex-col gap-3.5 p-4 rounded-xl border bg-neutral-950 border-neutral-800 text-left animate-fade-in"
                    >
                      <div className="flex items-center justify-between border-b border-neutral-900 pb-2">
                        <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-1.5">
                          <FileCode size={13} className={accentClasses.text} />
                          Editing: <span className="text-white normal-case">{src.type} Playlist</span>
                        </span>
                        <span className="text-[10px] text-neutral-500 font-mono">ID: {src.id}</span>
                      </div>

                      {/* Name input */}
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-semibold text-neutral-400 tracking-wider">
                          Playlist Name
                        </label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="bg-neutral-900 border border-neutral-800 text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/30 w-full"
                          placeholder="e.g. My Sports Channels"
                        />
                      </div>

                      {/* URL input if URL type */}
                      {src.type === 'url' && (
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-semibold text-neutral-400 tracking-wider flex items-center gap-1">
                            <ExternalLink size={10} />
                            Playlist URL
                          </label>
                          <input
                            type="text"
                            value={editUrl}
                            onChange={(e) => setEditUrl(e.target.value)}
                            className="bg-neutral-900 border border-neutral-800 text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/30 w-full font-mono text-emerald-400"
                            placeholder="e.g. https://domain.com/list.m3u"
                          />
                        </div>
                      )}

                      {/* Source Code text editor */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] uppercase font-semibold text-neutral-400 tracking-wider">
                            Source Code / M3U Contents
                          </label>
                          {src.type === 'url' && (
                            <span className="text-[9px] text-amber-500 font-bold">
                              Modifying code here overrides local cache
                            </span>
                          )}
                        </div>
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={6}
                          className="bg-neutral-900 border border-neutral-805 text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/30 w-full font-mono resize-y"
                          placeholder="#EXTM3U&#10;#EXTINF:-1 tvg-logo=&quot;http://logo.url&quot;,Channel Name&#10;http://stream.url.m3u8"
                        />
                      </div>

                      {/* Form action triggers */}
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-900">
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveEdit(src.id, src.type)}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <Check size={14} />
                          <span>Save & Re-parse</span>
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={src.id}
                    className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                      src.active
                        ? 'bg-neutral-950/80 border-neutral-800'
                        : 'bg-neutral-950/20 border-neutral-900 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 mr-2 min-w-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        src.active ? 'bg-red-950/20 text-red-500' : 'bg-neutral-900 text-neutral-500'
                      }`}>
                        <Radio size={16} />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs font-bold text-white tracking-wide truncate max-w-[240px]">
                              {src.name}
                            </p>
                            <button
                              onClick={() => handleStartEdit(src)}
                              className="p-1 bg-neutral-900 hover:bg-neutral-800 hover:text-white rounded text-neutral-400 transition-colors cursor-pointer"
                              title="Edit Source Information & Code"
                            >
                              <Pencil size={11} />
                            </button>
                            {isBuiltIn ? (
                              <span className="text-[8px] font-bold uppercase py-0.5 px-1.5 bg-neutral-900 text-neutral-400 rounded-full border border-neutral-800">
                                Built-in
                              </span>
                            ) : (
                              <span className="text-[8px] font-bold uppercase py-0.5 px-1.5 bg-blue-900/20 text-blue-400 rounded-full border border-blue-900/30">
                                {src.type}
                              </span>
                            )}
                          </div>
                          
                          {src.url && (
                            <p className="text-[9px] text-neutral-500 font-mono truncate max-w-[320px] mt-0.5">
                              URL: {src.url}
                            </p>
                          )}
                          
                          <p className="text-[10px] text-neutral-500 mt-1">
                            Total Streams: <span className="font-mono text-neutral-400 font-bold">{src.channelCount} channels</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Active toggler */}
                      <button
                        onClick={() => onToggleActive(src.id)}
                        className="p-1 rounded text-neutral-400 hover:text-white transition-all cursor-pointer"
                        title={src.active ? 'Deactivate source' : 'Activate source'}
                      >
                        {src.active ? (
                          <ToggleRight size={24} className={accentClasses.text} />
                        ) : (
                          <ToggleLeft size={24} className="text-neutral-600" />
                        )}
                      </button>

                      {/* Remove item */}
                      <button
                        onClick={() => onRemoveSource(src.id)}
                        className="p-2 rounded-lg hover:bg-red-950/35 text-neutral-500 hover:text-red-500 border border-transparent hover:border-red-900/40 transition-all cursor-pointer"
                        title="Remove Playlist Source"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-neutral-950/20 border-t border-neutral-800/80 flex justify-end">
          <button
            onClick={onClose}
            className={`px-5 py-2.5 rounded-lg font-bold text-xs uppercase cursor-pointer select-none text-white ${accentClasses.bg}`}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
