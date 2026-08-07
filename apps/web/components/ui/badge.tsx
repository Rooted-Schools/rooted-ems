import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
}

const badgeVariants = {
  default: "bg-rooted-green text-white",
  secondary: "bg-rooted-gray-light text-ink",
  destructive: "bg-error/10 text-error",
  outline: "border border-stone/30 text-ink",
  success: "bg-rooted-green/10 text-deep-green",
  warning: "bg-warn/10 text-warn-text",
};

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
        badgeVariants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
