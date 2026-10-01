#!/usr/bin/env node
import { authorizeInteractively } from './auth.js';

authorizeInteractively().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
