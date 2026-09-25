/**
 * Ported verbatim from Content Studio's `src/VirtualPet/components/Ball.tsx`.
 */
import React from 'react';

interface BallProps {
    position: { x: number; y: number };
    isDragging: boolean;
    onPointerDown: (e: React.PointerEvent) => void;
    imageSrc?: string;
    color?: string;
    icon?: string;
}

const Ball: React.FC<BallProps> = ({ position, isDragging, onPointerDown, imageSrc, color, icon }) => {
    return (
        <div
            onPointerDown={onPointerDown}
            className={`absolute h-[120px] w-[120px] cursor-grab active:cursor-grabbing touch-none z-50 flex items-center justify-center select-none transition-transform ${imageSrc || icon ? '' : 'rounded-full shadow-2xl border-2 border-white/50'
                }`}
            style={{
                left: position.x,
                top: position.y,
                transform: 'translate(-50%, -50%)',
                background: imageSrc || icon ? 'none' : (color || 'radial-gradient(circle at 30% 30%, #ff6b6b, #c92a2a)'),
                transition: isDragging ? 'none' : 'transform 0.1s linear'
            }}
        >
            {imageSrc ? (
                <img
                    src={imageSrc}
                    alt=""
                    draggable={false}
                    className="h-[120px] w-[120px] pointer-events-none select-none object-contain [image-rendering:pixelated]"
                />
            ) : icon ? (
                <span className="text-[120px] leading-none pointer-events-none drop-shadow-md">{icon}</span>
            ) : (
                <>
                    {/* Default Ball pattern */}
                    <div className="absolute inset-0 rounded-full border-4 border-white/20"></div>
                    <div className="absolute top-2 left-2 w-4 h-4 bg-white/40 rounded-full blur-sm"></div>
                </>
            )}
        </div>
    );
};

export default Ball;
