'use client';

import React, { useState, useEffect } from 'react';

interface FavoriteButtonProps {
  therapistId: string;
  initialIsFavorite?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function FavoriteButton({
  therapistId,
  initialIsFavorite = false,
  className = '',
  size = 'md',
}: FavoriteButtonProps) {
  const [isFavorite, setIsFavorite] = useState<boolean>(initialIsFavorite);
  const [loading, setLoading] = useState<boolean>(false);

  // Load persisted favorite state from database if initialIsFavorite was not explicitly true
  useEffect(() => {
    let active = true;

    async function checkFavoriteState() {
      try {
        const res = await fetch('/api/account/favorites');
        if (!active || !res.ok) return;

        const data = await res.json();
        if (Array.isArray(data.favorites)) {
          const isFav = data.favorites.some(
            (f: { therapistId: string }) => f.therapistId === therapistId
          );
          if (active) setIsFavorite(isFav);
        }
      } catch {
        // Silently ignore unauthenticated / network errors
      }
    }

    if (!initialIsFavorite && therapistId) {
      checkFavoriteState();
    }

    return () => {
      active = false;
    };
  }, [therapistId, initialIsFavorite]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setLoading(true);

    try {
      const res = await fetch('/api/account/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ therapistId }),
      });

      if (res.status === 401) {
        alert('Please sign in or verify your customer account to save favorite therapists.');
        return;
      }

      const data = await res.json();
      if (res.ok && typeof data.isFavorite === 'boolean') {
        setIsFavorite(data.isFavorite);
      }
    } catch {
      // Ignore network errors
    } finally {
      setLoading(false);
    }
  };

  const buttonSizeClasses =
    size === 'sm'
      ? 'w-8 h-8 text-sm'
      : size === 'lg'
      ? 'px-4 py-2.5 text-sm gap-2 rounded-xl border border-slate-200 shadow-xs'
      : 'w-10 h-10 text-base';

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={loading}
      aria-busy={loading}
      aria-label={isFavorite ? 'Remove from favorites' : 'Save as favorite'}
      className={`inline-flex items-center justify-center rounded-full transition-transform active:scale-95 disabled:opacity-50 cursor-pointer ${
        size === 'lg'
          ? isFavorite
            ? 'bg-rose-50 text-rose-600 border-rose-200 font-bold'
            : 'bg-white text-slate-700 hover:bg-slate-50 font-semibold'
          : 'bg-white/90 backdrop-blur-xs text-rose-500 shadow-xs hover:bg-white'
      } ${buttonSizeClasses} ${className}`}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin shrink-0" />
      ) : (
        <span className={isFavorite ? 'text-rose-500' : 'text-slate-400'}>
          {isFavorite ? '♥' : '♡'}
        </span>
      )}
      {size === 'lg' && (
        <span>
          {loading
            ? 'Updating...'
            : isFavorite
            ? 'Saved to Favorites'
            : 'Save as Favorite'}
        </span>
      )}
    </button>
  );
}
