import type { Transition, Variants } from "framer-motion";

export const spring = { type: "spring" as const, stiffness: 300, damping: 30 };
export const springStiff = { type: "spring" as const, stiffness: 400, damping: 25 };
export const springSoft = { type: "spring" as const, stiffness: 200, damping: 35 };
export const springBounce = { type: "spring" as const, stiffness: 300, damping: 15 };

export const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: "easeOut" } as Transition,
};

export const fadeInUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: "easeOut" } as Transition,
};

export const fadeInScale = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1 },
  transition: { duration: 0.3, ease: "easeOut" } as Transition,
};

export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.05 },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: spring,
  },
};

export const staggerItemLeft: Variants = {
  initial: { opacity: 0, x: -12 },
  animate: {
    opacity: 1,
    x: 0,
    transition: spring,
  },
};

export const layoutTransition = {
  layout: { type: "spring" as const, stiffness: 300, damping: 30 },
};

export const scaleOnTap = {
  whileTap: { scale: 0.97 },
  transition: springStiff,
};

export const hoverLift = {
  whileHover: { y: -2, transition: springSoft },
};

export const hoverLiftShadow = {
  whileHover: { y: -2, transition: springSoft },
};

export const slideDown = {
  initial: { opacity: 0, y: -8, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.96 },
  transition: spring,
};

export const slideUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
  transition: { duration: 0.2, ease: "easeOut" } as Transition,
};

export const expandCollapse = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: spring,
};

export const bellShake = {
  animate: { rotate: [0, -15, 15, -10, 10, 0] },
  transition: { duration: 0.5 },
};

export const countUpSpring = {
  type: "spring" as const,
  stiffness: 100,
  damping: 20,
};
