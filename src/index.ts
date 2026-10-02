#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

// stdout es el canal JSON-RPC: cualquier console.log aqui corrompe el protocolo.
await createServer().connect(new StdioServerTransport());
