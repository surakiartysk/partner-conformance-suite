// Vite's `?raw` suffix imports a file as a string. Declared here rather than by
// pulling in `vite/client`, whose DOM-flavoured globals this Worker does not have.
declare module '*?raw' {
  const content: string
  export default content
}
