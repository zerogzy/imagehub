import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ToastContainer } from '@/components/toast-container';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'ImageHub - 私有媒体图床',
  description: '私有媒体图床系统，支持分组、标签、搜索、随机轮换、批量管理',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className={inter.variable}>
      <body className="min-h-screen bg-background font-sans">
        {children}
        <ToastContainer />
      </body>
    </html>
  );
}
