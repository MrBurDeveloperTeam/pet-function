import React from 'react';
import type { RunnerPowerup, RunnerPowerupStatus } from '../runnerPowerups';

export const RunnerPowerupIcon: React.FC<{ kind: RunnerPowerup }> = ({ kind }) => (
    <img src={`/games/stadium-hurdles/powerup-${kind}.png`} width="40" height="40" alt="" aria-hidden="true" />
);

export const RunnerPowerupTimers: React.FC<{ status: RunnerPowerupStatus; visible: boolean }> = ({ status, visible }) => {
    if (!visible || (status.magnet <= 0 && status.jetpack <= 0 && !status.landing)) return null;
    return <div className="runner-powerup-timers" aria-label="Active Cat Dash powerups">
        {(['magnet', 'jetpack'] as const).map(kind => {
            const remaining = status[kind];
            if (remaining <= 0 && !(kind === 'jetpack' && status.landing)) return null;
            const name = kind === 'magnet' ? 'MAGNET' : 'JETPACK';
            return <div key={kind} className={`runner-powerup-timer runner-powerup-timer--${kind}`} role="timer"
                aria-label={`${name}: ${remaining > 0 ? `${Math.ceil(remaining)} seconds` : 'landing'}`}>
                <span className="runner-powerup-timer-badge">
                    <RunnerPowerupIcon kind={kind} />
                    <strong aria-hidden="true">{remaining > 0 ? Math.ceil(remaining) : '↓'}</strong>
                </span>
                <span className="runner-powerup-timer-track" aria-hidden="true">
                    {Array.from({ length: 10 }, (_, index) => <span key={index} className="runner-powerup-timer-segment">
                        <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, remaining - index))})` }} />
                    </span>)}
                </span>
            </div>;
        })}
    </div>;
};
