declare module '*.png' {
  // No React Native/Expo, require(...) devolve um "number" (asset id)
  const content: number;
  export default content;
}

declare module '*.jpg'  { const content: number; export default content; }
declare module '*.jpeg' { const content: number; export default content; }
declare module '*.gif'  { const content: number; export default content; }
declare module '*.webp' { const content: number; export default content; }
