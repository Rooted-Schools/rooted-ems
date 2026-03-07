import Link from "next/link";

type LogoSize = "sm" | "md" | "lg" | "xl";

interface LogoProps {
  /** Size variant */
  size?: LogoSize;
  /** Link target — if provided, logo becomes a link */
  href?: string;
  /** Show "Enrollment Management System" subtitle */
  showSubtitle?: boolean;
  /** Additional CSS classes on the wrapper */
  className?: string;
}

const sizeStyles: Record<LogoSize, { text: string; gap: string; subtitle: string }> = {
  sm: { text: "text-base", gap: "gap-1.5", subtitle: "text-xs" },
  md: { text: "text-xl", gap: "gap-2", subtitle: "text-sm" },
  lg: { text: "text-3xl", gap: "gap-2.5", subtitle: "text-base" },
  xl: { text: "text-4xl", gap: "gap-3", subtitle: "text-lg" },
};

function LogoMark({ size = "md", showSubtitle = false, className = "" }: Omit<LogoProps, "href">) {
  const s = sizeStyles[size];

  return (
    <div className={`inline-flex flex-col ${className}`}>
      <span className={`${s.text} tracking-wide`}>
        <span className="text-rooted-green font-bold">rooted</span><span className="text-gray-800 font-medium">schools</span>
      </span>
      {showSubtitle && (
        <span className={`${s.subtitle} text-gray-500 tracking-wide`}>
          Enrollment Management System
        </span>
      )}
    </div>
  );
}

export function Logo({ href, ...rest }: LogoProps) {
  if (href) {
    return (
      <Link href={href} className="inline-flex no-underline hover:opacity-90 transition-opacity">
        <LogoMark {...rest} />
      </Link>
    );
  }

  return <LogoMark {...rest} />;
}
