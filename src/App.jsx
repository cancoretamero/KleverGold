import React from 'react'
import GoldCsvDashboard from './components/GoldCsvDashboard.jsx'
import FloatingMenu from './components/FloatingMenu.jsx'

export default function App() {
  return (
    <div className="relative min-h-screen">
      <FloatingMenu />
      <main className="max-w-7xl mx-auto p-4 pt-28 md:pt-32">
        <GoldCsvDashboard />
      </main>
    </div>
  )
}
