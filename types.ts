// This makes the aistudio object available on the window, with type safety.
declare global {
  // FIX: Define a named interface `AIStudio` to avoid type conflicts with other global declarations.
  // The original inline object type for `aistudio` was causing a conflict.
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    // FIX: Made aistudio optional to fix "All declarations of 'aistudio' must have identical modifiers." error.
    aistudio?: AIStudio;
    webkitAudioContext: typeof AudioContext;
  }
}

// Keep this export to ensure the file is treated as a module.
export {};