declare module 'archiver' {
  export class ZipArchive {
    constructor(options?: { zlib?: { level?: number } });
    pipe(destination: NodeJS.WritableStream): void;
    append(content: string | Buffer, options: { name: string; date?: Date; mode?: number }): void;
    finalize(): Promise<void>;
    on(event: 'error' | 'close', listener: (...args: unknown[]) => void): void;
  }
}
