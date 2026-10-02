import { createApp, files, lakebase, server } from '@databricks/appkit';
import type { AppKitInstance } from './lib/appkit';
import { setupSchema } from './lib/schema';
import { registerAssistantRoutes } from './routes/assistant';
import { registerGraphRoutes } from './routes/graph';
import { registerImageRoutes } from './routes/images';
import { registerNoteRoutes } from './routes/notes';
import { registerSettingsRoutes } from './routes/settings';
import { registerTagRoutes } from './routes/tags';

createApp({
  plugins: [
    lakebase(),
    server({ bodyLimit: '2mb' }),
    files({
      volumes: {
        files: {
          // Writes happen only through /api/images (as the service principal),
          // which picks a per-user path. Over HTTP, users may only read.
          policy: files.policy.any((_action, _resource, user) => !!user.isServicePrincipal, files.policy.publicRead()),
        },
      },
    }),
  ],
  async onPluginsReady(appkit) {
    const app = appkit as unknown as AppKitInstance;
    await setupSchema(app);
    registerNoteRoutes(app);
    registerGraphRoutes(app);
    registerTagRoutes(app);
    registerSettingsRoutes(app);
    registerImageRoutes(app);
    registerAssistantRoutes(app);
  },
}).catch(console.error);
