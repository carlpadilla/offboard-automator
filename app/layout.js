import './globals.css'; // <-- Make sure this is here!
import { ThemeProvider } from './context/ThemeContext';
import NextAuthSessionProvider from "./providers/SessionProvider";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <NextAuthSessionProvider>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </NextAuthSessionProvider>
      </body>
    </html>
  );
}
