import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        outline:
          "border border-border bg-background hover:bg-accent hover:text-accent-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        default: "h-9 px-4 py-2 text-sm rounded-md",
        sm: "h-8 px-3 text-xs rounded-md",
        lg: "h-10 px-6 text-sm rounded-md",
        icon: "h-9 w-9 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export const inputVariants = cva(
  "flex w-full border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        default: "h-9 rounded-md",
        sm: "h-8 rounded-md text-xs px-2.5 py-1.5",
        lg: "h-10 rounded-md",
      },
    },
    defaultVariants: { size: "default" },
  }
);

export const cardVariants = cva(
  "border border-border bg-card text-card-foreground",
  {
    variants: {
      padding: {
        default: "p-6 rounded-lg",
        compact: "p-4 rounded-lg",
        loose: "p-8 rounded-lg",
      },
      shadow: {
        default: "",
        sm: "shadow-sm",
        none: "",
      },
    },
    defaultVariants: { padding: "default", shadow: "default" },
  }
);
