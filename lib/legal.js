// Páginas legales (se generan como HTML estático con scripts/build.js).
// Para editarlas: cambia el texto aquí y ejecuta `npm run assets`.
export const UPDATED = '17 de noviembre de 2026';
const SITE = 'Animetrix';
const URL = 'https://www.animetrix.lat';

const nav = (cur) => `<nav class="legal-nav" aria-label="Información legal">${LINKS.map(([s, t]) =>
  `<a href="/${s}"${s === cur ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</nav>`;

export const LINKS = [
  ['terminos', 'Términos'],
  ['privacidad', 'Privacidad'],
  ['cookies', 'Cookies'],
  ['derechos-de-autor', 'Derechos de autor'],
  ['contacto', 'Contacto'],
  ['acerca', 'Acerca de'],
];

const page = (slug, title, description, body) => ({
  slug, title, description,
  html: `<main id="app" class="app legal"><article class="legal-page">
<p class="eyebrow">Información legal</p>
<h1>${title}</h1>
<p class="legal-date">Última actualización: ${UPDATED}</p>
${nav(slug)}
${body}
</article></main>`,
});

export const PAGES = [
  page('terminos', 'Términos y condiciones', `Condiciones de uso del sitio web y la aplicación de ${SITE}.`, `
<p>Bienvenido a ${SITE} (<a href="${URL}">${URL.replace('https://', '')}</a>) y a su aplicación para Android (en adelante, «el Servicio»). Al usar el Servicio aceptas estos términos. Si no estás de acuerdo, no lo uses.</p>

<h2>1. Qué es ${SITE}</h2>
<p>${SITE} es un índice que organiza información pública de películas, series y anime (títulos, sinopsis, imágenes y valoraciones provistas por TMDB) y muestra un reproductor incrustado de un proveedor externo. <strong>${SITE} no aloja, sube ni almacena archivos de video</strong> en sus servidores.</p>

<h2>2. Uso permitido</h2>
<ul>
<li>El Servicio es para uso personal y no comercial.</li>
<li>Debes tener al menos 13 años, o la edad mínima que exija la ley de tu país, para usarlo.</li>
<li>No puedes intentar dañar, sobrecargar o vulnerar el Servicio (ataques, extracción masiva de datos, bots, ingeniería inversa de la API, etc.).</li>
<li>No puedes usar el formulario de pedidos o de contacto para enviar spam, insultos o contenido ilegal.</li>
</ul>

<h2>3. Contenido de terceros</h2>
<p>Los reproductores, imágenes y datos provienen de servicios externos (entre ellos InkaCat y TMDB). ${SITE} no controla ese contenido ni garantiza su disponibilidad, calidad o legalidad en tu país. Cada usuario es responsable de cumplir la legislación que le aplique. Los reproductores externos pueden mostrar su propia publicidad, ajena a ${SITE}.</p>
<p>Este producto usa la API de TMDB, pero no está avalado ni certificado por TMDB.</p>

<h2>4. Derechos de autor</h2>
<p>Respetamos la propiedad intelectual. Si eres titular de derechos y crees que algún contenido accesible desde el Servicio infringe tus derechos, sigue el procedimiento de nuestra página de <a href="/derechos-de-autor">Derechos de autor</a> y lo retiraremos.</p>

<h2>5. Publicidad</h2>
<p>El sitio web y la app pueden mostrar anuncios de terceros, como Google AdSense, para cubrir los costos del Servicio. Más información en la <a href="/privacidad">Política de privacidad</a> y la <a href="/cookies">Política de cookies</a>.</p>

<h2>6. Aplicación para Android</h2>
<p>La aplicación oficial se distribuye únicamente desde nuestro sitio y nuestro repositorio en GitHub. No descargues versiones de otras fuentes: podrían estar modificadas. La app puede enviarte notificaciones de estrenos y avisos; puedes desactivarlas en los ajustes de Android.</p>

<h2>7. Sin garantías</h2>
<p>El Servicio se ofrece «tal cual» y «según disponibilidad». Podemos modificarlo, suspenderlo o retirar títulos en cualquier momento y sin previo aviso. En la medida que lo permita la ley, ${SITE} no será responsable de daños derivados del uso o la imposibilidad de uso del Servicio ni del contenido de terceros.</p>

<h2>8. Cambios</h2>
<p>Podemos actualizar estos términos. La fecha de «Última actualización» indica la versión vigente. Si sigues usando el Servicio después de un cambio, se entiende que lo aceptas.</p>

<h2>9. Ley aplicable</h2>
<p>Estos términos se rigen por las leyes de la República Argentina. Ante cualquier duda, escríbenos desde la página de <a href="/contacto">Contacto</a>.</p>`),

  page('privacidad', 'Política de privacidad', `Qué datos usa ${SITE}, para qué y cómo puedes controlarlos.`, `
<p>En ${SITE} tratamos de usar la menor cantidad de datos posible. <strong>No tenemos cuentas de usuario ni pedimos correo, teléfono o contraseña.</strong></p>

<h2>1. Datos que se guardan en tu dispositivo</h2>
<p>Tu lista, tu historial de «Seguir viendo», el nombre opcional con el que te saludamos y tus preferencias se guardan solo en el almacenamiento local de tu navegador o de la app. No se envían a nuestros servidores y puedes borrarlos cuando quieras (borrando los datos del sitio o de la app, o con el botón «Borrar historial»).</p>

<h2>2. Datos que nos envías</h2>
<ul>
<li><strong>Pedidos y contacto:</strong> cuando usas el formulario de pedidos o de contacto, recibimos lo que escribes (título, mensaje y, si lo indicas, tu nombre, tu usuario de Telegram o tu correo). Lo usamos solo para responderte o atender tu pedido. Se nos entrega mediante un bot privado de Telegram y no se publica.</li>
<li><strong>Registros técnicos:</strong> nuestro proveedor de hosting (Vercel) registra datos técnicos de cada visita, como la dirección IP, el navegador y la página solicitada, por seguridad y para prevenir abusos. Los conservamos por poco tiempo y en nuestros registros de seguridad la IP aparece parcialmente oculta.</li>
<li><strong>Estadísticas:</strong> usamos Vercel Web Analytics, que mide visitas de forma agregada y sin cookies.</li>
</ul>

<h2>3. Publicidad y Google AdSense</h2>
<p>En el sitio web y en la app podemos mostrar anuncios de Google AdSense:</p>
<ul>
<li>Proveedores externos, como Google, usan cookies para mostrar anuncios según las visitas anteriores del usuario a este sitio web y a otros sitios.</li>
<li>Las cookies de publicidad permiten a Google y a sus socios mostrar anuncios basados en las visitas a este sitio o a otros sitios de Internet.</li>
<li>Puedes desactivar la publicidad personalizada en la <a href="https://adssettings.google.com" target="_blank" rel="noopener">Configuración de anuncios de Google</a>, o desactivar las cookies de proveedores externos en <a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener">www.aboutads.info</a>.</li>
<li>Más información sobre cómo Google usa los datos: <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener">Cómo usa Google la información de sitios que usan sus servicios</a>.</li>
</ul>
<p>Si visitas el sitio desde el Espacio Económico Europeo, el Reino Unido o Suiza, te pediremos tu consentimiento antes de usar cookies de publicidad.</p>

<h2>4. Servicios de terceros</h2>
<p>Las imágenes de los títulos se cargan desde TMDB y los reproductores desde InkaCat. Al cargarse, esos servicios reciben tu IP y datos técnicos según sus propias políticas. Si entras a nuestro canal de Telegram, se aplica la política de privacidad de Telegram.</p>

<h2>5. Aplicación para Android</h2>
<p>La app no pide acceso a tus contactos, ubicación, cámara, micrófono ni archivos. Usa Internet, el estado de la red y, si lo permites, las notificaciones. Para avisarte de estrenos consulta periódicamente una lista pública de novedades, sin enviar datos personales. La app muestra anuncios de Google mediante el SDK de anuncios de Google (Google Mobile Ads), que puede usar el identificador de publicidad de Android; puedes restablecerlo o desactivar la personalización en Ajustes de Android → Google → Anuncios. Dentro del reproductor de video, la app bloquea los anuncios emergentes y redirecciones del proveedor externo.</p>

<h2>6. Menores</h2>
<p>El Servicio no está dirigido a menores de 13 años y no recopilamos a sabiendas datos de menores.</p>

<h2>7. Tus derechos</h2>
<p>Puedes pedirnos acceso, corrección o eliminación de los datos que nos hayas enviado por el formulario, desde la página de <a href="/contacto">Contacto</a>. En Argentina, la Agencia de Acceso a la Información Pública es el órgano de control de la Ley 25.326 de Protección de Datos Personales.</p>

<h2>8. Cambios</h2>
<p>Si cambiamos esta política, actualizaremos la fecha de arriba.</p>`),

  page('cookies', 'Política de cookies', `Qué cookies y almacenamiento local usa ${SITE}.`, `
<p>Una cookie es un pequeño archivo que un sitio guarda en tu navegador. El almacenamiento local es algo parecido, pero solo lo lee el propio sitio.</p>

<h2>Lo que usa ${SITE}</h2>
<ul>
<li><strong>Almacenamiento local propio (necesario):</strong> guarda tu lista, tu historial de reproducción, tu nombre opcional y tus preferencias. Nunca sale de tu dispositivo.</li>
<li><strong>Estadísticas (Vercel Web Analytics):</strong> no usa cookies.</li>
<li><strong>Publicidad (Google AdSense, en la web y en la app):</strong> Google y sus socios pueden usar cookies para mostrar anuncios y medir su rendimiento. Detalles en la <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener">política de publicidad de Google</a>.</li>
<li><strong>Reproductores de terceros:</strong> el reproductor incrustado pertenece a otro servicio, que puede usar sus propias cookies.</li>
</ul>

<h2>Cómo controlarlas</h2>
<ul>
<li>Puedes borrar o bloquear las cookies desde los ajustes de tu navegador.</li>
<li>La publicidad personalizada se desactiva en la <a href="https://adssettings.google.com" target="_blank" rel="noopener">Configuración de anuncios de Google</a>.</li>
<li>Si bloqueas el almacenamiento local, el sitio funcionará, pero no recordará tu lista ni tu historial.</li>
</ul>
<p>Más información en nuestra <a href="/privacidad">Política de privacidad</a>.</p>`),

  page('derechos-de-autor', 'Derechos de autor (DMCA)', `Cómo reportar contenido que infringe derechos de autor en ${SITE}.`, `
<p>${SITE} respeta los derechos de propiedad intelectual y atiende los avisos de infracción conforme a la ley de derechos de autor de EE. UU. (DMCA) y a la legislación argentina (Ley 11.723).</p>
<p>${SITE} <strong>no aloja archivos de video</strong>. Los reproductores pertenecen a un proveedor externo. Aun así, retiramos de nuestro índice cualquier título que un titular de derechos nos indique.</p>

<h2>Cómo enviar un aviso</h2>
<p>Envíanos el aviso desde la página de <a href="/contacto">Contacto</a> (motivo «Derechos de autor») con estos datos:</p>
<ol>
<li>Tu nombre y el de la empresa o persona que representas, si es el caso.</li>
<li>La obra protegida que consideras infringida.</li>
<li>El enlace exacto en ${SITE} (por ejemplo, <code>${URL}/ver?t=movie&amp;id=…</code>).</li>
<li>Un medio de contacto (correo electrónico o Telegram).</li>
<li>Una declaración de que actúas de buena fe y de que la información del aviso es exacta, y de que eres el titular de los derechos o estás autorizado a actuar en su nombre.</li>
</ol>

<h2>Qué hacemos</h2>
<p>Revisamos cada aviso válido y, normalmente en un plazo de 48 a 72 horas, retiramos el título del sitio, de la app y del canal. Te confirmamos la baja por el medio de contacto que nos indiques.</p>
<p>Los avisos falsos o de mala fe pueden tener consecuencias legales.</p>`),

  page('contacto', 'Contacto', `Escríbenos: consultas, problemas, privacidad o avisos de derechos de autor.`, `
<p>Responderemos lo antes posible. Para que podamos contestarte, deja tu correo o tu usuario de Telegram.</p>
<div id="contactForm" class="contact-box"><p class="muted">Cargando formulario…</p></div>
<h2>Otros canales</h2>
<ul>
<li>Canal oficial de Telegram: <a href="https://t.me/animetrixlat" target="_blank" rel="noopener">@animetrixlat</a></li>
<li>¿Quieres que agreguemos una película, serie o anime? Usa el <a href="/#/pedir">formulario de pedidos</a>.</li>
<li>Avisos de derechos de autor: lee primero <a href="/derechos-de-autor">cómo enviar un aviso</a>.</li>
</ul>`),

  page('acerca', `Acerca de ${SITE}`, `Qué es ${SITE} y cómo funciona.`, `
<p>${SITE} es un catálogo para descubrir películas, series y anime en español, con fichas, valoraciones, géneros, filtros, una lista personal y una función de «Seguir viendo».</p>
<h2>Cómo funciona</h2>
<ul>
<li>La información de cada título (sinopsis, imágenes, géneros y valoraciones) proviene de <a href="https://www.themoviedb.org" target="_blank" rel="noopener">TMDB</a>. Este producto usa la API de TMDB, pero no está avalado ni certificado por TMDB.</li>
<li>Los reproductores se cargan desde un proveedor externo. ${SITE} no aloja archivos de video.</li>
<li>Las novedades se publican en nuestro canal de Telegram <a href="https://t.me/animetrixlat" target="_blank" rel="noopener">@animetrixlat</a> y en la <a href="/app">app para Android</a>.</li>
</ul>
<h2>Seguridad</h2>
<p>No hay cuentas ni contraseñas. Tu lista se guarda solo en tu dispositivo. El sitio usa HTTPS, cabeceras de seguridad estrictas y límites contra abusos.</p>
<p>¿Dudas o sugerencias? Escríbenos desde la página de <a href="/contacto">Contacto</a>.</p>`),
];
