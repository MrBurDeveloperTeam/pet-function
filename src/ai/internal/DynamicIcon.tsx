'use client';

import * as Icons from 'lucide-react';
import { Zap } from 'lucide-react';

/** Internal — not exported publicly. Resolves a lucide-react icon by its
 *  export name (as stored in host-supplied prompt data), falling back to
 *  Zap when unrecognized — matches Content Studio's pre-extraction
 *  DynamicIcon exactly. */
export function DynamicIcon({ name, ...props }: { name?: string; className?: string }) {
  const IconComponent =
    (name && (Icons as unknown as Record<string, typeof Zap>)[name]) || Zap;
  return <IconComponent {...props} />;
}
