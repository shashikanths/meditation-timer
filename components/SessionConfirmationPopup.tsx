import { useState } from 'react';

interface SessionConfirmationPopupProps {
  durationSeconds: number;
  onConfirm: () => void;
  onDeny: () => void;
}

/**
 * Popup shown when recovering an abandoned session
 * User must confirm they actually meditated for the recorded duration
 */
export const SessionConfirmationPopup: React.FC<SessionConfirmationPopupProps> = ({
  durationSeconds,
  onConfirm,
  onDeny
}) => {
  const [isConfirmed, setIsConfirmed] = useState(false);

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl">
      <div className="bg-black border border-primary-30 rounded-xl p-8 max-w-md mx-4 shadow-2xl">
        <h2 className="text-2xl font-cinzel text-primary mb-4 text-center">
          Session Recovery
        </h2>

        <p className="text-white/80 text-center mb-6">
          We found an unfinished session of{' '}
          <span className="text-primary font-bold">{formatDuration(durationSeconds)}</span>.
          <br />
          <span className="text-white/60 text-sm mt-2 block">
            Did you actually meditate for this duration?
          </span>
        </p>

        <label className="flex items-start space-x-3 mb-6 cursor-pointer group">
          <input
            type="checkbox"
            checked={isConfirmed}
            onChange={(e) => setIsConfirmed(e.target.checked)}
            className="mt-1 w-5 h-5 rounded border-2 border-primary-40 bg-transparent checked:bg-primary checked:border-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
          />
          <span className="text-white/70 text-sm group-hover:text-white/90 transition-colors">
            I confirm that I meditated for this duration and want to save this session to my stats.
          </span>
        </label>

        <div className="flex space-x-4">
          <button
            onClick={onDeny}
            className="flex-1 px-6 py-3 border border-white/20 rounded-lg text-white/60 text-sm uppercase tracking-wider hover:bg-white/10 hover:text-white transition-all"
          >
            Discard
          </button>
          <button
            onClick={onConfirm}
            disabled={!isConfirmed}
            className={`flex-1 px-6 py-3 rounded-lg text-sm uppercase tracking-wider transition-all ${
              isConfirmed
                ? 'bg-primary text-black font-bold hover:bg-primary/90'
                : 'bg-primary-20 text-white/40 cursor-not-allowed'
            }`}
          >
            Save Session
          </button>
        </div>
      </div>
    </div>
  );
};
