import React, { useEffect, useRef, useState } from "react";

export interface SmoothWritingTextProps {
  text?: string;
  isStreaming?: boolean;
}

/**
 * SmoothWritingText
 * -----------------------------------------------------------------------
 * ADVANCED CHARACTER-BY-CHARACTER TYPING EFFECT.
 *
 * This version mimics the premium, "organic" feel of ChatGPT's response
 * by queuing up incoming characters and revealing them with a slight 
 * variable delay.
 *
 * It uses a high-performance character queue and adaptive pacing:
 * - If the queue is short, it types at a natural, readable pace.
 * - If the backend sends a large burst (chunk), it automatically ramps
 *   up the speed to "catch up" without feeling like it's lagging behind.
 * -----------------------------------------------------------------------
 */
function SmoothWritingTextComponent({ text = "", isStreaming = false }: SmoothWritingTextProps) {
  const [displayedText, setDisplayedText] = useState("");
  const queueRef = useRef<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fullTextRef = useRef(text);

  // Constants for pacing
  const MIN_DELAY = 15; // Moderate catch-up speed (ms)
  const MAX_DELAY = 55; // Natural base speed (ms) - Slower for a more "organic" feel
  const CATCHUP_THRESHOLD = 80; // chars

  useEffect(() => {
    // Determine what's new since the last fullTextRef update
    if (text.length > fullTextRef.current.length) {
      const newChars = text.slice(fullTextRef.current.length).split("");
      queueRef.current.push(...newChars);
      fullTextRef.current = text;

      if (!timerRef.current) {
        processQueue();
      }
    } else if (text.length < fullTextRef.current.length) {
      // If text was reset (e.g., new chat), clear everything
      setDisplayedText(text);
      fullTextRef.current = text;
      queueRef.current = [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  function processQueue() {
    if (queueRef.current.length === 0) {
      timerRef.current = null;
      return;
    }

    // Pull next character
    const char = queueRef.current.shift();
    if (char !== undefined) {
      setDisplayedText((prev) => prev + char);
    }

    // Adaptive delay calculation
    const queueDepth = queueRef.current.length;
    let baseDelay = MAX_DELAY;
    
    if (queueDepth > CATCHUP_THRESHOLD) {
      baseDelay = MIN_DELAY;
    } else if (queueDepth > 0) {
      const ratio = queueDepth / CATCHUP_THRESHOLD;
      baseDelay = MAX_DELAY - (MAX_DELAY - MIN_DELAY) * ratio;
    }

    // Add a tiny bit of random "human" jitter (±15% of delay)
    const jitter = baseDelay * 0.15;
    let finalDelay = baseDelay + (Math.random() * jitter * 2 - jitter);

    // Natural pauses for punctuation
    if (char === '.' || char === '?' || char === '!') {
      finalDelay += 180;
    } else if (char === ',' || char === ';' || char === ':') {
      finalDelay += 80;
    }

    timerRef.current = setTimeout(processQueue, Math.max(1, finalDelay));
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!displayedText && !isStreaming) return null;

  const stillCatchingUp = queueRef.current.length > 0;

  return (
    <span className="typing-wrap">
      {displayedText}
      {(isStreaming || stillCatchingUp) && <span className="typing-cursor" aria-hidden="true" />}

      <style>{`
        .typing-wrap {
          display: inline;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .typing-cursor {
          display: inline-block;
          width: 2px;
          height: 1.1em;
          background: var(--primary);
          margin-left: 2px;
          vertical-align: middle;
          animation: typingPulse 0.8s steps(2, start) infinite;
          box-shadow: 0 0 8px var(--primary);
          will-change: opacity;
        }

        @keyframes typingPulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .typing-cursor {
            animation: none;
          }
        }
      `}</style>
    </span>
  );
}

const SmoothWritingText = React.memo(SmoothWritingTextComponent);
export default SmoothWritingText;
