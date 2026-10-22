/** Keep the root page untouched and resolve nested /auto/ assets from the same release. */
export function autoRouteHtml(rootHtml:string) {
  return rootHtml.replace(/<head(\s[^>]*)?>/i,'$&\n    <base href="../">');
}
