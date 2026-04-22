"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/lib/variants";
import { type VariantProps } from "class-variance-authority";

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onDrag" | "onDragEnd" | "onDragStart" | "onDragEnter" | "onDragExit" | "onDragLeave" | "onDragOver">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  noMotion?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, noMotion, children, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size }), className);

    if (noMotion) {
      return (
        <button className={classes} ref={ref} {...props}>
          {children}
        </button>
      );
    }

    return (
      <motion.button
        className={classes}
        ref={ref}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        {...(props as any)}
      >
        {children}
      </motion.button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
