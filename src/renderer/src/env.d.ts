import type { JSX as ReactJSX } from 'react'

declare global {
  const __APP_VERSION__: string
  namespace JSX {
    type Element = ReactJSX.Element
  }
}

declare module '*.css'
