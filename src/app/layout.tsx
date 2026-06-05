import './globals.css'
 export const metadata = {
  title: "Netstock",
  description: "Inventory management for Netcalibre",
}

export const viewport = {
  themeColor: "#010f29",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html>
      <head>
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}