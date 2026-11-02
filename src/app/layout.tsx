import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'] })

// This tag is rendered before any request-scoped org context exists (no
// subdomain-per-tenant routing yet — everyone shares one domain), so it can't
// name a specific organization's branding without guessing wrong for every
// other tenant. Dashboard pages show the logged-in user's own org name/logo
// via /api/organization instead — this is just the generic browser-tab title.
export const metadata: Metadata = {
  icons: { icon: '/brand/brand-icon.svg' },
  title: 'EDVUNO Portal',
  description: 'EDVUNO student and website management portal',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=document.cookie.match(/(?:^|; )theme=([^;]*)/);var t=m?decodeURIComponent(m[1]):null;if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}})()`,
          }}
        />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
