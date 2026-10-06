import { useEffect, useRef, useState } from 'react';

// A clockwise time trial. Progress follows the continuous track angle, so
// cutting across the lawn or crossing the finish line backwards earns no lap.
export function KartGame({ onClose }: { onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const keys = useRef(new Set<string>());
  const [race, setRace] = useState(0);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState({ lap: 0, seconds: 0, finished: false });
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
      keys.current.add(event.key.toLowerCase());
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase());
    const blur = () => { keys.current.clear(); setPaused(true); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      keys.current.clear();
    };
  }, []);
  const pauseRef = useRef(paused);
  pauseRef.current = paused;
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    let x = 680, y = 250, heading = Math.PI / 2, speed = 0;
    let progress = 0, elapsed = 0, lastAngle = 0, last = 0, frame = 0;
    const draw = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      if (!pauseRef.current && progress < Math.PI * 6) {
        const pressed = keys.current;
        const gas = pressed.has('arrowup') || pressed.has('w');
        const brake = pressed.has('arrowdown') || pressed.has('s') || pressed.has(' ');
        const radius = Math.hypot((x - 400) / 280, (y - 250) / 155);
        const onTrack = radius > 0.72 && radius < 1.28;
        speed = Math.max(0, Math.min(onTrack ? 210 : 55, speed + (gas ? 150 : -55) * dt - (brake ? 270 * dt : 0)));
        const steer = Number(pressed.has('arrowright') || pressed.has('d')) - Number(pressed.has('arrowleft') || pressed.has('a'));
        heading += steer * dt * 2.4 * Math.min(speed / 65, 1);
        x = Math.max(15, Math.min(785, x + Math.cos(heading) * speed * dt));
        y = Math.max(15, Math.min(485, y + Math.sin(heading) * speed * dt));
        const angle = Math.atan2((y - 250) / 155, (x - 400) / 280);
        const delta = Math.atan2(Math.sin(angle - lastAngle), Math.cos(angle - lastAngle));
        if (onTrack) progress = Math.max(0, progress + delta);
        lastAngle = angle;
        elapsed += dt;
      }
      context.fillStyle = '#84b34e'; context.fillRect(0, 0, 800, 500);
      context.beginPath(); context.ellipse(400, 250, 280, 155, 0, 0, Math.PI * 2);
      context.strokeStyle = '#eee5c5'; context.lineWidth = 104; context.stroke();
      context.strokeStyle = '#555b63'; context.lineWidth = 88; context.stroke();
      context.strokeStyle = '#fff4b0'; context.lineWidth = 2; context.setLineDash([16, 16]); context.stroke(); context.setLineDash([]);
      for (let i = 0; i < 8; i++) { context.fillStyle = i % 2 ? '#fff' : '#20252b'; context.fillRect(638 + i * 11, 244, 11, 12); }
      context.fillStyle = '#315d33'; context.font = 'bold 30px sans-serif'; context.textAlign = 'center'; context.fillText('CAT KART', 400, 244);
      context.font = '18px sans-serif'; context.fillText('3 LAPS · CLOCKWISE ↻', 400, 275);
      context.save(); context.translate(x, y); context.rotate(heading);
      context.fillStyle = '#20252b'; context.fillRect(-15, -14, 12, 6); context.fillRect(-15, 8, 12, 6); context.fillRect(5, -14, 10, 6); context.fillRect(5, 8, 10, 6);
      context.fillStyle = '#ef7056'; context.fillRect(-17, -9, 36, 18);
      context.fillStyle = '#fff0cb'; context.beginPath(); context.arc(-2, 0, 7, 0, Math.PI * 2); context.fill(); context.restore();
      setStatus({ lap: Math.min(3, Math.floor(progress / (Math.PI * 2))), seconds: elapsed, finished: progress >= Math.PI * 6 });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [race]);
  const control = (key: string, label: string) => <button type="button" aria-label={label}
    onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); keys.current.add(key); }}
    onPointerUp={() => keys.current.delete(key)} onPointerCancel={() => keys.current.delete(key)}
    style={{ padding: '12px 20px', touchAction: 'none', fontSize: 20 }}>{label}</button>;
  return <section aria-label="Cat Kart time trial" style={{ position: 'fixed', inset: 0, zIndex: 1200, background: '#18392e', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 16, overflow: 'auto' }}>
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <button onClick={onClose}>Back to kart track</button><strong>CAT KART · Lap {status.lap}/3 · {status.seconds.toFixed(1)}s</strong>
      <button onClick={() => setPaused(value => !value)}>{paused ? 'Resume' : 'Pause'}</button>
      <button onClick={() => { keys.current.clear(); setPaused(false); setRace(value => value + 1); }}>Restart race</button>
    </div>
    <p style={{ margin: 0 }}>Arrow keys / WASD: accelerate and steer. Down / Space: brake. Follow the track clockwise.</p>
    <canvas ref={canvas} width={800} height={500} aria-label="Kart race track" style={{ width: 'min(100%, 800px)', maxHeight: '65vh', objectFit: 'contain' }} />
    <div style={{ display: 'flex', gap: 10 }}>{control('arrowleft', '←')}{control('arrowup', 'Accelerate')}{control('arrowdown', 'Brake')}{control('arrowright', '→')}</div>
    {paused && <strong role="status">Race paused</strong>}
    {status.finished && <strong role="status">Finished! Three laps in {status.seconds.toFixed(1)} seconds. Restart to race again.</strong>}
  </section>;
}
