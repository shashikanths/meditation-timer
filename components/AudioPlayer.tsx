import { forwardRef, useEffect, useState, useRef, useImperativeHandle } from 'react';
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

export const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(({ isMuted }, ref) => {
  const [audioSource, setAudioSource] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const sourceNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const gainNodesRef = useRef<GainNode[]>([]);
  const isPlayingRef = useRef(false);
  const isMutedRef = useRef(isMuted);
  const masterGainRef = useRef<GainNode | null>(null);

  // Update muted state
  useEffect(() => {
    isMutedRef.current = isMuted;
    if (masterGainRef.current) {
      masterGainRef.current.gain.setValueAtTime(
        isMuted ? 0 : 0.8,
        audioContextRef.current?.currentTime || 0
      );
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

  // Initialize Web Audio API and load buffer when source changes
  useEffect(() => {
    if (!audioSource) return;

    const initAudio = async () => {
      try {
        // Create AudioContext if not exists
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
          masterGainRef.current = audioContextRef.current.createGain();
          masterGainRef.current.gain.setValueAtTime(isMutedRef.current ? 0 : 0.8, 0);
          masterGainRef.current.connect(audioContextRef.current.destination);
        }

        // Fetch and decode audio
        const response = await fetch(audioSource);
        const arrayBuffer = await response.arrayBuffer();
        audioBufferRef.current = await audioContextRef.current.decodeAudioData(arrayBuffer);
      } catch (error) {
        console.error('Failed to initialize Web Audio:', error);
      }
    };

    initAudio();

    return () => {
      // Cleanup on unmount
      sourceNodesRef.current.forEach(node => {
        try { node.stop(); } catch {}
      });
    };
  }, [audioSource]);

  // Schedule seamless loop with crossfade
  const scheduleLoop = (startTime: number) => {
    if (!audioContextRef.current || !audioBufferRef.current || !masterGainRef.current) return;

    const ctx = audioContextRef.current;
    const buffer = audioBufferRef.current;
    const duration = buffer.duration;

    // Create source node
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Create gain node for crossfade
    const gainNode = ctx.createGain();
    source.connect(gainNode);
    gainNode.connect(masterGainRef.current);

    // Fade in at start
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(1, startTime + CROSSFADE_DURATION);

    // Fade out at end
    gainNode.gain.setValueAtTime(1, startTime + duration - CROSSFADE_DURATION);
    gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

    // Start playback
    source.start(startTime);

    // Track nodes for cleanup
    sourceNodesRef.current.push(source);
    gainNodesRef.current.push(gainNode);

    // Clean up old nodes (keep last 3)
    if (sourceNodesRef.current.length > 3) {
      const oldSource = sourceNodesRef.current.shift();
      const oldGain = gainNodesRef.current.shift();
      try { oldSource?.disconnect(); } catch {}
      try { oldGain?.disconnect(); } catch {}
    }

    // Schedule next loop (overlap by crossfade duration)
    if (isPlayingRef.current) {
      const nextStartTime = startTime + duration - CROSSFADE_DURATION;
      setTimeout(() => {
        if (isPlayingRef.current) {
          scheduleLoop(ctx.currentTime);
        }
      }, (nextStartTime - ctx.currentTime - 0.5) * 1000); // Schedule 0.5s before needed
    }
  };

  const play = async () => {
    if (!audioSource || isPlayingRef.current) return;

    try {
      // Resume AudioContext if suspended (browser autoplay policy)
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      if (!audioContextRef.current || !audioBufferRef.current) {
        // Fallback: wait for audio to load
        await new Promise(resolve => setTimeout(resolve, 500));
        if (!audioContextRef.current || !audioBufferRef.current) return;
      }

      isPlayingRef.current = true;
      scheduleLoop(audioContextRef.current.currentTime);
    } catch (error) {
      console.error('Failed to play audio:', error);
    }
  };

  const pause = () => {
    isPlayingRef.current = false;
    sourceNodesRef.current.forEach(node => {
      try { node.stop(); } catch {}
    });
    sourceNodesRef.current = [];
    gainNodesRef.current = [];
  };

  const setMuted = (muted: boolean) => {
    isMutedRef.current = muted;
    if (masterGainRef.current && audioContextRef.current) {
      masterGainRef.current.gain.setValueAtTime(
        muted ? 0 : 0.8,
        audioContextRef.current.currentTime
      );
    }
  };

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    play,
    pause,
    setMuted
  }));

  // No DOM element needed - Web Audio API handles everything
  return null;
});

AudioPlayer.displayName = 'AudioPlayer';
