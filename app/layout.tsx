import React from 'react';

export const metadata = { title: 'MeReporter', description: 'Authentic SEO reporting: stored or live data only, never fabricated.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, background: '#fff', color: '#111' }}>
        <header style={{ background: '#FF863B', color: '#fff', padding: '12px 20px', fontWeight: 700 }}>MeReporter</header>
        <main style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>{children}</main>
      </body>
    </html>
  );
}
