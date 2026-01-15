import { forwardRef, useEffect, useState, useRef, useImperativeHandle, useCallback } from 'react';
import { StorageManager, mediaCache } from '../utils/storage';

interface AudioPlayerProps {
  isMuted: boolean;
  userId: string;
}

export interface AudioPlayerHandle {
  play: () => Promise<void>;
  pause: () => void;
  setMuted: (muted: boolean) => void;
}

const AUDIO_PATHS: Record<string, string> = {
  'om-mantra': '/media/audio/predefined/om-mantra.mp3',
  'meditation-bell': '/media/audio/predefined/meditation-bell-1min.mp3',
  'rain': '/media/audio/predefined/11L-rain_storm-14472913.mp3',
  'fire': '/media/audio/predefined/fire.mp3',
  'ocean': '/media/audio/predefined/ocean-waves.mp3'
};

// Crossfade duration in seconds
const CROSSFADE_DURATION = 2;
// How often to update volume during crossfade (ms)
const FADE_INTERVAL = 50;

export const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(({ isMuted }, ref) => {
  const [audioSource, setAudioSource] = useState<string | null>(null);

  // Two audio elements for crossfade looping
  const audio1Ref = useRef<HTMLAudioElement | null>(null);
  const audio2Ref = useRef<HTMLAudioElement | null>(null);

  // Track which audio is currently "primary" (fading in or playing full volume)
  const activeAudioRef = useRef<1 | 2>(1);

  // Playback state
  const isPlayingRef = useRef(false);
  const isMutedRef = useRef(isMuted);
  const masterVolumeRef = useRef(0.8);

  // Fade interval refs
  const fadeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const scheduleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update muted state
  useEffect(() => {
    isMutedRef.current = isMuted;
    const volume = isMuted ? 0 : masterVolumeRef.current;

    if (audio1Ref.current) {
      // Preserve the relative volumes during crossfade
      const currentRatio1 = audio1Ref.current.volume / masterVolumeRef.current || 0;
      audio1Ref.current.volume = isMuted ? 0 : currentRatio1 * masterVolumeRef.current;
    }
    if (audio2Ref.current) {
      const currentRatio2 = audio2Ref.current.volume / masterVolumeRef.current || 0;
      audio2Ref.current.volume = isMuted ? 0 : currentRatio2 * masterVolumeRef.current;
    }
  }, [isMuted]);

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

  // Setup Media Session API for background playback
  const setupMediaSession = useCallback(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Meditation',
        artist: 'Instant Om',
        album: 'Meditation Session',
      });

      navigator.mediaSession.setActionHandler('play', () => {
        if (!isPlayingRef.current) {
          play();
        }
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        pause();
      });
    }
  }, []);

  // Initialize audio elements when source changes
  useEffect(() => {
    if (!audioSource) return;

    // Create audio elements if they don't exist
    if (!audio1Ref.current) {
      audio1Ref.current = new Audio();
      audio1Ref.current.preload = 'auto';
    }
    if (!audio2Ref.current) {
      audio2Ref.current = new Audio();
      audio2Ref.current.preload = 'auto';
    }

    // Set source for both audio elements
    audio1Ref.current.src = audioSource;
    audio2Ref.current.src = audioSource;

    // Initial volume setup
    audio1Ref.current.volume = 0;
    audio2Ref.current.volume = 0;

    // Load both audio elements
    audio1Ref.current.load();
    audio2Ref.current.load();

    setupMediaSession();

    return () => {
      // Cleanup on unmount
      clearFadeInterval();
      if (scheduleTimeoutRef.current) {
        clearTimeout(scheduleTimeoutRef.current);
      }
      if (audio1Ref.current) {
        audio1Ref.current.pause();
        audio1Ref.current.src = '';
      }
      if (audio2Ref.current) {
        audio2Ref.current.pause();
        audio2Ref.current.src = '';
      }
    };
  }, [audioSource, setupMediaSession]);

  const clearFadeInterval = () => {
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
  };

  // Perform crossfade between two audio elements
  const performCrossfade = useCallback((fadeOutAudio: HTMLAudioElement, fadeInAudio: HTMLAudioElement) => {
    const startTime = Date.now();
    const fadeDurationMs = CROSSFADE_DURATION * 1000;

    // Start the incoming audio at volume 0
    fadeInAudio.currentTime = 0;
    fadeInAudio.volume = 0;
    fadeInAudio.play().catch(console.error);

    clearFadeInterval();

    fadeIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / fadeDurationMs, 1);

      if (!isMutedRef.current) {
        // Linear crossfade
        fadeOutAudio.volume = Math.max(0, (1 - progress) * masterVolumeRef.current);
        fadeInAudio.volume = Math.min(masterVolumeRef.current, progress * masterVolumeRef.current);
      }

      if (progress >= 1) {
        clearFadeInterval();
        // Stop the faded out audio
        fadeOutAudio.pause();
        fadeOutAudio.currentTime = 0;
      }
    }, FADE_INTERVAL);
  }, []);

  // Schedule the next crossfade
  const scheduleNextCrossfade = useCallback(() => {
    if (!isPlayingRef.current) return;

    const activeAudio = activeAudioRef.current === 1 ? audio1Ref.current : audio2Ref.current;
    const nextAudio = activeAudioRef.current === 1 ? audio2Ref.current : audio1Ref.current;

    if (!activeAudio || !nextAudio) return;

    // Calculate when to start the crossfade
    // We want to start CROSSFADE_DURATION seconds before the current track ends
    const timeUntilCrossfade = (activeAudio.duration - activeAudio.currentTime - CROSSFADE_DURATION) * 1000;

    if (timeUntilCrossfade <= 0) {
      // Start crossfade immediately if we're already in the crossfade zone
      performCrossfade(activeAudio, nextAudio);
      activeAudioRef.current = activeAudioRef.current === 1 ? 2 : 1;
      scheduleNextCrossfade();
    } else {
      // Schedule the crossfade
      if (scheduleTimeoutRef.current) {
        clearTimeout(scheduleTimeoutRef.current);
      }

      scheduleTimeoutRef.current = setTimeout(() => {
        if (isPlayingRef.current) {
          performCrossfade(activeAudio, nextAudio);
          activeAudioRef.current = activeAudioRef.current === 1 ? 2 : 1;
          scheduleNextCrossfade();
        }
      }, timeUntilCrossfade);
    }
  }, [performCrossfade]);

  // Handle timeupdate to reschedule if needed (in case of seeking or timing issues)
  useEffect(() => {
    const handleTimeUpdate = () => {
      // This helps recover if the page was backgrounded and timing got off
      if (isPlayingRef.current && !scheduleTimeoutRef.current) {
        scheduleNextCrossfade();
      }
    };

    const audio1 = audio1Ref.current;
    const audio2 = audio2Ref.current;

    if (audio1) {
      audio1.addEventListener('timeupdate', handleTimeUpdate);
    }
    if (audio2) {
      audio2.addEventListener('timeupdate', handleTimeUpdate);
    }

    return () => {
      if (audio1) {
        audio1.removeEventListener('timeupdate', handleTimeUpdate);
      }
      if (audio2) {
        audio2.removeEventListener('timeupdate', handleTimeUpdate);
      }
    };
  }, [audioSource, scheduleNextCrossfade]);

  const play = async () => {
    if (!audioSource || isPlayingRef.current) return;

    const activeAudio = activeAudioRef.current === 1 ? audio1Ref.current : audio2Ref.current;
    if (!activeAudio) return;

    try {
      isPlayingRef.current = true;

      // Start playing the active audio
      activeAudio.currentTime = 0;
      activeAudio.volume = isMutedRef.current ? 0 : masterVolumeRef.current;
      await activeAudio.play();

      // Update media session
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }

      // Schedule the first crossfade
      scheduleNextCrossfade();
    } catch (error) {
      console.error('Failed to play audio:', error);
      isPlayingRef.current = false;
    }
  };

  const pause = () => {
    isPlayingRef.current = false;

    clearFadeInterval();
    if (scheduleTimeoutRef.current) {
      clearTimeout(scheduleTimeoutRef.current);
      scheduleTimeoutRef.current = null;
    }

    if (audio1Ref.current) {
      audio1Ref.current.pause();
    }
    if (audio2Ref.current) {
      audio2Ref.current.pause();
    }

    // Update media session
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
  };

  const setMuted = (muted: boolean) => {
    isMutedRef.current = muted;

    if (muted) {
      if (audio1Ref.current) audio1Ref.current.volume = 0;
      if (audio2Ref.current) audio2Ref.current.volume = 0;
    } else {
      // Restore volume based on which audio is active
      const activeAudio = activeAudioRef.current === 1 ? audio1Ref.current : audio2Ref.current;
      if (activeAudio && !activeAudio.paused) {
        activeAudio.volume = masterVolumeRef.current;
      }
    }
  };

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    play,
    pause,
    setMuted
  }));

  // No DOM element needed - Audio elements are created programmatically
  return null;
});

AudioPlayer.displayName = 'AudioPlayer';
