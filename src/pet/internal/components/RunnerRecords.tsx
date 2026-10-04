import { useEffect, useRef, useState } from 'react';
import { RIVAL_NOTICE_TEETH, type RunnerRecord } from '../runnerRivals';

const PixelStar = ({ className = '' }: { className?: string }) => <svg className={className} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M6 0h4v4h6v4h-4v4h-2v4H6v-4H4V8H0V4h6z" /></svg>;
const Tooth = () => <svg aria-hidden="true" className="runner-record-tooth" viewBox="0 0 24 26" shapeRendering="crispEdges"><path fill="#a7d1df" d="M4 0h6v2h4V0h6v2h4v14h-2v6h-2v4h-4v-8h-2v-2h-4v2H8v8H4v-4H2v-6H0V2h4z" /><path fill="#fff8df" d="M4 3h6v2h4V3h6v2h1v9h-3v6h-2v-5h-6v5H8v-6H3V5h1z" /><path fill="#224269" d="M5 8h3v3H5zM16 8h3v3h-3zM10 11h4v2h-4z" /></svg>;

export function RunnerAvatar({ record, size = 40 }: { record: RunnerRecord; size?: number }) {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [record.avatarUrl]);
    return <span className="runner-record-avatar" style={{ width: size, height: size }}>
        {record.avatarUrl && !failed ? <img src={record.avatarUrl} alt={`${record.name}'s avatar`} onError={() => setFailed(true)} referrerPolicy="no-referrer" />
            : <svg viewBox="0 0 32 32" shapeRendering="crispEdges" role="img" aria-label={`${record.name}'s avatar`}><path fill="#a7d1df" d="M5 5h7v4h8V5h7v22H5z" /><path fill="#fff1c4" d="M8 12h16v12H8z" /><path fill="#224269" d="M10 15h3v3h-3zM19 15h3v3h-3zM14 21h4v2h-4z" /><path fill="#f6c858" d="M5 26h22v4H5z" /></svg>}
    </span>;
}

export function RunnerRivalNotice({ target, teeth, victory, playing }: { target: RunnerRecord | null; teeth: number; victory: { record: RunnerRecord; count: number; sequence: number } | null; playing: boolean }) {
    if (!playing || (!target && !victory)) return null;
    const record = victory?.record ?? target!;
    const remaining = Math.max(0, record.teeth - teeth);
    const progress = Math.min(1, Math.max(0, (teeth - Math.max(0, record.teeth - RIVAL_NOTICE_TEETH)) / Math.min(RIVAL_NOTICE_TEETH, Math.max(1, record.teeth))));
    return <div key={victory ? `win:${victory.sequence}` : record.id} className={`runner-rival-notice ${victory ? 'runner-rival-victory' : ''}`} role="status" aria-live="polite" aria-label={victory ? `Record passed: ${record.name}, ${record.teeth} teeth` : `Next rival: ${record.name}, ${record.teeth} teeth, ${remaining} teeth away`}>
        <RunnerAvatar record={record} size={44} />
        <div className="runner-rival-copy"><span className="runner-rival-eyebrow">{victory ? 'RECORD PASSED!' : 'NEXT RIVAL'}</span><strong title={record.name}>{record.name}</strong><span className="runner-rival-score"><Tooth /> {record.teeth.toLocaleString()} <small>{victory ? (victory.count > 1 ? `+${victory.count} rivals` : '✓') : remaining ? `${remaining} TO GO` : 'ONE MORE!'}</small></span>
            <span className="runner-rival-track"><span style={{ width: `${victory ? 100 : progress * 100}%` }} /></span></div>
        {victory && <div className="runner-rival-stars" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <PixelStar key={i} className={`runner-rival-star runner-rival-star-${i}`} />)}</div>}
    </div>;
}

export function RunnerRecordsPanel({ records, status, onClose }: { records: RunnerRecord[]; status: string; onClose: () => void }) {
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(() => typeof window !== 'undefined' && window.innerHeight < 500 ? 3 : 5);
    const closeRef = useRef<HTMLButtonElement>(null);
    const pages = Math.max(1, Math.ceil(records.length / pageSize));
    useEffect(() => {
        const resize = () => setPageSize(window.innerHeight < 500 ? 3 : 5);
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, []);
    useEffect(() => { closeRef.current?.focus(); }, []);
    useEffect(() => setPage(current => Math.min(current, pages - 1)), [pages]);
    return <div className="runner-records-shade" onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
        // Keep keyboard focus inside the paused records board.
        if (event.key === 'Tab') {
            const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
            const first = buttons[0], last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
    }}>
        <section className="runner-records-board" role="dialog" aria-modal="true" aria-labelledby="runner-records-heading">
            <div className="runner-records-flags" aria-hidden="true">{Array.from({ length: 15 }, (_, i) => <i key={i} />)}</div>
            <button ref={closeRef} className="runner-records-close" onClick={onClose} aria-label="Close Cat Dash rankings">×</button>
            <h2 id="runner-records-heading">STADIUM RECORDS</h2><p className="runner-records-subtitle">CAT DASH</p>
            <p className="runner-records-status">{status}</p>
            <table><thead><tr><th>RANK</th><th>RUNNER</th><th><Tooth /><span className="runner-records-sr">Teeth</span></th></tr></thead>
                <tbody>{records.slice(page * pageSize, page * pageSize + pageSize).map(record => <tr key={record.id} className={record.isYou ? 'runner-record-own' : ''}>
                    <td><span className={`runner-rank-medal runner-rank-${Math.min(4, record.rank)}`}>{record.rank}</span></td>
                    <td><div className="runner-record-player"><RunnerAvatar record={record} /><span title={record.name}>{record.name}{record.isYou && <small>YOU</small>}</span></div></td>
                    <td>{record.teeth.toLocaleString()}</td>
                </tr>)}</tbody></table>
            {!records.length && <p className="runner-records-empty">Your next run could set the record!</p>}
            <nav aria-label="Rankings pages"><button disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous rankings page">‹</button><span>{page + 1} / {pages}</span><button disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next rankings page">›</button></nav>
            <div className="runner-records-track" aria-hidden="true" />
        </section>
    </div>;
}
