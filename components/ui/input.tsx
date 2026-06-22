import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-card border border-hairline bg-ink px-3 text-sm text-bone",
        "placeholder:text-faint transition-colors focus:border-signal focus:outline-none",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
