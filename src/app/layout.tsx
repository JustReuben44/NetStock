import './globals.css'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html>
      <head>
        <title>Netstock</title>
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}