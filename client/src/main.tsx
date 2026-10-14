import { ResourceStatusIndicator, ResourceStatusProvider, TooltipProvider } from '@databricks/appkit-ui/react';
import { ThemeProvider } from 'next-themes';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { DataProvider } from './components/DataProvider.tsx';
import { SettingsProvider } from './components/SettingsProvider.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <ResourceStatusProvider>
          {/* Also mounts the app's sonner <Toaster />. */}
          <ResourceStatusIndicator />
          <TooltipProvider delayDuration={300}>
            <SettingsProvider>
              <DataProvider>
                <App />
              </DataProvider>
            </SettingsProvider>
          </TooltipProvider>
        </ResourceStatusProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
);
