import React from 'react'
import React, { Suspense, lazy } from 'react';
import GoldCsvDashboard from './components/GoldCsvDashboard.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
const NewsSection = lazy(() => import('./components/NewsSection.jsx'));

export default function App() {
  return (
    <div className="max-w-7xl mx-auto p-4 space-y-8">
      <GoldCsvDashboard />
      <ErrorBoundary>
        <Suspense fallback={<div className="p-4 rounded bg-gray-50 border text-gray-700">Cargando sección de noticias…</div>}>
          <NewsSection />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
src/App.jsx
}
import GoldCsvDashboard from './components/GoldCsvDashboard.jsx'
import React, { Suspense, lazy } from 'react';
import GoldCsvDashboard from './components/GoldCsvDashboard.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
const NewsSection = lazy(() => import('./components/NewsSection.jsx'));

export default function App() {
  return (
    <div className="max-w-7xl mx-auto p-4 space-y-8">
      <GoldCsvDashboard />
      <ErrorBoundary>
        <Suspense fallback={<div className="p-4 rounded bg-gray-50 border text-gray-700">Cargando sección de noticias…</div>}>
          <NewsSection />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
// testimport GoldCsvDashboard from './components/GoldCsvDashboard.jsx';
import NewsSection from './components/NewsSection.jsx';

export default function App() {
  return (
    <div className="max-w-7xl mx-auto p-4 space-y-8">
      <GoldCsvDashboard />
      <NewsSection />
    </div>
  );
}
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
}import React from 'react';
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

export default function App() {
  return (
    <div className="max-w-7xl mx-auto p-4">
      <GoldCsvDashboard />
    </div>
  )
}
