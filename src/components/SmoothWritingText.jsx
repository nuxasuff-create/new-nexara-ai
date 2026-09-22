import React, { useEffect, useRef, useState } from "react";

/**
 * SmoothWritingText
 * -----------------------------------------------------------------------
 * FINAL / APPROVED VERSION.
 *
 * A plain, clean text-streaming animation for the AI's answer — no
 * gradients or shimmer, just each word gently fading + sliding up into
 * place as it arrives, plus a simple blinking cursor at the end while
 * still streaming. Uses an internal queue so it stays smooth even if
 * your backend delivers text in fast/large chunks rather than one word
 * at a time.
 *
 * This is a DISPLAY component, not a fake typing effect — feed it the
 * real, growing answer text as it streams in from your backend.
 *
 * Usage:
 *   <SmoothWritingText text={liveAnswerText} isStreaming={isStreaming} />
 *
 * - `text`: the full answer text so far (grows as tokens/chunks stream in).
 * - `isStreaming`: whether generation is still in progress — controls
 *   whether the blinking cursor is shown at the end.
 *
 * WHY THIS VERSION FEELS INSTANT INSTEAD OF LAGGY:
 *   - No translateY / movement on each word — only a very fast opacity
 *     fade (120ms). Motion is what reads as "slow catching up"; a pure,
 *     short fade reads as instant even though it's technically animated.
 *   - Adaptive "catch-up" pacing: if the backend sends a big chunk of
 *     words at once (queue backlog builds up), the reveal speed ramps
 *     up automatically so it never visibly lags behind what the model
 *     has actually already generated. With a small/no backlog it uses
 *     a relaxed pace; with a large backlog it nearly snaps to real-time.
 * -----------------------------------------------------------------------
 */

// Base delay between revealing consecutive words when the queue is
// roughly caught up (feels like natural typing, not sluggish).
const BASE_DELAY_MS = 22;
// Once the queue backs up past this many pending words, speed ramps up
// so the display catches up to the real stream instead of trailing it.
const CATCHUP_THRESHOLD = 4;
const CATCHUP_DELAY_MS = 4;

export default function SmoothWritingText({ text = "", isStreaming = false }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const queueRef = useRef([]);
  const timerRef = useRef(null);

  const words = text.length ? text.split(" ") : [];

  useEffect(() => {
    const alreadyHandled = visibleCount + queueRef.current.length;
    for (let i = alreadyHandled; i < words.length; i++) {
      queueRef.current.push(i);
    }
    if (!timerRef.current) {
      processQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  function processQueue() {
    if (queueRef.current.length === 0) {
      timerRef.current = null;
      return;
    }
    const nextIndex = queueRef.current.shift();
    setVisibleCount(nextIndex + 1);
    // Speed up automatically when falling behind the real stream.
    const delay = queueRef.current.length > CATCHUP_THRESHOLD ? CATCHUP_DELAY_MS : BASE_DELAY_MS;
    timerRef.current = setTimeout(processQueue, delay);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const visibleWords = words.slice(0, visibleCount);
  const stillCatchingUp = queueRef.current.length > 0;

  return (
    <span className="nw-wrap">
      {visibleWords.map((w, i) => (
        <span key={i} className="nw-word">
          {w}
          {i < visibleWords.length - 1 ? "\u00A0" : ""}
        </span>
      ))}
      {(isStreaming || stillCatchingUp) && <span className="nw-cursor" aria-hidden="true" />}

      <style>{`
        .nw-wrap {
          display: inline;
        }

        .nw-word {
          display: inline-block;
          opacity: 0;
          animation: nwIn 0.12s ease-out forwards;
        }

        @keyframes nwIn {
          to { opacity: 1; }
        }

        .nw-cursor {
          display: inline-block;
          width: 2px;
          height: 1em;
          background: currentColor;
          opacity: 0.6;
          margin-left: 1px;
          vertical-align: text-bottom;
          animation: nwBlink 0.85s steps(1) infinite;
        }

        @keyframes nwBlink {
          0%, 50% { opacity: 0.6; }
          51%, 100% { opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .nw-word {
            animation: none;
            opacity: 1;
          }
          .nw-cursor {
            animation: none;
          }
        }
      `}</style>
    </span>
  );
}
