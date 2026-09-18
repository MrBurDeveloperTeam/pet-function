import React, { useState } from 'react';
import { bedImageCandidates } from '../bedImages';

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & { src: string };

function ImageAttempt({ src, ...props }: Props) {
  const [attempt, setAttempt] = useState(0);
  const candidates = bedImageCandidates(src);
  return <img {...props} src={candidates[attempt]} onError={() => setAttempt(current => Math.min(current + 1, candidates.length - 1))} />;
}

export function BedImage(props: Props) {
  return <ImageAttempt key={props.src} {...props} />;
}
