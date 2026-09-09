/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// pdfmake's browserbundel heeft geen eigen typings en wordt DYNAMISCH geladen (zie pdfDownload.ts).
// De documentdefinitie is wel getypt: die komt uit `pdfmake/interfaces` (@types/pdfmake), dat op zijn
// beurt de globale PDFKit-namespace nodig heeft voor o.a. `fontFeatures`.
/// <reference types="pdfkit" />
declare module 'pdfmake/build/pdfmake.min.js' {
  const pdfMake: unknown;
  export default pdfMake;
}

// Build-time constants injected by Vite's `define` (see vite.config.ts).
declare const __APP_VERSION__: string;
declare const __BUILD_SHA__: string;
declare const __BUILD_DATE__: string;
