/* functions/api/[[path]].js — Pages Function: proxy de /api hacia el backend Node.
   El frontend llama a "/api" en el mismo origen, asi que con esta funcion la
   web servida por Cloudflare Pages y la API (Express + SQLite, en otro host)
   quedan bajo el mismo dominio: no hay que tocar CORS ni la CSP del frontend.
   Configurar la variable de entorno API_ORIGIN en el proyecto de Pages. */

const CABECERAS_SALTAR = new Set([
  "host",
  "content-length",
  "content-encoding",
  "set-cookie",
  "cf-connecting-ip",
  "cf-ray",
  "cf-ipcountry",
  "cf-visitor",
  "cf-worker",
  "cdn-loop",
  "cf-colo",
  "forwarded",
  "x-forwarded-proto",
  "x-forwarded-host",
  "x-lc-client-ip",
  "x-lc-proxy-secret"
]);

function limpio(headers) {
  const salida = new Headers();
  for (const [clave, valor] of headers.entries()) {
    if (CABECERAS_SALTAR.has(clave.toLowerCase())) continue;
    salida.append(clave, valor);
  }
  return salida;
}

/* La IP real del cliente. Cloudflare la pone en cf-connecting-ip; x-forwarded-for
   llega con la cadena completa de saltos (navegador -> edge -> worker -> proxy del
   hosting), y el backend la resuelve con LC_TRUST_PROXY. Sin reescribirla, un salto
   de la cadena deja una IP de datacenter en la auditoria y, si esa IP se comparte,
   el rate limiting agrupa a todos los visitantes en el mismo cubo.

   OJO: Railway reemplaza x-forwarded-for por la de su propio borde, por lo que el
   backend no puede reconstruir la IP real a partir de esa cabecera. Por eso la IP
   real tambien se envia firmada en x-lc-client-ip + x-lc-proxy-secret (ver onRequest),
   que el backend ancla a req.ip cuando el secreto coincide. */
function ipReal(headers) {
  return headers.get("cf-connecting-ip") || headers.get("x-real-ip") || "";
}

/* Copia cada Set-Cookie por separado. `Headers.entries()` combina los valores
   del mismo nombre con ", ", lo que fusionaría lc_at y lc_rt en una sola
   cabecera inválida; getSetCookie() las devuelve sueltas. */
function copiarCookies(respuesta, destino) {
  const cookies = typeof respuesta.headers.getSetCookie === "function"
    ? respuesta.headers.getSetCookie()
    : (respuesta.headers.get("set-cookie") ? [respuesta.headers.get("set-cookie")] : []);
  for (const cookie of cookies) destino.append("set-cookie", cookie);
}

export async function onRequest(context) {
  const { request, env } = context;
  const origen = (env.API_ORIGIN || "").trim().replace(/\/+$/, "");

  if (!origen) {
    return new Response(
      JSON.stringify({ error: "API_ORIGIN no esta definido en este proyecto de Pages." }),
      { status: 503, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }
    );
  }

  const url = new URL(request.url);
  const destino = `${origen}${url.pathname}${url.search}`;

  const cabecerasPeticion = limpio(request.headers);
  const ip = ipReal(request.headers);
  if (ip) cabecerasPeticion.set("x-forwarded-for", ip);
  // Railway reescribe x-forwarded-for con la IP de su propio borde, asi que la
  // IP real se ancla aparte, firmada con LC_PROXY_SECRET (mismo valor que en el
  // backend). El backend solo la acepta si el secreto coincide, de modo que
  // nadie que llegue directo a la API puede falsear su IP. La Function conoce la
  // IP real por cf-connecting-ip y es de confianza, por eso puede firmarla.
  const secreto = (env.LC_PROXY_SECRET || "").trim();
  if (ip && secreto) {
    cabecerasPeticion.set("x-lc-client-ip", ip);
    cabecerasPeticion.set("x-lc-proxy-secret", secreto);
  }
  // El borde de Pages siempre atiende por HTTPS: se lo decimos al backend para
  // que marque las cookies de sesión como Secure (el backend no puede deducirlo
  // detrás del proxy porque x-forwarded-proto entrante se descarta).
  cabecerasPeticion.set("x-forwarded-proto", url.protocol.replace(":", ""));

  let respuesta;
  try {
    respuesta = await fetch(destino, {
      method: request.method,
      headers: cabecerasPeticion,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual"
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "No se pudo contactar con el servidor de la API." }),
      { status: 502, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }
    );
  }

  // El runtime ya descomprime la respuesta: hay que quitar content-encoding y
  // content-length o el navegador rechaza la respuesta.
  const cabeceras = limpio(respuesta.headers);
  cabeceras.set("Cache-Control", respuesta.headers.get("Cache-Control") || "no-store");
  copiarCookies(respuesta, cabeceras);

  return new Response(respuesta.body, {
    status: respuesta.status,
    statusText: respuesta.statusText,
    headers: cabeceras
  });
}