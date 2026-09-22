import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

export interface PageTransitionProps {
  screenKey: string;
  children: React.ReactNode;
  onAnimationStart?: () => void;
  onAnimationComplete?: () => void;
}

/**
 * ScrollResetWrapper
 * Ensures whenever a new screen is mounted, all scrollable containers
 * and window scroll positions are reset to the top immediately (before fade-in).
 */
const ScrollResetWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Window & document scroll reset
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }

    // 2. Child container & any scrollable elements reset
    const performScrollReset = () => {
      if (containerRef.current) {
        containerRef.current.scrollTop = 0;
        const scrollables = containerRef.current.querySelectorAll<HTMLElement>(
          '.overflow-y-auto, .overflow-auto, [data-scroll-container]'
        );
        scrollables.forEach((el) => {
          el.scrollTop = 0;
        });
      }
    };

    performScrollReset();
    const frameId = requestAnimationFrame(performScrollReset);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full">
      {children}
    </div>
  );
};

/**
 * "Fade-through-pause" Page Transition
 * -----------------------------------------------------------------------
 * 3-step transition on page change:
 * 1. Current content fade out: opacity 1 -> 0, duration 400ms, ease
 * 2. Brief pause in blank state: ~120ms
 * 3. New content fade in: opacity 0 -> 1, duration 400ms, ease
 *
 * Safety & Reliability:
 * - Strictly opacity only (no scale, zoom, slide, or clip-path)
 * - Accessibility: prefers-reduced-motion triggers instant change with zero duration/delay
 * - Scroll position guaranteed top-reset upon mounting the new page
 */
export const PageTransition: React.FC<PageTransitionProps> = ({
  screenKey,
  children,
  onAnimationStart,
  onAnimationComplete,
}) => {
  const motionReduced = useReducedMotion();
  const [systemReduced, setSystemReduced] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setSystemReduced(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const shouldReduceMotion = Boolean(motionReduced || systemReduced);

  // If user prefers reduced motion, fire completion immediately and render without animation
  useEffect(() => {
    if (shouldReduceMotion) {
      onAnimationComplete?.();
    }
  }, [screenKey, shouldReduceMotion, onAnimationComplete]);

  if (shouldReduceMotion) {
    return (
      <div className="w-full h-full relative overflow-hidden bg-transparent">
        <ScrollResetWrapper key={screenKey}>
          {children}
        </ScrollResetWrapper>
      </div>
    );
  }

  // Standard CSS ease curve: cubic-bezier(0.25, 0.1, 0.25, 1.0)
  const standardEase: [number, number, number, number] = [0.25, 0.1, 0.25, 1.0];

  return (
    <div className="w-full h-full relative overflow-hidden bg-transparent">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={screenKey}
          initial={{ opacity: 0 }}
          animate={{
            opacity: 1,
            transition: {
              duration: 0.4, // Step 3: 400ms fade in
              delay: 0.12,   // Step 2: ~120ms pause in blank state
              ease: standardEase,
            },
          }}
          exit={{
            opacity: 0,
            transition: {
              duration: 0.4, // Step 1: 400ms fade out
              ease: standardEase,
            },
          }}
          onAnimationStart={onAnimationStart}
          onAnimationComplete={onAnimationComplete}
          style={{
            willChange: 'opacity',
          }}
          className="w-full h-full"
        >
          <ScrollResetWrapper>
            {children}
          </ScrollResetWrapper>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default PageTransition;
