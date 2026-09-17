import type { ReactNode } from 'react';
import type { AIAdapter } from '../contracts';

export interface MolarChatEmptyStatePrompt {
  label: string;
  /** A lucide-react icon export name (e.g. 'Zap', 'ShieldCheck'). Falls
   *  back to a default icon internally if unrecognized — matches the
   *  pre-extraction DynamicIcon behavior exactly. */
  iconName?: string;
}

export interface MolarChatEmptyState {
  title?: string;
  subtitle?: string;
  /** Clicking a prompt fills the input draft with its label — it does not
   *  auto-send, matching the pre-extraction behavior. */
  prompts?: MolarChatEmptyStatePrompt[];
}

export interface SharedMolarAIProps {
  adapter: AIAdapter;
  disabled?: boolean;
  /** Renders the 🐾 header button when present — omit entirely if the
   *  host has no Virtual Pet concept. The shared UI never imports Virtual
   *  Pet state itself. */
  onPetToggle?: () => void;
  /** Host-supplied, reactively fetched content for the zero-message
   *  welcome state. Omit any field to fall back to the package's own
   *  generic default copy/prompts. */
  emptyState?: MolarChatEmptyState;
  /** Optional host override for the Molar logo image URL. Omitted falls
   *  back to this package's own bundled default asset — exact 0.5.0
   *  behavior. Intended for hosts whose bundler cannot statically
   *  discover/copy this package's internally-bundled asset reference
   *  (e.g. Next.js/Turbopack); Vite-based hosts do not need this. */
  logoUrl?: string;
  /** Host-supplied content rendered inside the opened chat panel, below
   *  the messages/empty-state area and above the composer — e.g. an
   *  app-specific support link. This package renders it as-is and never
   *  interprets its contents; omit entirely for no change from prior
   *  behavior (nothing rendered there). Scrolls naturally with the rest
   *  of the panel, not a second floating layer. */
  footerContent?: ReactNode;
}
