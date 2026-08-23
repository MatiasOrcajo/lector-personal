import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // react-reader 2.0.15 (epub.js) no es compatible con React StrictMode:
  // el doble montaje de dev destruye el Book mientras abre y su cadena
  // asíncrona queda pidiendo paths inválidos (META-INF/container.xml,
  // OEBPS/...) por XHR -> lector en blanco SOLO en dev. En producción no hay
  // doble montaje por eso funciona.
  reactStrictMode: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
