import React from 'react';
import GoldCsvDashboard from './components/GoldCsvDashboard.jsx';
import NewsSection from './components/NewsSection.jsx';

export default function App() {
  return (
    <div className="max-w-7xl mx-auto p-4 space-y-8">
      <GoldCsvDashboard />
      <NewsSection />
    </div>
  );
}
