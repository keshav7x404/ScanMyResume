import { Link } from "react-router";

const Navbar = () => {
  return (
    <nav className="navbar bg-gradient-to-r from-[#2A003F] to-[#61045F] px-6 py-4 shadow-md flex justify-between items-center">
      <Link to="/">
        <p className="text-2xl font-bold text-gradient">ScanMyResume</p>
      </Link>
      <Link to="/upload" className="primary-button w-fit">
        Upload Resume
      </Link>
    </nav>
  );
};

export default Navbar;
