import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// A API interna não tem nada para o buscador (são JSON do próprio site). O resto fica aberto.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: "/api/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
