import React, { forwardRef, useEffect, useState } from 'react';
import { StorageManager, mediaCache } from '../utils/storage';

interface AudioPlayerProps {
  isMuted: boolean;
  userId: string;
}

const AUDIO_PATHS: Record<string, string> = {
  'om-mantra': '/media/audio/predefined/om-mantra.mp3',
  'meditation-bell': '/media/audio/predefined/meditation-bell-1min.mp3',
  'rain': '/media/audio/predefined/11L-rain_storm-14472913.mp3',
  'fire': '/media/audio/predefined/fire.mp3',
  'ocean': '/media/audio/predefined/ocean-waves.mp3'
};

export const AudioPlayer = forwardRef<HTMLAudioElement, AudioPlayerProps>(({ isMuted }, ref) => {
  const audioRef = ref as React.MutableRefObject<HTMLAudioElement | null>;
  const [audioSource, setAudioSource] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.muted = isMuted;
      audio.loop = true;
      audio.volume = 0.8;
    }
  }, [isMuted, audioRef]);

  // Load audio source from settings
  useEffect(() => {
    const loadAudioSource = async () => {
      const settings = StorageManager.getSettings();
      const selectedId = settings.selectedAudioId;

      // Handle silence option - no audio source
      if (selectedId === 'silence') {
        setAudioSource(null);
        return;
      }

      if (selectedId === 'custom') {
        // Load custom audio from IndexedDB
        const customAudio = await mediaCache.getFile('audio');
        if (customAudio) {
          setAudioSource(customAudio.url);
          return;
        }
      }

      // Use predefined audio
      const audioPath = selectedId ? AUDIO_PATHS[selectedId] : AUDIO_PATHS['om-mantra'];
      setAudioSource(audioPath || AUDIO_PATHS['om-mantra']);
    };

    loadAudioSource();
  }, []);

  return (
    <audio
      ref={ref}
      loop
      preload="auto"
      className="hidden"
      src={audioSource || undefined}
    />
  );
});

AudioPlayer.displayName = 'AudioPlayer';
