"use client";

import { MotionConfig, type Transition, type Variants } from "motion/react";
import type { ReactNode } from "react";

/**
 * Shared motion language.
 *
 * One transition and one set of variants keeps every surface moving the same
 * way. `reducedMotion="user"` makes Motion drop transform and opacity animations
 * for anyone who has asked their OS for less movement, so no component has to
 * remember to check.
 */

const EASE_OUT: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 38,
  mass: 0.8,
};

const QUICK: Transition = { duration: 0.18, ease: [0.22, 1, 0.36, 1] };

/** Container that reveals its children one after another. */
export const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

/** Standard entrance: rise and fade. */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: EASE_OUT },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: QUICK },
};

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={EASE_OUT}>
      {children}
    </MotionConfig>
  );
}
