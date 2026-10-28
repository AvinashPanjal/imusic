'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './SmoothCarousel.module.css';

interface SmoothCarouselProps {
  children: React.ReactNode;
  className?: string;
  scrollStep?: number;
}

export const SmoothCarousel: React.FC<SmoothCarouselProps> = ({
  children,
  className = '',
  scrollStep = 520,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);

    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll, children]);

  const handleScrollLeft = () => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollBy({ left: -scrollStep, behavior: 'smooth' });
  };

  const handleScrollRight = () => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollBy({ left: scrollStep, behavior: 'smooth' });
  };

  return (
    <div className={`${styles.carouselWrapper} ${className}`}>
      {/* Left Navigation Arrow */}
      <button
        type="button"
        className={`${styles.navArrow} ${styles.navArrowPrev} ${
          canScrollLeft ? styles.navArrowVisible : ''
        }`}
        onClick={handleScrollLeft}
        aria-label="Scroll left"
        tabIndex={canScrollLeft ? 0 : -1}
      >
        <ChevronLeft size={22} />
      </button>

      {/* Main Smooth Scrollable Track */}
      <div ref={containerRef} className={styles.scrollContainer}>
        {children}
      </div>

      {/* Right Navigation Arrow */}
      <button
        type="button"
        className={`${styles.navArrow} ${styles.navArrowNext} ${
          canScrollRight ? styles.navArrowVisible : ''
        }`}
        onClick={handleScrollRight}
        aria-label="Scroll right"
        tabIndex={canScrollRight ? 0 : -1}
      >
        <ChevronRight size={22} />
      </button>
    </div>
  );
};
