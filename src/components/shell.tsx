"use client";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { useState, type ReactNode } from "react";
import { Icon } from "./icon.tsx";

export function Shell({ children, active = "home", authenticated = false, onNew }: { children: ReactNode; active?: string; authenticated?: boolean; onNew?: () => void }) {
  const [open, setOpen] = useState(false);
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className={`sidebar ${open ? "is-open" : ""}`} aria-label="Main navigation">
      <Link className="brand" href="/"><span className="brand-mark"><Icon name="pen" size={23}/></span><span>write<span className="brand-light">with</span>you<span className="brand-dot">.</span></span></Link>
      <p className="sidebar-caption">A LITTLE SPACE FOR BIG IDEAS</p>
      {onNew ? <button className="button sidebar-new" onClick={onNew}><Icon name="plus"/>New essay</button> : <Link className="button sidebar-new" href="/essays?new=1"><Icon name="plus"/>New essay</Link>}
      <nav className="sidebar-nav"><Link className={active === "home" ? "active" : ""} href="/"><Icon name="home"/>Home</Link><Link className={active === "folder" ? "active" : ""} href="/essays?view=folders"><Icon name="folder"/>My folders</Link><Link className={active === "trash" ? "active" : ""} href="/essays?folder=trash"><Icon name="trash"/>Recently deleted</Link></nav>
      <div className="sidebar-tip"><span className="tip-icon"><Icon name="book"/></span><p>Good writing starts<br/>with your own ideas.</p><span>We’ll help you find the words.</span></div>
      <div className="sidebar-bottom"><span className="avatar">Y</span><div><strong>Your writing space</strong><small>One idea at a time</small></div>{authenticated ? <UserButton/> : <Link className="sidebar-signin" href="/sign-in" aria-label="Sign in"><Icon name="arrow" size={17}/></Link>}</div>
    </aside>
    {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setOpen(false)}/>}
    <div className="app-main"><header className="topbar"><div className="topbar-breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setOpen(true)}><Icon name="menu"/></button><span>YOUR WRITING STUDIO</span></div><div className="topbar-right"><span className="private-label"><span className="status-dot"/>A space of your own</span>{!authenticated && <Link className="topbar-login" href="/sign-in">Sign in <Icon name="arrow" size={15}/></Link>}</div></header><main id="main-content">{children}</main><footer className="app-footer"><span>Made for your ideas. Written in your voice.</span><span>writewithyou.</span></footer></div>
  </div>;
}
