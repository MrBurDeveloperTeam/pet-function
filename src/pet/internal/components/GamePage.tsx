/**
 * Ported verbatim from Content Studio's `src/VirtualPet/components/GamePage.tsx`,
 * with `useGameState` now imported from this package's own shared pet
 * runtime instead of Content Studio's local context.
 *
 * IMPORTANT: this component only owns the generic embedding SHELL (score
 * bridge via postMessage, coin/XP reward crediting, loading overlay, close
 * button, landscape rotate-notice host). The 3 mini-games themselves
 * (Flappy Cat, Pac-Cat, Tetris — their rules, scoring, controls, and game-
 * over logic) are NOT extracted into this package: `GAME_CONFIG` below
 * still points at host-relative `/games/<id>/index.html` iframe URLs
 * exactly as Content Studio's original did. A consuming host must keep
 * serving `public/games/**` unchanged for this component to work — see
 * the Phase 3D final report's asset section for the full rationale.
 */
import React, { useEffect, useState, useRef } from 'react';
import { useGameState } from '../../runtime/SharedPetRuntime';
import type { GameProgressClient } from '../../SharedVirtualPet';
import { runnerRewards } from '../runnerRewards';
import CoinIndicator from './CoinIndicator';
import LevelIndicator from './LevelIndicator';
import { TiArrowBack } from 'react-icons/ti';
import { hasRunnerTutorialBeenSeen, markRunnerTutorialSeen } from '../runnerTutorial';

const GAME_CONFIG: Record<string, { title: string; url: string; icon: string; gradient: string }> = {
    'stadium-hurdles': {
        title: 'Cat Dash',
        url: '/games/stadium-hurdles/index.html',
        icon: '🦷',
        gradient: 'from-teal-400 to-blue-600'
    },
    flappy: {
        title: 'Flappy Cat',
        url: '/games/flappy-cat/index.html',
        icon: '🕊️',
        gradient: 'from-yellow-400 to-orange-500'
    },
    paccat: {
        title: 'Pac-Cat',
        url: '/games/pac-cat/index.html',
        icon: '👻',
        gradient: 'from-blue-400 to-indigo-600'
    },
    tetris: {
        title: 'Tetris',
        url: '/games/tetris/index.html',
        icon: '🧱',
        gradient: 'from-red-400 to-pink-600'
    }
};

/**
 * Animated number component for the "increase" effect
 */
const AnimatedCounter: React.FC<{ value: number }> = ({ value }) => {
    const [displayValue, setDisplayValue] = useState(value);
    const frameRef = useRef<number>(0);
    const startValue = useRef(value);
    const endValue = useRef(value);
    const startTime = useRef(0);
    const duration = 3000; // 1 second animation

    useEffect(() => {
        if (value === displayValue) return;

        // Reset animation state
        startValue.current = displayValue;
        endValue.current = value;
        startTime.current = performance.now();

        const animate = (now: number) => {
            const elapsed = now - startTime.current;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic
            const easedProgress = 1 - Math.pow(1 - progress, 3);

            const current = Math.floor(startValue.current + (endValue.current - startValue.current) * easedProgress);
            setDisplayValue(current);

            if (progress < 1) {
                frameRef.current = requestAnimationFrame(animate);
            }
        };

        frameRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frameRef.current);
    }, [value]);

    return <span>{String(displayValue)}</span>;
};

interface GamePageProps {
    gameId: string;
    onClose: () => void;
    onExitPet: () => void;
    gameProgressClient?: GameProgressClient;
    userId: string | null;
}

export const GamePage: React.FC<GamePageProps> = ({ gameId, onClose, onExitPet, gameProgressClient, userId }) => {
    const [isLoading, setIsLoading] = useState(true);
    const { stats, setStats, addCoins, addXP } = useGameState();
    const [sessionCoins, setSessionCoins] = useState(0);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const activeRunnerId = useRef<string | null>(null);
    const settledRunnerIds = useRef(new Set<string>());
    const [runnerReady, setRunnerReady] = useState(false);
    const runnerInitialized = useRef(false);
    const exitDestination = useRef<'game' | 'pet'>('game');

    const sendRunnerAction = (type: string) => {
        iframeRef.current?.contentWindow?.postMessage({ type }, window.location.origin);
        iframeRef.current?.contentWindow?.focus();
    };

    const refreshRunnerRanking = async (score?: { runId: string; teeth: number; elapsedSeconds: number }) => {
        const send = (entries: unknown[], status: string) => iframeRef.current?.contentWindow?.postMessage({ type: 'RUNNER_LEADERBOARD', entries, status }, window.location.origin);
        if (!gameProgressClient || !userId) { send([], 'Sign in to view the global rankings'); return; }
        try {
            if (score) {
                const result = await gameProgressClient.rpc('cat_dash_submit_run', { p_run_id: score.runId, p_teeth: score.teeth, p_elapsed_seconds: score.elapsedSeconds });
                if (result.error) { send([], 'Rankings unavailable - try again later'); return; }
            }
            const { data, error } = await gameProgressClient.rpc('cat_dash_leaderboard');
            if (error) { send([], 'Rankings unavailable - try again later'); return; }
            send(Array.isArray(data?.entries) ? data.entries : [], data?.scope === 'local' ? 'LOCAL PREVIEW - best run' : 'GLOBAL - best run');
        } catch { send([], 'Rankings unavailable - try again later'); }
    };

    const exitGame = (destination: 'game' | 'pet' = 'game') => {
        exitDestination.current = destination;
        if (gameId === 'stadium-hurdles' && runnerReady) {
            sendRunnerAction('RUNNER_QUIT');
        } else if (destination === 'pet') {
            onExitPet();
        } else onClose();
    };

    const syncGameProgress = async (progress: unknown) => {
        if (!gameProgressClient || !userId) {
            iframeRef.current?.contentWindow?.postMessage({ type: 'SHARED_GAME_PROGRESS_LOCAL_ONLY' }, window.location.origin);
            return;
        }
        const { data, error } = await gameProgressClient.rpc('pet_game_progress_sync', {
            p_game_id: gameId,
            p_progress: progress && typeof progress === 'object' ? progress as Record<string, unknown> : {},
        });
        if (error) {
            console.error('[GamePage] Unable to sync game progress:', error);
            iframeRef.current?.contentWindow?.postMessage({ type: 'SHARED_GAME_PROGRESS_ERROR' }, window.location.origin);
            return;
        }
        iframeRef.current?.contentWindow?.postMessage({ type: 'SHARED_GAME_PROGRESS', progress: data ?? {} }, window.location.origin);
    };

    // Sync score from games
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
            if (gameId === 'stadium-hurdles') {
                const message = event.data;
                if (message?.source !== 'pet-function:stadium-hurdles') return;
                if (message.type === 'RUNNER_READY' && !runnerInitialized.current) {
                    runnerInitialized.current = true;
                    setRunnerReady(true);
                    iframeRef.current?.contentWindow?.postMessage({ type: 'RUNNER_INIT', tutorialSeen: hasRunnerTutorialBeenSeen(userId) }, window.location.origin);
                }
                if (message.type === 'RUNNER_TUTORIAL_STARTED') markRunnerTutorialSeen(userId);
                if (message.type === 'RUNNER_READY' || message.type === 'RUNNER_RANKINGS_REQUEST') void refreshRunnerRanking();
                if (message.type === 'RUNNER_STARTED' && typeof message.runId === 'string') {
                    activeRunnerId.current = message.runId;
                    setSessionCoins(0);
                }
                if (message.type === 'RUNNER_PROGRESS' && message.runId === activeRunnerId.current) {
                    const reward = runnerRewards(message.teeth, message.elapsedSeconds);
                    if (reward) setSessionCoins(reward.coins);
                }
                if (message.type === 'RUNNER_OVER' && message.runId === activeRunnerId.current && !settledRunnerIds.current.has(message.runId)) {
                    const reward = runnerRewards(message.teeth, message.elapsedSeconds);
                    if (!reward) return;
                    settledRunnerIds.current.add(message.runId);
                    if (reward.coins) addCoins(reward.coins);
                    if (reward.xp) addXP(reward.xp);
                    if (message.reason !== 'quit') void refreshRunnerRanking({ runId: message.runId, teeth: message.teeth, elapsedSeconds: message.elapsedSeconds });
                    setSessionCoins(0);
                }
                if (message.type === 'RUNNER_CLOSE') {
                    if (exitDestination.current === 'pet') onExitPet();
                    else onClose();
                }
                return;
            }
            if (event.data?.type === 'SHARED_GAME_PROGRESS_READY' || event.data?.type === 'SHARED_GAME_PROGRESS_SAVE') {
                void syncGameProgress(event.data.progress);
            }
            // Update temporary display score
            if (event.data?.type === 'GAME_SCORE_UPDATE') {
                const totalScore = event.data.score || 0;
                setSessionCoins(Math.floor(totalScore / 100));
            }

            // Persistence: Only add to official total when game ends
            if (event.data?.type === 'GAME_OVER') {
                const totalScore = event.data.score || 0;
                const reward = Math.floor(totalScore / 100);

                if (reward > 0) {
                    // Coins are persisted as their own atomic delta (see
                    // SharedPetRuntime's addCoins/persistCoinsDelta) --
                    // never routed back through a full-stats debounced
                    // save, which no longer writes coins at all.
                    addCoins(reward);
                    setStats(prev => ({
                        ...prev,
                        happiness: Math.min(100, (prev.happiness || 0) + 15)
                    }));
                }
                setSessionCoins(0); // Clear pending
            }
        };

        window.addEventListener('message', handleMessage);
        const pauseRunner = () => {
            if (document.hidden && gameId === 'stadium-hurdles') {
                iframeRef.current?.contentWindow?.postMessage({ type: 'RUNNER_PAUSE' }, window.location.origin);
            }
        };
        document.addEventListener('visibilitychange', pauseRunner);
        return () => {
            window.removeEventListener('message', handleMessage);
            document.removeEventListener('visibilitychange', pauseRunner);
        };
    }, [setStats, addCoins, addXP, gameId, userId, gameProgressClient, onClose, onExitPet]);

    // Prevent scroll when game is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
        };
    }, []);

    if (!gameId || !GAME_CONFIG[gameId]) {
        onClose();
        return null;
    }

    const config = GAME_CONFIG[gameId];
    const isPixelRunner = gameId === 'stadium-hurdles';
    const runnerButton: React.CSSProperties = {
        width: 56, height: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: '#fff0ba', color: '#224269', border: '4px solid #684427',
        boxShadow: '4px 4px 0 #3f2a1b', cursor: 'pointer', gap: 3,
    };

    return (
        <div className="fixed inset-0 z-50 bg-black" style={{ fontFamily: "'Fredoka', sans-serif" }}>
            {/* Container - Full Screen */}
            <div className="relative w-full h-full animate-in zoom-in-95 fade-in duration-300">

                {/* Top UI Area */}
                {!isPixelRunner && <div className="absolute top-6 right-6 z-50 flex flex-col items-end gap-2">
                    <div className="flex items-center gap-3">
                        {/* Session Progress (Pending Coins) */}
                        {sessionCoins > 0 && (
                            <div className="flex items-center gap-1.5 bg-yellow-500/10 backdrop-blur-md px-3 py-1.5 rounded-full border border-yellow-500/20 shadow-sm text-yellow-400 animate-in fade-in slide-in-from-top-2 duration-300">
                                <span className="text-[10px] font-black uppercase tracking-wider opacity-70">Coins</span>
                                <span className="font-black text-sm tracking-widest">+{sessionCoins}</span>
                            </div>
                        )}

                        {/* Accumulated Score Indicator (Persistent Wallet) */}
                        <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2.5 rounded-full border border-white/10 shadow-lg text-white transition-all duration-500 ring-1 ring-white/5">
                            <span className="text-xl">💰</span>
                            <span className="font-black text-lg tracking-widest min-w-[3ch] text-right">
                                <AnimatedCounter value={stats.coins || 0} />
                            </span>
                        </div>

                        {/* Floating Close Button */}
                        <button
                            onClick={() => exitGame()}
                            className="w-12 h-12 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/80 text-white/70 hover:text-white border-2 border-white/10 backdrop-blur-sm transition-all hover:scale-110 active:scale-95 shadow-lg"
                            title="Exit Game"
                        >
                            <span className="text-2xl font-bold leading-none mb-1">×</span>
                        </button>
                    </div>
                </div>}

                {isPixelRunner && <div className="pointer-events-none absolute inset-0 z-50">
                    <button type="button" onClick={() => exitGame('pet')} aria-label="Exit pet page" title="Back"
                        className="pointer-events-auto absolute left-3 top-3 flex h-11 w-11 items-center justify-center text-slate-700 transition-transform hover:-translate-y-0.5 sm:left-6 sm:top-6 sm:h-16 sm:w-16"
                        style={{ background: '#fff8d9', border: '4px solid #5a3a22', borderRadius: 5, boxShadow: '5px 5px 0 rgba(53,35,20,.55)' }}>
                        <TiArrowBack className="h-8 w-8 sm:h-12 sm:w-12" />
                    </button>
                    <CoinIndicator amount={stats.coins || 0} />
                    <div className="pointer-events-auto"><LevelIndicator stats={stats} /></div>
                    <button type="button" onClick={() => exitGame()} aria-label="Return to Sports stadium" title="Return to Sports"
                        className="pointer-events-auto absolute left-3 top-1/2 -translate-y-1/2 transition-transform hover:-translate-x-1 sm:left-6"
                        style={{ ...runnerButton, background: '#5a3a22', borderColor: '#e7b55b', color: '#ffe3a0' }}>
                        <svg viewBox="0 0 24 24" width="32" height="32" shapeRendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M2 10h3V7h3V4h3v5h11v6H11v5H8v-3H5v-3H2z" /></svg>
                    </button>
                    <div className="pointer-events-auto absolute right-3 top-[104px] flex flex-col gap-3 sm:right-6 sm:top-[112px]">
                        <button type="button" disabled={!runnerReady} onClick={() => sendRunnerAction('RUNNER_RANKINGS_OPEN')} aria-label="Cat Dash rankings" title="Rankings" style={runnerButton}>
                            <svg viewBox="0 0 24 24" width="26" height="26" shapeRendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M3 4h18v3H3zM3 10h14v3H3zM3 16h10v3H3z" /></svg>
                        </button>
                        <button type="button" disabled={!runnerReady} onClick={() => sendRunnerAction('RUNNER_TUTORIAL_START')} aria-label="Start Cat Dash tutorial" title="Tutorial" style={runnerButton}>
                            <svg viewBox="0 0 24 24" width="24" height="24" shapeRendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M4 2h16v20H4z" /><path fill="#fff0ba" d="M6 4h12v16H6z" /><path fill="currentColor" d="M8 6h8v2H8zM8 10h8v2H8zM8 14h6v2H8z" /></svg>
                            <span style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 900 }}>GUIDE</span>
                        </button>
                        <button type="button" disabled={!runnerReady} onClick={() => sendRunnerAction('RUNNER_PAUSE_TOGGLE')} aria-label="Pause or resume Cat Dash" title="Pause / Resume" style={runnerButton}>
                            <svg viewBox="0 0 24 24" width="24" height="24" shapeRendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
                        </button>
                    </div>
                </div>}

                {/* Game Iframe Wrapper */}
                <div className="absolute inset-0 bg-slate-900">
                    {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-10">
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                                <span className="text-white/60 text-sm">Loading {config.title}...</span>
                            </div>
                        </div>
                    )}

                    <iframe
                        ref={iframeRef}
                        src={config.url}
                        className="w-full h-full border-0 block"
                        title={config.title}
                        onLoad={() => setIsLoading(false)}
                        allow="autoplay; fullscreen"
                    />
                </div>
            </div>
        </div>
    );
};
