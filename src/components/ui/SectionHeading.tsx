import React from 'react';

interface SectionHeadingProps {
  badge?: string;
  title: string;
  subtitle?: string;
  centered?: boolean;
}

export function SectionHeading({
  badge,
  title,
  subtitle,
  centered = false,
}: SectionHeadingProps) {
  return (
    <div className={`space-y-3 ${centered ? 'text-center max-w-2xl mx-auto' : 'max-w-3xl'}`}>
      {badge && (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/20">
          {badge}
        </span>
      )}
      <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        {title}
      </h2>
      {subtitle && (
        <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
}
