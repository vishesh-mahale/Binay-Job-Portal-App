import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/auth-context';

export const metadata: Metadata = {
  title: 'Binay Job Portal',
  description: 'Enterprise recruitment, AI matching and talent platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased min-h-screen flex flex-col" suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
