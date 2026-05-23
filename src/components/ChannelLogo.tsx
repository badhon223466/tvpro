import React, { useState } from 'react';

interface ChannelLogoProps {
  logo: string;
  name: string;
  className?: string; // Sizing and override classes
  fallbackClassName?: string;
}

export function isLogoUrl(logo: string): boolean {
  if (!logo) return false;
  const clean = logo.trim();
  // Safe detection of URLs (either starting with http/https, starting with / or containing a domain name and extension)
  return (
    clean.startsWith('http://') ||
    clean.startsWith('https://') ||
    clean.startsWith('/') ||
    (clean.includes('.') && clean.includes('/') && !clean.includes(' '))
  );
}

export default function ChannelLogo({
  logo,
  name,
  className = "max-h-14 max-w-[85%] object-contain rounded-lg drop-shadow-md",
  fallbackClassName = "text-3xl drop-shadow-lg font-bold font-sans text-neutral-400 select-none",
}: ChannelLogoProps) {
  const [hasError, setHasError] = useState(false);

  const cleanLogo = logo ? logo.trim() : '';

  if (cleanLogo && isLogoUrl(cleanLogo) && !hasError) {
    return (
      <img
        src={cleanLogo}
        alt={name}
        className={className}
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
      />
    );
  }

  // Fallback to text/emoji representation if not a URL or if image load failed
  const displayText = cleanLogo && !isLogoUrl(cleanLogo) ? cleanLogo : '📺';

  return (
    <span className={fallbackClassName}>
      {displayText}
    </span>
  );
}
