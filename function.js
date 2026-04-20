"use strict";

async function edgeHandler(request) {
  const url = new URL(request.url);

  if (url.pathname === "/" || url.pathname === "") {
    return Response.redirect(new URL("/index.html", url), 302);
  }

  return new Response("Not Found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

if (typeof addEventListener === "function") {
  addEventListener("fetch", (event) => {
    event.respondWith(edgeHandler(event.request));
  });
}

module.exports = {
  fetch: edgeHandler,
  handler: edgeHandler,
  default: edgeHandler,
};
