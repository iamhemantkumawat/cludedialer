interface BrandLogoProps {
  context: "sidebar" | "login" | "boot";
  subtitle?: string;
}

export function BrandLogo({ context, subtitle }: BrandLogoProps) {
  return (
    <div className={`brand-lockup brand-lockup--${context}`}>
      <img className="brand-logo" src="/brand/logo.png" alt="CyberX Dialer" />
      {subtitle ? <div className="brand-subtitle">{subtitle}</div> : null}
    </div>
  );
}
