'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, RefreshCcw } from 'lucide-react';
import type { AIMessage } from '../contracts';
import type { SharedMolarAIProps } from './presentation';
import { DynamicIcon } from './internal/DynamicIcon';
import { MolarMarkdown } from './internal/MolarMarkdown';
import molarAiLogo from '../assets/ai/ai_logo.png';

const ERROR_TEXT = 'SNAI Error: Unable to process request.';

/**
 * Public Molar AI entry point: floating trigger button + chat panel.
 *
 * Owns the GENERIC chat lifecycle only — open/closed state, conversation
 * history, input draft, loading/error presentation, submit mechanics,
 * scroll-to-latest, clear conversation, and all visual presentation
 * (ported from Content Studio's MolarAIFloat.jsx/MolarChat.jsx, values
 * preserved exactly, not redesigned). Every actual response — General
 * Chat, Data-Driven Chat, Gemini calls, Supabase reads — is entirely the
 * host's `adapter.sendMessage()` implementation; this component only ever
 * sees the final `AIResponse.text`.
 */
export function SharedMolarAI({ adapter, disabled = false, onPetToggle, emptyState, logoUrl, footerContent }: SharedMolarAIProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<AIMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [badgeText, setBadgeText] = useState('Meow! \u{1F43E}');
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const texts = disabled ? ['Log In', 'Get Started'] : ['Ask Me', 'Try Me!', 'SNAI'];
    let i = 0;
    setBadgeText(texts[0]);
    const interval = setInterval(() => {
      i = (i + 1) % texts.length;
      setBadgeText(texts[i]);
    }, 2000);
    return () => clearInterval(interval);
  }, [disabled]);

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const handleSendMessage = async (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.();
    if (disabled) return;
    const msg = chatInput.trim();
    if (!msg || isLoading) return;

    const historyBeforeThisMessage = chatHistory;
    setChatInput('');
    setChatHistory((prev) => [...prev, { role: 'user', text: msg }]);
    setIsLoading(true);

    try {
      const response = await adapter.sendMessage({ text: msg, history: historyBeforeThisMessage });
      setChatHistory((prev) => [...prev, { role: 'model', text: response.text }]);
    } catch {
      setChatHistory((prev) => [...prev, { role: 'model', text: ERROR_TEXT }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const handleClear = () => {
    setChatHistory([]);
    adapter.reset?.();
  };

  const prompts = emptyState?.prompts ?? [];

  return (
    <div className="snabbb-molar-experience">
      {!isOpen && (
        <div className="molar-ai-trigger-wrapper">
          <div className="molar-ai-trigger-inner">
            <div className="molar-ai-badge-slot">
              <AnimatePresence mode="wait">
                <motion.div
                  key={badgeText}
                  initial={{ opacity: 0, y: 5, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -5, scale: 0.9 }}
                  className="molar-ai-badge"
                >
                  {badgeText}
                </motion.div>
              </AnimatePresence>
            </div>
            <button
              onClick={() => {
                if (!disabled) setIsOpen(true);
              }}
              disabled={disabled}
              className={`molar-ai-trigger-btn ${disabled ? 'molar-ai-trigger-btn--disabled' : ''}`}
            >
              <img
                src={logoUrl ?? molarAiLogo}
                alt="Molar AI"
                className={`molar-ai-trigger-icon ${disabled ? 'molar-ai-trigger-icon--disabled' : ''}`}
              />
            </button>
          </div>
        </div>
      )}

      {isOpen && (
        <>
          <div className="molar-chat-backdrop" onClick={() => setIsOpen(false)} />
          <div className="molar-chat-panel">
            <div className="molar-chat-ambience">
              <div className="molar-chat-ambience-blob molar-chat-ambience-blob--a" />
              <div className="molar-chat-ambience-blob molar-chat-ambience-blob--b" />
              <div className="molar-chat-ambience-noise" />
            </div>

            <div className="molar-chat-header">
              <div className="molar-chat-header-title">
                <span className="molar-chat-header-title-sn">SN</span>
                <span className="molar-chat-header-title-ai">AI</span>
              </div>
              <div className="molar-chat-header-actions">
                {onPetToggle && (
                  <button onClick={onPetToggle} className="molar-chat-header-btn" title="Virtual Pet">
                    <span className="molar-chat-header-pet-emoji">{'\u{1F43E}'}</span>
                  </button>
                )}
                <button onClick={handleClear} className="molar-chat-header-btn" title="Clear conversation" aria-label="Clear conversation">
                  <RefreshCcw className="molar-chat-header-icon" />
                </button>
                <button onClick={() => setIsOpen(false)} className="molar-chat-header-btn" aria-label="Close chat">
                  <X className="molar-chat-header-icon molar-chat-header-icon--close" />
                </button>
              </div>
            </div>

            <div className="molar-chat-messages">
              {chatHistory.length === 0 && (
                <div className="molar-chat-empty">
                  {emptyState?.title && <h3 className="molar-chat-empty-title">{emptyState.title}</h3>}
                  {emptyState?.subtitle && <p className="molar-chat-empty-subtitle">{emptyState.subtitle}</p>}
                  {prompts.length > 0 && (
                    <div className="molar-chat-empty-prompts">
                      {prompts.map((p, idx) => (
                        <button key={idx} onClick={() => setChatInput(p.label)} className="molar-chat-empty-prompt">
                          <div className="molar-chat-empty-prompt-icon-wrap">
                            <DynamicIcon name={p.iconName} className="molar-chat-empty-prompt-icon" />
                          </div>
                          <span className="molar-chat-empty-prompt-label">{p.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="molar-chat-message-list">
                {chatHistory.map((msg, idx) => {
                  const isUser = msg.role === 'user';
                  return (
                    <div key={idx} className={`molar-chat-message-row ${isUser ? 'molar-chat-message-row--user' : 'molar-chat-message-row--model'}`}>
                      <div className={`molar-chat-bubble ${isUser ? 'molar-chat-bubble--user' : 'molar-chat-bubble--model'}`}>
                        <MolarMarkdown text={msg.text} isUser={isUser} />
                      </div>
                    </div>
                  );
                })}

                {isLoading && (
                  <div className="molar-chat-message-row molar-chat-message-row--model">
                    <div className="molar-chat-loading-bubble">
                      <div className="molar-chat-loading-dot" style={{ animationDelay: '-0.3s' }} />
                      <div className="molar-chat-loading-dot" style={{ animationDelay: '-0.15s' }} />
                      <div className="molar-chat-loading-dot" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>

            {footerContent && (
              <div className="molar-chat-extra-footer">
                {footerContent}
              </div>
            )}

            <div className="molar-chat-footer">
              <form onSubmit={handleSendMessage} className="molar-chat-input-form">
                <div className="molar-chat-input-shell">
                  <input
                    ref={inputRef}
                    className="molar-chat-input"
                    placeholder="Ask SNAI..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || isLoading}
                    className={`molar-chat-send-btn ${chatInput.trim() && !isLoading ? 'molar-chat-send-btn--active' : 'molar-chat-send-btn--inactive'}`}
                  >
                    <Send className="molar-chat-send-icon" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
