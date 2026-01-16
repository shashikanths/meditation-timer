import React, { useState, useEffect, useRef } from 'react';
import { StorageManager } from '../utils/storage';

/**
 * UnifiedTimer - Display timer for meditation sessions
 *
 * Features:
 * - Uses session checkpoint startedAt as single source of truth
 * - Count-up mode: Shows elapsed time since session start
 * - Count-down mode: Shows remaining time to goal (but session continues after)
 * - Changing timer mode doesn't reset the session - just changes display
 * - When count-down reaches 0: Play audio cue + switch to count-up showing overflow
 */

interface TimerMode {
  type: 'count-up' | 'count-down';
  targetSeconds?: number;
}

// Load initial timer mode from storage
const getInitialTimerMode = (): TimerMode => {
  const settings = StorageManager.getSettings();
  if (settings.timerSettings?.type === 'count-down' && settings.timerSettings.targetMinutes) {
    return {
      type: 'count-down',
      targetSeconds: settings.timerSettings.targetMinutes * 60
    };
  }
  return { type: 'count-up' };
};

export const UnifiedTimer: React.FC = () => {
  const [mode, setMode] = useState<TimerMode>(getInitialTimerMode);
  const [elapsed, setElapsed] = useState(0); // Elapsed seconds from session start
  const [customInput, setCustomInput] = useState('');
  const [hasPlayedCompletionSound, setHasPlayedCompletionSound] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Get elapsed time from checkpoint (single source of truth)
  const getElapsedFromCheckpoint = (): number => {
    const checkpoint = StorageManager.getSessionCheckpoint();
    if (checkpoint && checkpoint.startedAt) {
      return Math.floor((Date.now() - checkpoint.startedAt) / 1000);
    }
    return 0;
  };

  // Update elapsed time every second from checkpoint
  useEffect(() => {
    // Initial read
    setElapsed(getElapsedFromCheckpoint());

    // Update every second
    intervalRef.current = setInterval(() => {
      setElapsed(getElapsedFromCheckpoint());
    }, 1000);

    // Also update when page becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setElapsed(getElapsedFromCheckpoint());
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Listen for session end event (from End Session button)
  useEffect(() => {
    const handleEndSession = () => {
      // Reset display state
      setMode(getInitialTimerMode());
      setElapsed(0);
      setHasPlayedCompletionSound(false);
    };

    window.addEventListener('endMeditationSession', handleEndSession);
    return () => {
      window.removeEventListener('endMeditationSession', handleEndSession);
    };
  }, []);

  // Check for count-down completion
  useEffect(() => {
    if (mode.type === 'count-down' && mode.targetSeconds && !hasPlayedCompletionSound) {
      if (elapsed >= mode.targetSeconds) {
        // Play audio cue once
        if (audioRef.current) {
          audioRef.current.play().catch(e => console.warn('Audio cue blocked:', e));
        }
        setHasPlayedCompletionSound(true);

        // Switch to count-up mode showing time beyond goal
        console.log('🎯 Goal reached! Continuing in count-up mode...');
        setMode({ type: 'count-up' });
        StorageManager.updateSettings({
          timerSettings: { type: 'count-up' }
        });
      }
    }
  }, [elapsed, mode, hasPlayedCompletionSound]);

  // Format time as HH:MM:SS or MM:SS
  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate display time based on mode
  const getDisplayTime = (): number => {
    if (mode.type === 'count-up') {
      return elapsed;
    } else if (mode.type === 'count-down' && mode.targetSeconds) {
      return Math.max(0, mode.targetSeconds - elapsed);
    }
    return 0;
  };

  // Handle preset button clicks - just changes display mode, doesn't reset session
  const handlePreset = (minutes: number) => {
    setMode({ type: 'count-down', targetSeconds: minutes * 60 });
    setHasPlayedCompletionSound(false);
    // Persist timer selection
    StorageManager.updateSettings({
      timerSettings: { type: 'count-down', targetMinutes: minutes }
    });
  };

  // Handle custom duration input
  const handleCustomSet = () => {
    const minutes = parseInt(customInput);
    if (!isNaN(minutes) && minutes > 0) {
      handlePreset(minutes);
      setCustomInput('');
    }
  };

  // Reset to count-up mode - just changes display, doesn't reset session
  const handleReset = () => {
    setMode({ type: 'count-up' });
    // Persist open session selection
    StorageManager.updateSettings({
      timerSettings: { type: 'count-up' }
    });
  };

  const displayTime = getDisplayTime();
  const isCountDown = mode.type === 'count-down';

  return (
    <div className="flex flex-col items-center space-y-6">
      {/* Timer Display */}
      <div className="text-center">
        <div className="text-8xl md:text-9xl font-cinzel font-bold text-white/90 glow-primary-strong tracking-wider">
          {formatTime(displayTime)}
        </div>
        <p className="text-[10px] uppercase tracking-[0.5em] text-primary-40 mt-4 font-bold">
          {isCountDown && mode.targetSeconds
            ? `Goal: ${formatTime(mode.targetSeconds)}`
            : 'Open Session'}
        </p>
      </div>

      {/* Preset Buttons */}
      <div className="flex flex-wrap gap-3 justify-center">
        {[
          { minutes: 10, label: '10 Min' },
          { minutes: 20, label: '20 Min' },
          { minutes: 30, label: '30 Min' },
          { minutes: 60, label: '1 Hour' }
        ].map(({ minutes, label }) => {
          const isActive = mode.type === 'count-down' && mode.targetSeconds === minutes * 60;
          return (
            <button
              key={minutes}
              onClick={() => handlePreset(minutes)}
              className={`px-6 py-2 border rounded text-sm uppercase tracking-[0.2em] transition-all duration-300 ${
                isActive
                  ? 'bg-primary-30 border-primary text-white'
                  : 'bg-primary-10 hover:bg-primary-20 border-primary-30 text-white/90'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Custom Duration Input */}
      <div className="flex items-center space-x-2">
        <input
          type="number"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleCustomSet()}
          placeholder="Custom minutes"
          className="px-4 py-2 bg-black/50 border border-primary-30 rounded text-white/90 text-sm placeholder:text-primary-30 focus:outline-none focus:border-primary-50 w-40"
        />
        <button
          onClick={handleCustomSet}
          className="px-4 py-2 bg-primary-20 hover:bg-primary-30 border border-primary-40 rounded text-white/90 text-sm uppercase tracking-[0.2em] transition-all duration-300"
        >
          Set
        </button>
      </div>

      {/* Reset Button */}
      {isCountDown && (
        <button
          onClick={handleReset}
          className="text-primary-40 hover:text-primary text-xs uppercase tracking-[0.3em] transition-colors duration-300"
        >
          Reset to Open Session
        </button>
      )}

      {/* Hidden audio element for completion cue */}
      <audio
        ref={audioRef}
        src="https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1539c.mp3"
        preload="auto"
      />
    </div>
  );
};
