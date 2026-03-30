/// <reference types="vite/client" />

// Global type definitions for TypeScript migration

// Module declarations for files without types
declare module '*.json' {
  const value: any;
  export default value;
}

// Video.js types (basic declarations until proper migration)
declare module 'video.js' {
  const videojs: any;
  export default videojs;
}

// Cytoscape React types
declare module 'react-cytoscapejs' {
  import { ComponentType } from 'react';
  const CytoscapeComponent: ComponentType<any>;
  export default CytoscapeComponent;
}

// AWS SDK imports will use their own types
// SWR, Zustand, and other major libraries have their own type definitions
