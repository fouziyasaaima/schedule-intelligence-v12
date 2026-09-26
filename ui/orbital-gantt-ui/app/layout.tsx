import "./globals.css";
import { ConnectionProvider } from "@/lib/connection";
import { AuthProvider } from "@/lib/auth";
import { NotificationCenter } from "@/components/NotificationCenter";

export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export const metadata = {
  title: "Schedule Intelligence",
  description: "AI-powered scheduling — pure Gantt, beyond thinking.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{__html:`(function(){try{var t=localStorage.getItem('orbital-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}})()`}} />
        <AuthProvider><ConnectionProvider>{children}<NotificationCenter /></ConnectionProvider></AuthProvider>
      </body>
    </html>
  );
}
