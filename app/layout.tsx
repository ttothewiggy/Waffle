import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = { title:'Daybook — A little space for your day', description:'Your everyday journal. Words, photographs, and days worth keeping.', manifest:'/manifest.webmanifest', icons:{icon:'/favicon.svg',apple:'/icon-192.png'}, appleWebApp:{capable:true,statusBarStyle:'default',title:'Daybook'} };
export const viewport: Viewport = { width:'device-width',initialScale:1,themeColor:'#203b55' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
