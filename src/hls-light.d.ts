/* hls.js ships its light build (no subtitles, no DRM, a third smaller) under
   its own export with no types of its own; it is the same API. */
declare module 'hls.js/light' {
  export * from 'hls.js';
  export { default } from 'hls.js';
}
