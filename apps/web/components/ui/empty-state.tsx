import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, children, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 px-4 text-center", className)}>
      {icon && (
        <span className="text-stone/60 mb-4" aria-hidden="true">
          {icon}
        </span>
      )}
      <h3 className="text-lg font-semibold text-ink mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-stone max-w-sm mb-4">{description}</p>
      )}
      {children}
    </div>
  );
}
