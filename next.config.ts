import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Só em desenvolvimento: deixa o celular (ou outro aparelho da mesma rede Wi-Fi) abrir http://<IP do computador>:3000.
  // Sem isso o Next bloqueia o CSS e o JavaScript dessas conexões e a página aparece sem estilo e sem interação.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
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
