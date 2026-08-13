import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

const buttonVariants = {
  default: "bg-rooted-green text-white hover:bg-deep-green",
  destructive: "bg-error text-white hover:bg-error/90",
  outline:
    "border border-stone/30 bg-white text-ink hover:bg-rooted-gray-light",
  secondary: "bg-rooted-gray-light text-ink hover:bg-rooted-gray",
  ghost: "text-ink hover:bg-rooted-gray-light",
  link: "text-rooted-green hover:text-deep-green",
};

// Heights meet the 44px touch-target minimum at `default`, `lg`, and `icon`.
// `sm` stays below it deliberately: it exists for dense table rows where a
// 44px control would break the row rhythm. A `sm` button that is the primary
// action of its row should carry its own min-h-[44px], not shrink the rest.
const buttonSizes = {
  default: "h-11 px-4 py-2",
  sm: "h-9 px-3 text-sm",
  lg: "h-12 px-6 text-lg",
  icon: "h-11 w-11",
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-[6px] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rooted-green focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          buttonVariants[variant],
          buttonSizes[size],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
