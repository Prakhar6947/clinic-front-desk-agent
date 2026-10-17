import { NavLink } from "react-router-dom";

export function TopNav() {
  return (
    <nav className="topnav">
      <NavLink to="/" className="topnav-brand">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
        </svg>
        Sunrise Clinic
      </NavLink>

      <div className="topnav-links">
        <NavLink
          to="/"
          end
          className={({ isActive }: { isActive: boolean }) => `topnav-link${isActive ? " active" : ""}`}
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/workbench"
          className={({ isActive }: { isActive: boolean }) => `topnav-link${isActive ? " active" : ""}`}
        >
          Agent Workbench
        </NavLink>
      </div>

      <div className="topnav-spacer" />
      <span className="topnav-tag">Front Desk Agent · Dehradun</span>
    </nav>
  );
}
