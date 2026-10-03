/* functions/api/[[path]].js — Pages Function: proxy de /api hacia el backend Node.
   El frontend llama a "/api" en el mismo origen, asi que con esta funcion la
   web servida por Cloudflare Pages y la API (Express + SQLite, en otro host)
   quedan bajo el mismo dominio: no hay que tocar CORS ni la CSP del frontend.
   Configurar la variable de entorno API_ORIGIN en el proyecto de Pages. */

const CABECERAS_SALTAR = new Set([
  "host",
  "content-length",
  "content-encoding",
  "cf-connecting-ip",
  "cf-ray",
  "cf-ipcountry",
  "cf-visitor",
  "cf-worker",
  "cdn-loop",
  "cf-colo",
  "forwarded",
  "x-forwarded-proto",
  "x-forwarded-host"
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
   el rate limiting agrupa a todos los visitantes en el mismo cubo. Se reescribe con
   la IP real para que la cadena sea la correcta en cualquier hosting.

   OJO: no todos los hostings respetan la cabecera. Railway la reemplaza por la de su
   propio borde, asi que alli la auditoria sigue guardando la IP del proxy (documentado
   en el README). El limite de login no depende de esto: su clave es ip|usuario. */
function ipReal(headers) {
  return headers.get("cf-connecting-ip") || headers.get("x-real-ip") || "";
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

  return new Response(respuesta.body, {
    status: respuesta.status,
    statusText: respuesta.statusText,
    headers: cabeceras
  });
}