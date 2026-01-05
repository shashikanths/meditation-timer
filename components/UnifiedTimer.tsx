import React, { useState, useEffect, useRef } from 'react';
import { StorageManager } from '../utils/storage';

/**
 * UnifiedTimer - Combines SessionTimer (count-up) and CountdownTimer (preset countdown)
 *
 * Features:
 * - Auto-starts on mount
 * - Count-up mode: Open-ended meditation (elapsed time only)
 * - Count-down mode: Preset duration (10m, 20m, 30m, 1h, custom)
 * - When count-down reaches 0: Play audio cue + switch to count-up mode
 * - Persists selected timer mode across refreshes
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
  const [elapsed, setElapsed] = useState(0); // Total elapsed time in seconds
  const [isRunning, setIsRunning] = useState(true); // Auto-start on mount
  const [customInput, setCustomInput] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Timer interval
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setElapsed(prev => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  // Check for count-down completion
  useEffect(() => {
    if (mode.type === 'count-down' && mode.targetSeconds) {
      const displayTime = mode.targetSeconds - elapsed;

      if (displayTime <= 0 && elapsed > 0) {
        // Play audio cue
        if (audioRef.current) {
          audioRef.current.play().catch(e => console.warn('Audio cue blocked:', e));
        }

        // Switch to count-up mode
        console.log('🎯 Goal reached! Continuing in count-up mode...');
        setMode({ type: 'count-up' });
        // Reset elapsed to 0 for count-up
        setElapsed(0);
      }
    }
  }, [elapsed, mode]);

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

  // Handle preset button clicks
  const handlePreset = (minutes: number) => {
    setMode({ type: 'count-down', targetSeconds: minutes * 60 });
    setElapsed(0);
    setIsRunning(true);
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

  // Reset to count-up mode
  const handleReset = () => {
    setMode({ type: 'count-up' });
    setElapsed(0);
    setIsRunning(true);
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
