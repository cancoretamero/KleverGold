import React from 'react';
import GoldNewsCarousel from './GoldNewsCarousel.jsx';

export default function NewsSection() {
  return (
    <section className="max-w-6xl mx-auto py-8 px-4">
      <GoldNewsCarousel title="Titulares de Oro" endpoint="/api/gold-news" />
    </section>
  );
}
