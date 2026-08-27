export interface SandboxBridgeAdapter<TEnvironment> {
  readonly provider: string;
  fetch: ExportedHandlerFetchHandler<TEnvironment>;
  scheduled?: ExportedHandlerScheduledHandler<TEnvironment>;
}
