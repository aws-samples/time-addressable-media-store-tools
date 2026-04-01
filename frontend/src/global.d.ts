/// <reference types="vite/client" />

// Global type definitions for TypeScript migration

// Module declarations for files without types
declare module '*.json' {
  const value: Record<string, unknown>;
  export default value;
}
