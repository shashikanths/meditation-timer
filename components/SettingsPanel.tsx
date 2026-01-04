import React, { useState, useEffect, useRef } from 'react';
import { StorageManager, mediaCache } from '../utils/storage';
import { generateDisplayName } from '../utils/displayName';

interface SettingsPanelProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface MediaItem {
  id: string;
  type: string;
  name: string;
  path: string;
  isCustom?: boolean;
}

const PREDEFINED_AUDIO: MediaItem[] = [
  { id: 'om-mantra', type: 'audio', name: 'Om Mantra Chant', path: '/media/audio/predefined/om-mantra.mp3' },
  { id: 'meditation-bell', type: 'audio', name: 'Meditation Bell (1 min)', path: '/media/audio/predefined/meditation-bell-1min.mp3' }
];

const PREDEFINED_IMAGES: MediaItem[] = [
  { id: 'mountain-sunrise', type: 'image', name: 'Mountain Sunrise', path: '/media/images/predefined/mountain-sunrise.jpg' },
  { id: 'ocean-sunset', type: 'image', name: 'Ocean Sunset', path: '/media/images/predefined/ocean-sunset.jpg' },
  { id: 'forest-mist', type: 'image', name: 'Misty Forest', path: '/media/images/predefined/forest-mist.jpg' }
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'audio' | 'image'>('profile');
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [customAudio, setCustomAudio] = useState<{ name: string; url: string } | null>(null);
  const [customImage, setCustomImage] = useState<{ name: string; url: string } | null>(null);
  const [displayName, setDisplayName] = useState<string>('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Load settings and custom media on mount
  useEffect(() => {
    if (!isOpen) return;

    const loadSettings = async () => {
      const settings = StorageManager.getSettings();
      setSelectedAudioId(settings.selectedAudioId);
      setSelectedImageId(settings.selectedImageId);
      setDisplayName(StorageManager.getDisplayName());

      // Load custom audio from IndexedDB
      const cachedAudio = await mediaCache.getFile('audio');
      if (cachedAudio) {
        setCustomAudio(cachedAudio);
      }

      // Load custom image from IndexedDB
      const cachedImage = await mediaCache.getFile('image');
      if (cachedImage) {
        setCustomImage(cachedImage);
      }
    };

    loadSettings();
  }, [isOpen]);

  // Handle display name save
  const handleSaveName = () => {
    if (tempName.trim()) {
      StorageManager.setDisplayName(tempName.trim());
      setDisplayName(tempName.trim());
      setIsEditingName(false);
      // Sync with backend
      fetch('/api/users/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: StorageManager.getUserId(),
          displayName: tempName.trim()
        })
      }).catch(() => {});
    }
  };

  // Generate new random name
  const handleRandomizeName = () => {
    const newName = generateDisplayName();
    setTempName(newName);
  };

  // Handle predefined media selection
  const handleSelect = (type: 'audio' | 'image', id: string) => {
    if (type === 'audio') {
      setSelectedAudioId(id);
      StorageManager.updateSettings({ selectedAudioId: id });
    } else {
      setSelectedImageId(id);
      StorageManager.updateSettings({ selectedImageId: id });
    }

    // Reload to apply changes
    setTimeout(() => window.location.reload(), 300);
  };

  // Handle custom file upload
  const handleFileUpload = async (type: 'audio' | 'image', file: File) => {
    setLoading(true);
    try {
      await mediaCache.saveFile(type, file);

      if (type === 'audio') {
        setSelectedAudioId('custom');
        setCustomAudio({ name: file.name, url: URL.createObjectURL(file) });
        StorageManager.updateSettings({
          selectedAudioId: 'custom',
          customAudioName: file.name
        });
      } else {
        setSelectedImageId('custom');
        setCustomImage({ name: file.name, url: URL.createObjectURL(file) });
        StorageManager.updateSettings({
          selectedImageId: 'custom',
          customImageName: file.name
        });
      }

      // Reload to apply changes
      setTimeout(() => window.location.reload(), 300);
    } catch (error) {
      console.error('Failed to save file:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle removing custom file
  const handleRemoveCustom = async (type: 'audio' | 'image') => {
    await mediaCache.deleteFile(type);

    if (type === 'audio') {
      setCustomAudio(null);
      setSelectedAudioId(PREDEFINED_AUDIO[0].id);
      StorageManager.updateSettings({
        selectedAudioId: PREDEFINED_AUDIO[0].id,
        customAudioName: null
      });
    } else {
      setCustomImage(null);
      setSelectedImageId(PREDEFINED_IMAGES[0].id);
      StorageManager.updateSettings({
        selectedImageId: PREDEFINED_IMAGES[0].id,
        customImageName: null
      });
    }

    setTimeout(() => window.location.reload(), 300);
  };

  if (!isOpen) return null;

  const currentItems = activeTab === 'audio' ? PREDEFINED_AUDIO : PREDEFINED_IMAGES;
  const selectedId = activeTab === 'audio' ? selectedAudioId : selectedImageId;
  const customMedia = activeTab === 'audio' ? customAudio : customImage;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-black/95 border border-primary-30 rounded-lg p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-cinzel text-white/90">Settings</h2>
          <button
            onClick={onClose}
            className="text-primary-50 hover:text-primary text-2xl transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className="flex space-x-4 mb-6 border-b border-primary-20">
          <button
            onClick={() => setActiveTab('profile')}
            className={`pb-3 px-4 text-sm uppercase tracking-[0.2em] transition-all ${
              activeTab === 'profile'
                ? 'text-primary border-b-2 border-primary'
                : 'text-primary-40 hover:text-primary'
            }`}
          >
            Profile
          </button>
          <button
            onClick={() => setActiveTab('audio')}
            className={`pb-3 px-4 text-sm uppercase tracking-[0.2em] transition-all ${
              activeTab === 'audio'
                ? 'text-primary border-b-2 border-primary'
                : 'text-primary-40 hover:text-primary'
            }`}
          >
            Audio
          </button>
          <button
            onClick={() => setActiveTab('image')}
            className={`pb-3 px-4 text-sm uppercase tracking-[0.2em] transition-all ${
              activeTab === 'image'
                ? 'text-primary border-b-2 border-primary'
                : 'text-primary-40 hover:text-primary'
            }`}
          >
            Background
          </button>
        </div>

        {/* Profile Tab Content */}
        {activeTab === 'profile' && (
          <div className="space-y-4">
            <div>
              <label className="text-primary-40 text-xs uppercase tracking-[0.2em] mb-2 block">
                Display Name
              </label>
              {isEditingName ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSaveName()}
                    className="w-full px-4 py-3 bg-black/50 border border-primary-30 rounded text-white/90 text-lg font-cinzel focus:outline-none focus:border-primary"
                    placeholder="Enter your name"
                    autoFocus
                  />
                  <div className="flex space-x-2">
                    <button
                      onClick={handleSaveName}
                      className="flex-1 px-4 py-2 bg-primary-20 hover:bg-primary-30 border border-primary rounded text-white/90 text-sm uppercase tracking-[0.2em] transition-all"
                    >
                      Save
                    </button>
                    <button
                      onClick={handleRandomizeName}
                      className="px-4 py-2 bg-primary-10 hover:bg-primary-20 border border-primary-30 rounded text-white/90 text-sm transition-all"
                      title="Generate random name"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setIsEditingName(false)}
                      className="px-4 py-2 bg-black/30 hover:bg-black/50 border border-primary-20 rounded text-primary-50 text-sm uppercase tracking-[0.2em] transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => {
                    setTempName(displayName);
                    setIsEditingName(true);
                  }}
                  className="p-4 rounded border border-primary-20 hover:border-primary-40 bg-primary-5 cursor-pointer transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white/90 text-lg font-cinzel">{displayName}</span>
                    <span className="text-primary-40 group-hover:text-primary text-xs uppercase tracking-[0.2em]">
                      Click to edit
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 p-3 bg-primary-5 border border-primary-20 rounded text-xs text-primary-50">
              Your display name is shown on the leaderboard. Click the refresh icon while editing to generate a new random name.
            </div>
          </div>
        )}

        {/* Media List */}
        {(activeTab === 'audio' || activeTab === 'image') && (
        <div className="space-y-3">
          {/* Custom Upload Option */}
          {customMedia ? (
            <div
              className={`p-4 rounded border transition-all ${
                selectedId === 'custom'
                  ? 'border-primary bg-primary-10'
                  : 'border-primary-20 bg-primary-5'
              }`}
            >
              <div className="flex items-center justify-between">
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => handleSelect(activeTab as 'audio' | 'image', 'custom')}
                >
                  <p className="text-white/90 font-medium truncate">{customMedia.name}</p>
                  <p className="text-primary-40 text-xs mt-1">Custom Upload</p>
                </div>
                <div className="flex items-center space-x-2">
                  {selectedId === 'custom' && (
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <span className="text-black text-xs">&#10003;</span>
                    </div>
                  )}
                  <button
                    onClick={() => handleRemoveCustom(activeTab as 'audio' | 'image')}
                    className="text-red-400/60 hover:text-red-400 text-sm p-1"
                    title="Remove"
                  >
                    &#10005;
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              className="p-4 rounded border border-dashed border-primary-30 hover:border-primary-50 transition-all cursor-pointer bg-primary-5"
              onClick={() => {
                if (activeTab === 'audio') {
                  audioInputRef.current?.click();
                } else {
                  imageInputRef.current?.click();
                }
              }}
            >
              <p className="text-primary-50 text-center">
                + Upload Custom {activeTab === 'audio' ? 'Audio' : 'Image'}
              </p>
              <p className="text-primary-30 text-xs text-center mt-1">
                {activeTab === 'audio' ? 'MP3, WAV, OGG (max 10MB)' : 'JPG, PNG, WebP (max 5MB)'}
              </p>
            </div>
          )}

          {/* Predefined Items */}
          {currentItems.map((item) => (
            <div
              key={item.id}
              className={`p-4 rounded border transition-all cursor-pointer ${
                selectedId === item.id
                  ? 'border-primary bg-primary-10'
                  : 'border-primary-20 hover:border-primary-40 bg-primary-5'
              }`}
              onClick={() => handleSelect(activeTab as 'audio' | 'image', item.id)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/90 font-medium">{item.name}</p>
                  <p className="text-primary-40 text-xs mt-1">Predefined</p>
                </div>
                {selectedId === item.id && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-black text-xs">&#10003;</span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Info */}
          <div className="mt-6 p-3 bg-primary-5 border border-primary-20 rounded text-xs text-primary-50">
            Custom files are stored locally in your browser and persist across sessions.
          </div>
        </div>
        )}

        {loading && (
          <div className="mt-4 text-center text-primary-50 text-sm">
            Saving...
          </div>
        )}

        {/* Hidden file inputs */}
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && file.size <= 10 * 1024 * 1024) {
              handleFileUpload('audio', file);
            } else if (file) {
              alert('File too large. Maximum size is 10MB.');
            }
          }}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && file.size <= 5 * 1024 * 1024) {
              handleFileUpload('image', file);
            } else if (file) {
              alert('File too large. Maximum size is 5MB.');
            }
          }}
        />
      </div>
    </div>
  );
};
