/// <reference types="vite/client" />

interface ImportMetaEnv {
    // Id релиза, подставляет платформа при публикации (src/platform/build-id.ts).
    readonly VITE_BUILD_ID?: string;
}
