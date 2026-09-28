/**
 * Google Maps embed. With NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (a browser key restricted by HTTP referrer)
 * it uses the official Maps Embed API; otherwise it falls back to Google's keyless embed so the
 * location still shows. No server secret is ever involved.
 */
export function MapEmbed({ query, title, className }: { query: string; title: string; className?: string }) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const src = key
    ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}`
    : `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=16&output=embed`;
  return (
    <iframe
      title={title}
      src={src}
      className={className ?? "h-full min-h-72 w-full rounded-2xl border-0"}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      allowFullScreen
    />
  );
}

export function directionsUrl(query: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
}
