// Types for the server-side 'electron' shim — only the surface the mirrored
// core modules actually use (app.getPath/getVersion, shell.*, protocol.*).

export declare const app: {
  getPath(name: 'userData' | 'documents' | 'exe' | string): string
  getVersion(): string
}

export declare const shell: {
  trashItem(absPath: string): Promise<void>
  openPath(path: string): never
  showItemInFolder(path: string): never
  openExternal(url: string): never
}

export declare const protocol: {
  registerSchemesAsPrivileged(schemes: unknown[]): void
  handle(scheme: string, handler: (req: Request) => Promise<Response> | Response): void
}
