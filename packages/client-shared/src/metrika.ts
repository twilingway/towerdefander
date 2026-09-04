/**
 * The Yandex.Metrika counter, added when the bundle is built.
 *
 * Deliberately not written into `index.html`. The same pages are opened nine
 * times a run by the end-to-end suite and played through by the visible demo,
 * and every one of those visits would be counted as a player: a metric that
 * mostly measures its own tests is worse than none. Those harnesses run against
 * the dev server, so `apply: "build"` keeps the counter away from them and puts
 * it in the bundle that players actually load.
 *
 * The session recorder is off. It works by watching the page mutate and sending
 * what it sees, and this page is a canvas redrawing sixty times a second beside
 * a HUD that changes with it -- the recording would cost the frame rate it was
 * meant to observe.
 */
export function metrikaSnippet(counterId: number): string {
  const id = String(counterId);
  return `<!-- Yandex.Metrika counter -->
    <script type="text/javascript">
      (function(m,e,t,r,i,k,a){
        m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
      })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=${id}', 'ym');

      ym(${id}, 'init', {ssr:true, webvisor:false, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
    </script>
    <noscript><div><img src="https://mc.yandex.ru/watch/${id}" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
    <!-- /Yandex.Metrika counter -->`;
}

/** The shape Vite needs, declared here so a config file imports no vite types. */
export interface HtmlInjectingPlugin {
  readonly name: string;
  readonly apply: "build";
  transformIndexHtml: (html: string) => string;
}

export function metrikaPlugin(counterId: number): HtmlInjectingPlugin {
  return {
    name: "yandex-metrika",
    apply: "build",
    transformIndexHtml: (html: string): string =>
      html.replace("</head>", `${metrikaSnippet(counterId)}\n  </head>`)
  };
}
