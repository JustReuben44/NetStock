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
      <header>
         <h1> <span className ="brand"> //</span> Netstock</h1>
      </header>
      {children}
    </body>
    </html>
  );
}
