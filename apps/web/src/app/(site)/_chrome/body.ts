/**
 * Rewrites the design's static-site internal links and asset paths to the app's
 * routes, so a verbatim design body can be server-rendered as-is:
 *   href="features.html" → href="/features"   ·   href="index.html" → href="/"
 *   src="img/x.png"      → src="/site/img/x.png"
 * Also handles the single-quoted hrefs the design embeds inside data-en/data-fr strings.
 */
const PAGES = 'features|pricing|download|about|faq|contact|blog|privacy|terms'

export function siteHtml(html: string): string {
  return html
    .replace(/href="index\.html"/g, 'href="/"')
    .replace(/href='index\.html'/g, "href='/'")
    .replace(new RegExp(`href="(${PAGES})\\.html"`, 'g'), 'href="/$1"')
    .replace(new RegExp(`href='(${PAGES})\\.html'`, 'g'), "href='/$1'")
    .replace(/src="img\//g, 'src="/site/img/')
}
