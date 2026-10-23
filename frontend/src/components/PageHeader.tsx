import { NavLink } from "react-router-dom";
import "./PageHeader.css";

// Add a { to, label } entry here as each new page/route gets built.
const NAV_LINKS = [{ to: "/", label: "Parts view" }];

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
            <nav className="page-nav">
                {NAV_LINKS.map((link) => (
                    <NavLink key={link.to} to={link.to} end>
                        {link.label}
                    </NavLink>
                ))}
            </nav>
        </header>
    );
}
