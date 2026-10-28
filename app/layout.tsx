import React from 'react';

export const metadata = { title: 'MeReporter', description: 'Authentic SEO reporting: stored or live data only, never fabricated.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, background: '#fff', color: '#111' }}>
        <header
          style={{
            background: '#FF863B',
            color: '#fff',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <a href="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: 800, fontSize: 20 }}>
            MeReporter
          </a>
          <nav style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <a
              href="/login"
              style={{
                background: '#fff',
                color: '#e56a1f',
                padding: '8px 18px',
                borderRadius: 999,
                textDecoration: 'none',
                fontWeight: 700,
              }}
            >
              Login
            </a>
            <a
              href="/login"
              style={{
                border: '2px solid #fff',
                color: '#fff',
                padding: '6px 16px',
                borderRadius: 999,
                textDecoration: 'none',
                fontWeight: 700,
              }}
            >
              Sign up
            </a>
          </nav>
        </header>
        <main style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>{children}</main>
      </body>
    </html>
  );
}
