import { NavLink } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";
import "./PageHeader.css";

// Add a { to, label } entry here as each new page/route gets built.
const NAV_LINKS = [
    { to: "/parts-view", label: "Parts view" },
    { to: "/console", label: "Console" },
];

interface PageHeaderProps {
    title: string;
}

export function PageHeader({ title }: PageHeaderProps) {
    return (
        <header className="page-header">
            <div className="page-header-top">
                <img src="/logo.png" alt="Cavanna" className="page-logo" />
                <h1>{title}</h1>
            </div>
            <div className="page-header-right">
                <nav className="page-nav">
                    {NAV_LINKS.map((link) => (
                        // Not `end`: e.g. /parts-view/family/2008 should still highlight "Parts view".
                        <NavLink key={link.to} to={link.to}>
                            {link.label}
                        </NavLink>
                    ))}
                </nav>
                <ThemeToggle />
            </div>
        </header>
    );
}
