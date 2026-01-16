/**
 * MEDITATION TIMER - Mindfulness Guide
 * A minimal, atmospheric application for meditation with real-time tracking.
 */

import { useState, useEffect, useRef } from 'react';
import { GlobalCounter } from './components/GlobalCounter';
import { UnifiedTimer } from './components/UnifiedTimer';
import { BackgroundManager } from './components/BackgroundManager';
import { AudioPlayer, AudioPlayerHandle } from './components/AudioPlayer';
import { StatsManager } from './components/StatsManager';
import { SettingsPanel } from './components/SettingsPanel';
import { SessionConfirmationPopup } from './components/SessionConfirmationPopup';
import { StorageManager, PendingOrphanSession } from './utils/storage';
import { initializeUser } from './lib/database';

const App = () => {
  const [isMuted, setIsMuted] = useState(false);
  const [isAudioBlocked, setIsAudioBlocked] = useState(true);
  const [isSilentMode, setIsSilentMode] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pendingOrphanSession, setPendingOrphanSession] = useState<PendingOrphanSession | null>(null);
  const audioRef = useRef<AudioPlayerHandle | null>(null);

  // Check if silent mode is selected
  useEffect(() => {
    const settings = StorageManager.getSettings();
    if (settings.selectedAudioId === 'silence') {
      setIsSilentMode(true);
      setIsAudioBlocked(false);
      setIsMuted(true);
    }
  }, []);

  // Check for pending orphan session on mount
  useEffect(() => {
    const pending = StorageManager.getPendingOrphanSession();
    if (pending) {
      setPendingOrphanSession(pending);
    }
  }, []);

  // Listen for orphaned session found event
  useEffect(() => {
    const handleOrphanedSessionFound = (event: Event) => {
      const customEvent = event as CustomEvent<PendingOrphanSession>;
      setPendingOrphanSession(customEvent.detail);
    };

    window.addEventListener('orphanedSessionFound', handleOrphanedSessionFound);
    return () => {
      window.removeEventListener('orphanedSessionFound', handleOrphanedSessionFound);
    };
  }, []);

  // Handle orphan session confirmation
  const handleConfirmOrphanSession = () => {
    if (pendingOrphanSession) {
      window.dispatchEvent(new CustomEvent('confirmOrphanSession', {
        detail: pendingOrphanSession
      }));
      setPendingOrphanSession(null);
    }
  };

  // Handle orphan session denial
  const handleDenyOrphanSession = () => {
    window.dispatchEvent(new CustomEvent('denyOrphanSession'));
    setPendingOrphanSession(null);
  };

  // Initialize user ID and sync with database
  useEffect(() => {
    const initUser = async () => {
      let id = StorageManager.getUserId();

      // If no user ID exists, generate one
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem('om-user-id', id);
      }

      const displayName = StorageManager.getDisplayName();
      setUserId(id);

      try {
        // Initialize user in database (local SQLite or Firebase based on environment)
        const userData = await initializeUser(id, displayName);

        StorageManager.updateLocalStats({
          totalSeconds: userData.totalSeconds || 0,
          lastSession: null,
          sessionsCount: userData.sessionsCount || 0
        });
      } catch (error) {
        console.error('Error initializing user:', error);
        // Database unavailable, running in local-only mode
      }
    };

    initUser();
  }, []);

  // Handle ending the session (from button click)
  const handleEndSession = () => {
    // Stop audio
    audioRef.current?.pause();
    setIsPlaying(false);
    setIsMuted(false);

    // Show entry overlay again
    setIsAudioBlocked(true);

    // Dispatch custom event to notify GlobalCounter to end the session
    window.dispatchEvent(new CustomEvent('endMeditationSession'));
  };

  // Listen for session end events (allows programmatic session ending)
  useEffect(() => {
    const handleSessionEnded = () => {
      // Stop audio and show entry overlay
      audioRef.current?.pause();
      setIsPlaying(false);
      setIsMuted(false);
      setIsAudioBlocked(true);
    };

    window.addEventListener('endMeditationSession', handleSessionEnded);
    return () => {
      window.removeEventListener('endMeditationSession', handleSessionEnded);
    };
  }, []);

  // Handle user interaction to start/toggle audio
  const handleInteraction = async () => {
    const wasBlocked = isAudioBlocked;

    if (isSilentMode) {
      setIsAudioBlocked(false);
      // Trigger session start immediately when tapping past entry screen
      if (wasBlocked) {
        window.dispatchEvent(new CustomEvent('startMeditationSession'));
      }
      return;
    }

    try {
      if (isAudioBlocked || !isPlaying) {
        await audioRef.current?.play();
        setIsPlaying(true);
        setIsMuted(false);
        setIsAudioBlocked(false);
        // Trigger session start immediately when tapping past entry screen
        if (wasBlocked) {
          window.dispatchEvent(new CustomEvent('startMeditationSession'));
        }
      } else if (isMuted) {
        audioRef.current?.setMuted(false);
        setIsMuted(false);
      } else {
        audioRef.current?.setMuted(true);
        setIsMuted(true);
      }
    } catch (error) {
      console.error('Audio interaction failed:', error);
      setIsAudioBlocked(false);
      // Still trigger session start even if audio fails
      if (wasBlocked) {
        window.dispatchEvent(new CustomEvent('startMeditationSession'));
      }
    }
  };

  return (
    <div
      className="relative min-h-screen w-full bg-black text-white/90 select-none overflow-hidden cursor-pointer"
      onClick={handleInteraction}
    >
      <div className="absolute inset-0 z-0 pointer-events-none">
        <BackgroundManager userId={userId} />
      </div>

      <AudioPlayer ref={audioRef} isMuted={isMuted} userId={userId} />

      <div className="relative z-10 flex flex-col items-center justify-between min-h-screen py-10 px-6 pointer-events-none overflow-y-auto">
        {/* Settings Button - Top Right */}
        <div className="absolute top-4 right-4 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="text-primary-40 hover:text-primary transition-colors p-2"
            title="Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        <header className="w-full flex flex-col items-center space-y-2">
          <h2 className="text-[10px] uppercase tracking-[0.5em] text-primary-40 font-bold">Meditating Together</h2>
          <GlobalCounter userId={userId} />
        </header>

        <main className="w-full max-w-4xl flex flex-col items-center space-y-8 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
          <UnifiedTimer />

          {/* End Session Button - only show when session is active */}
          {!isAudioBlocked && (
            <button
              onClick={handleEndSession}
              className="px-8 py-3 border-2 border-red-500/50 rounded-lg text-red-400 text-sm uppercase tracking-[0.3em] font-medium hover:bg-red-500/20 hover:border-red-500 transition-all duration-300"
            >
              End Session
            </button>
          )}
        </main>

        <footer className="w-full relative">
          {/* Left: Stats - absolutely positioned */}
          <div className="pointer-events-auto md:absolute md:left-0 md:bottom-0" onClick={(e) => e.stopPropagation()}>
            <StatsManager userId={userId} />
          </div>

          {/* Center: Sound indicator - always centered */}
          <div className="flex justify-center mt-6 md:mt-0">
            <div
              className={`flex flex-col items-center space-y-3 pointer-events-auto ${isSilentMode ? 'cursor-default' : 'cursor-pointer hover:opacity-80'} transition-opacity`}
              onClick={(e) => {
                e.stopPropagation();
                if (!isSilentMode) {
                  handleInteraction();
                }
              }}
              title={isSilentMode ? 'Silent meditation mode' : (isMuted ? 'Click to unmute' : 'Click to mute')}
            >
              <div className="flex items-center space-x-1.5 h-6">
                {!isMuted && !isAudioBlocked && !isSilentMode ? (
                  [1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="w-1 bg-primary rounded-full animate-pulse"
                      style={{ animationDelay: `${i * 0.1}s`, height: `${40 + Math.random() * 60}%` }}
                    />
                  ))
                ) : (
                  <div className="h-[2px] w-12 bg-primary-20" />
                )}
              </div>
              <span className="text-[10px] uppercase tracking-[0.3em] text-primary-30 font-medium">
                {isSilentMode ? 'Silent Mode' : (isMuted ? 'Muted' : 'Sound Active')}
              </span>
            </div>
          </div>
        </footer>
      </div>

      <SettingsPanel
        userId={userId}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {isAudioBlocked && !pendingOrphanSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xl transition-opacity duration-1000 cursor-pointer"
          onClick={handleInteraction}
        >
          <div className="text-center px-8">
            <h1 className="text-6xl font-cinzel text-white/90 mb-4 drop-shadow-2xl tracking-[0.2em]">MEDITATE</h1>
            <p className="text-primary text-[12px] uppercase tracking-[0.6em] font-bold animate-pulse">
              Tap to Begin
              <br />
              <span className="text-[9px] text-primary-30 mt-4 block tracking-[0.2em]">Your practice starts now</span>
            </p>
          </div>
        </div>
      )}

      {pendingOrphanSession && (
        <SessionConfirmationPopup
          durationSeconds={pendingOrphanSession.durationSeconds}
          onConfirm={handleConfirmOrphanSession}
          onDeny={handleDenyOrphanSession}
        />
      )}
    </div>
  );
};

export default App;
