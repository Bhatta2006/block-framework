declare module 'archiver' {
  export class ZipArchive {
    constructor(options?: { zlib?: { level?: number } });
    pipe(destination: NodeJS.WritableStream): void;
    append(content: string | Buffer, options: { name: string }): void;
    finalize(): void;
    on(event: 'error' | 'close', listener: (...args: unknown[]) => void): void;
  }
}
