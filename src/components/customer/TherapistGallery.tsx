'use client';

import React, { useState } from 'react';
import Image from 'next/image';

interface TherapistGalleryProps {
  images: string[];
  therapistName: string;
}

export function TherapistGallery({ images, therapistName }: TherapistGalleryProps) {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  if (!images || images.length === 0) {
    return null;
  }

  const currentImage = images[selectedImageIndex] || images[0];

  return (
    <div className="space-y-3">
      {/* Primary Display Image */}
      <div className="relative aspect-4/3 w-full overflow-hidden rounded-2xl bg-slate-100 border border-slate-200 shadow-sm">
        <Image
          src={currentImage}
          alt={`${therapistName} photo ${selectedImageIndex + 1}`}
          fill
          priority
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover transition-all duration-300"
        />
      </div>

      {/* Thumbnail List */}
      {images.length > 1 && (
        <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
          {images.map((img, idx) => {
            const isSelected = idx === selectedImageIndex;
            return (
              <button
                key={img + idx}
                type="button"
                onClick={() => setSelectedImageIndex(idx)}
                aria-label={`View photo ${idx + 1} of ${therapistName}`}
                className={`relative h-16 sm:h-20 w-20 sm:w-24 shrink-0 overflow-hidden rounded-xl border-2 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                  isSelected
                    ? 'border-emerald-600 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 hover:border-slate-300 opacity-70 hover:opacity-100'
                }`}
              >
                <Image
                  src={img}
                  alt={`Thumbnail ${idx + 1}`}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
