export {}

declare global {
  interface Window {
    api: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      on: (event: string, cb: (payload: unknown) => void) => () => void
      platform: string
    }
  }
}
