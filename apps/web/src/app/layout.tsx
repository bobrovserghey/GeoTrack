export const metadata = {
  title: 'GeoTrack',
  description: 'AI visibility audit for your business',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
