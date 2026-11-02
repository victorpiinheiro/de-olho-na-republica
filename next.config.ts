import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Fotos dos presidentes (Wikimedia Commons). A miniatura vem de thumb.wikimedia.org; arquivos menores que
    // 480 px voltam como o original em upload.wikimedia.org. Só esses dois endereços, só a pasta do Commons.
    remotePatterns: [
      { protocol: "https", hostname: "thumb.wikimedia.org", pathname: "/wikipedia/commons/**" },
      { protocol: "https", hostname: "upload.wikimedia.org", pathname: "/wikipedia/commons/**" },
    ],
  },
};

export default nextConfig;
