"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "outline" | "seal";
const variants: Record<Variant, string> = {
  primary: "bg-bone text-ink hover:bg-white",
  ghost: "bg-transparent text-muted hover:text-bone hover:bg-bone/5",
  outline: "border border-hairline text-bone hover:border-muted hover:bg-bone/5",
  // The action that seals something. Verdigris = this grants/confirms authority.
  seal: "bg-verdigris/15 text-verdigris border border-verdigris/40 hover:bg-verdigris/25 hover:border-verdigris/60",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-card px-4 py-2 text-sm font-medium",
        "transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none",
        variants[variant],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
