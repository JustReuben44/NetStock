"use client";
import '../globals.css'

import {useState} from 'react';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <>
      <header>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "space-between" , flex: "1"}}>
          <button className="menu" onClick={toggleSidebar}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" width="28" height="28">
  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
</svg>
</button>

          <div style={{ display: "flex", flex: 1, gap: "0.5rem"}}>
          <h1> <a href="/"> <span className="brand"> // </span> Netstock</a></h1>
          </div>

          <div style={{ display: "flex", gap: "1rem" }}>
            <a className= "highlight" href="#">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" width="28" height="28">
  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />
</svg>
</a>
            <a className= "highlight" href="/basket">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" width="28" height="28">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
           </a>
          </div>
        </div>
      </header>


<div style={{ display: "flex", flexGrow: 1 }}>
<div className="sidebar" id="sidebar" style={{ display: isSidebarOpen ? 'flex' : 'none' }}>
  <div>
    <div style={{ display: "flex", flex: 1, gap: "0.5rem", alignItems: "center"}}>
      <h1> <a href="/"> <span className="brand"> // </span> Netstock</a></h1>
    </div>
  </div>
  <button className="sidebar-link" onClick={toggleSidebar} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}> Close</button>
  <a className="sidebar-link" href="#">About</a>
  <a className="sidebar-link" href="#">Services</a>
  <a className="sidebar-link" href="#">Clients</a>
  <a className="sidebar-link" href="#">Contact</a>
</div>
      
    
  <main style={{flexGrow: 1}}>{children}</main>
  </div>
    </>
  );
}