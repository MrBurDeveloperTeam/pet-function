'use client';
import { Mail } from 'lucide-react';

/** Canonical light-only support shortcut for every SNAI panel. */
export function SharedSNAISupportCard() {
  return (
    <a className="snai-support-link" href="https://mail.google.com/mail/?view=cm&fs=1&to=support%40snabbb.com&su=Customer%20Inquiry" target="_blank" rel="noopener noreferrer" aria-label="Email support at support@snabbb.com">
      <span className="snai-support-icon"><Mail width={18} height={18} aria-hidden="true" /></span>
      <span className="snai-support-copy">
        <span className="snai-support-title">Email Support</span>
        <span className="snai-support-meta">Contact support@snabbb.com</span>
      </span>
    </a>
  );
}
