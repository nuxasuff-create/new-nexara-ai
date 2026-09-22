import React from "react";

/**
 * WaveformIndicator
 * -----------------------------------------------------------------------
 * FINAL / APPROVED VERSION.
 *
 * A voice-assistant-style audio equalizer waveform, used as the AI
 * "thinking/working" indicator. Five gradient bars bounce up and down
 * at staggered delays (center bars peak higher), giving a lively,
 * premium "processing" feel — similar in spirit to Siri's waveform,
 * but with its own multi-color gradient bars instead of a single tone.
 *
 * Usage:
 *   {isAiWorking && <WaveformIndicator label="Thinking" />}
 *
 * Drop this file into your components folder
 * (e.g. /components/WaveformIndicator.jsx). No external libraries
 * needed — pure CSS animation via a styled <style> tag.
 * -----------------------------------------------------------------------
 */

export default function WaveformIndicator({ label = "Thinking" }) {
  return (
    <div className="wf-wrap" role="status" aria-live="polite">
      <div className="wf-bars" aria-hidden="true">
        <span className="wf-bar wf-bar-1" />
        <span className="wf-bar wf-bar-2" />
        <span className="wf-bar wf-bar-3" />
        <span className="wf-bar wf-bar-4" />
        <span className="wf-bar wf-bar-5" />
      </div>

      {label && <span className="wf-label">{label}</span>}

      <style>{`
        .wf-wrap {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          padding: 6px 4px;
          font-family: inherit;
        }

        .wf-bars {
          display: flex;
          align-items: center;
          gap: 3px;
          height: 24px;
          flex-shrink: 0;
        }

        .wf-bar {
          display: inline-block;
          width: 3.5px;
          border-radius: 3px;
          height: 6px;
          animation: wfBounce 1.1s ease-in-out infinite;
        }

        .wf-bar-1 { background: linear-gradient(180deg, #4285f4, #8b7cf6); animation-delay: 0s; }
        .wf-bar-2 { background: linear-gradient(180deg, #8b7cf6, #d97757); animation-delay: 0.12s; }
        .wf-bar-3 { background: linear-gradient(180deg, #d97757, #ea4c89); animation-delay: 0.24s; }
        .wf-bar-4 { background: linear-gradient(180deg, #ea4c89, #ff8a5c); animation-delay: 0.12s; }
        .wf-bar-5 { background: linear-gradient(180deg, #ff8a5c, #34a853); animation-delay: 0s; }

        @keyframes wfBounce {
          0%, 100% { height: 6px; opacity: 0.6; }
          50% { height: 22px; opacity: 1; }
        }

        .wf-label {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-secondary, #8a8a8a);
        }

        @media (prefers-reduced-motion: reduce) {
          .wf-bar {
            animation: none;
            height: 14px;
          }
        }
      `}</style>
    </div>
  );
}
